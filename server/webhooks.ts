import type { Express, Request, Response } from "express";
import * as db from "./db";
import { getConfig } from "./db";
import { transcribeAudio } from "./_core/voiceTranscription";
import { drizzle } from "drizzle-orm/mysql2";
import { mysqlTable, int, varchar, text, timestamp, boolean } from "drizzle-orm/mysql-core";
import { eq } from "drizzle-orm";
import { sendTelegramParaRecepcao } from "./telegramApi";
import { zapiApi } from "./zapiApi";
import { storagePut, storageGetSignedUrl } from "./storage";
import { pipeInboxMedia } from "./inboxMediaProxy";

// Tabela deploy_pending para comunicação entre webhook (sandbox) e cron (produção)
const deployPending = mysqlTable("deploy_pending", {
  id: int("id").autoincrement().primaryKey(),
  commit: varchar("commit", { length: 64 }),
  message: text("message"),
  migrations: text("migrations"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  processed: boolean("processed").default(false).notNull(),
});

async function getDb() {
  if (!process.env.DATABASE_URL) return null;
  try { return drizzle(process.env.DATABASE_URL); } catch { return null; }
}

/**
 * Webhooks de mensageria (WhatsApp). Rotas Express puras — Z-API e a
 * Cloud API da Meta chamam direto, sem tRPC.
 */
export function registerWhatsappWebhookRoutes(app: Express) {
  registerInboxMediaRoute(app);
  registerZapiWebhook(app);
  registerBuddhaMktWebhook(app);
  registerDeployWebhook(app);
  registerTelegramTestRoute(app);
}

function registerInboxMediaRoute(app: Express) {
  app.get("/api/inbox-media/*", async (req: Request, res: Response) => {
    const key = (req.params as Record<string, string>)[0];
    try {
      await pipeInboxMedia(key, res, storageGetSignedUrl);
    } catch (error) {
      console.error("[InboxMediaProxy] failed:", error);
      if (!res.headersSent) res.status(502).send("Inbox media unavailable");
    }
  });
}

/**
 * Rota de teste pontual pro bot do Telegram (BotFather) — mesmo
 * padrão/token do webhook de deploy acima, pra dar pra disparar um
 * envio de teste via curl sem precisar de sessão logada. Fica aqui
 * (infra reutilizável), não é descartável: qualquer teste futuro do
 * bot pode usar a mesma rota.
 */
function registerTelegramTestRoute(app: Express) {
  app.post("/api/telegram/teste", async (req: Request, res: Response) => {
    const token = req.headers["x-deploy-token"] as string | undefined;
    const expectedToken = process.env.DEPLOY_WEBHOOK_TOKEN;
    if (!expectedToken || token !== expectedToken) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const texto = (req.body?.texto as string) || "🤖 Teste de integração — Buddha Spa CRM conectado ao Telegram com sucesso.";
      await sendTelegramParaRecepcao(texto);
      res.status(200).json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}

/**
 * Webhook de deploy — o Claude (ou qualquer ferramenta externa)
 * chama POST /api/deploy com um token simples para avisar que
 * terminou uma mudança no GitHub. O Manus monitora esse endpoint
 * e faz pull + migração + publish automaticamente.
 */
function registerDeployWebhook(app: Express) {
  app.post("/api/deploy", async (req: Request, res: Response) => {
    const token = req.headers["x-deploy-token"] as string | undefined;
    const expectedToken = process.env.DEPLOY_WEBHOOK_TOKEN;
    if (!expectedToken || token !== expectedToken) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { commit, message, migrations } = req.body as {
      commit?: string;
      message?: string;
      migrations?: string[];
    };
    // Log do webhook para o Manus detectar via devserver.log
    console.log(`[DEPLOY_WEBHOOK] commit=${commit || "unknown"} message=${message || ""} migrations=${JSON.stringify(migrations || [])}`);
    // Gravar no banco para o auto-deploy cron detectar (funciona entre sandbox e produção)
    try {
      const database = await getDb();
      if (database) {
        await database.insert(deployPending).values({
          commit: commit || null,
          message: message || null,
          migrations: JSON.stringify(migrations || []),
        });
        console.log(`[DEPLOY_WEBHOOK] Marcador gravado no banco: commit=${commit || "unknown"}`);
      } else {
        console.error("[DEPLOY_WEBHOOK] Banco não disponível");
      }
    } catch (e) {
      console.error("[DEPLOY_WEBHOOK] Erro ao gravar marcador no banco:", e);
    }
    res.status(200).json({
      success: true,
      received: {
        commit: commit || null,
        message: message || null,
        migrations: migrations || [],
      },
      timestamp: new Date().toISOString(),
    });
  });
}

// Z-API pode reentregar o mesmo evento (retry de rede). Dedup simples em
// memória por messageId, com expiração curta — mesmo padrão do mobai-crm.
const mensagensRecentes = new Map<string, number>();
const DEDUP_TTL_MS = 5 * 60 * 1000;

function jaProcessada(messageId: string | undefined): boolean {
  if (!messageId) return false;
  const agora = Date.now();
  for (const [id, ts] of Array.from(mensagensRecentes.entries())) {
    if (agora - ts > DEDUP_TTL_MS) mensagensRecentes.delete(id);
  }
  if (mensagensRecentes.has(messageId)) return true;
  mensagensRecentes.set(messageId, agora);
  return false;
}

// ===== Z-API (por unidade) =====

interface ZapiWebhookPayload {
  type?: string;
  phone?: string;
  chatLid?: string;
  messageId?: string;
  senderName?: string;
  fromMe?: boolean;
  isGroup?: boolean;
  // Só vêm preenchidos quando isGroup=true (confirmado contra
  // developer.z-api.io/webhooks/on-message-received-examples).
  // chatName = nome do grupo; participantPhone/senderName = quem
  // dentro do grupo mandou essa mensagem específica (muda a cada uma,
  // diferente do resto do payload que descreve a conversa).
  chatName?: string;
  participantPhone?: string;
  participantLid?: string;
  text?: { message?: string };
  image?: { imageUrl?: string; caption?: string };
  audio?: { audioUrl?: string };
  document?: { documentUrl?: string; fileName?: string };
}

function registerZapiWebhook(app: Express) {
  app.post("/api/webhooks/zapi/:unidadeId", async (req: Request, res: Response) => {
    try {
      const unidadeId = Number(req.params.unidadeId);
      if (!Number.isFinite(unidadeId)) {
        res.status(400).json({ error: "unidadeId inválido" });
        return;
      }

      const unidade = await db.getUnidadeById(unidadeId);
      const token = typeof req.query.token === "string" ? req.query.token : undefined;
      if (!unidade?.zapiToken || token !== unidade.zapiToken) {
        res.status(401).json({ error: "token inválido" });
        return;
      }

      const payload = req.body as ZapiWebhookPayload;

      // fromMe (recepção mandou) NÃO é ignorado: quando alguém responde
      // direto pelo app do WhatsApp Business no celular (fora do CRM),
      // é assim que ficamos sabendo — ver dedup por zapiMessageId
      // abaixo pra não duplicar o que já foi registrado na hora do
      // envio pelo próprio CRM. Mensagem de grupo também não é mais
      // ignorada (2026-08-12, a pedido do usuário) — vira uma conversa
      // completa no Inbox, ver tratamento de isGroup logo abaixo.
      if (payload.type !== "ReceivedCallback" || !payload.phone) {
        res.status(200).json({ ignored: true });
        return;
      }

      if (jaProcessada(payload.messageId)) {
        res.status(200).json({ ignored: true, motivo: "duplicado" });
        return;
      }

      if (payload.fromMe && payload.messageId && await db.existeMensagemComZapiMessageId(payload.messageId)) {
        res.status(200).json({ ignored: true, motivo: "já registrada pelo envio via CRM" });
        return;
      }

      let identificadorContato = payload.phone;
      let ehLid = false;
      let nomeResolvidoPorLid: string | undefined;
      let fotoUrlResolvidaPorLid: string | undefined;

      // Grupo nunca vem como "@lid" (o ID do grupo, sufixo "-group", já
      // é o identificador definitivo) — pula toda a resolução abaixo,
      // que é só pra contato individual via anúncio "clique para WhatsApp".
      if (!payload.isGroup) {
        // Contato via anúncio "clique para WhatsApp" às vezes chega com o
        // telefone ofuscado como "@lid". Bug real encontrado: zapiApi.resolveLid
        // já existia (GET /contacts/{lid}, confirmado funcional no mobai-crm),
        // mas nunca era chamado aqui — todo @lid ficava permanentemente
        // "pendente" mesmo quando a Z-API conseguia resolver. Só cai pro
        // fallback "pendente" (usando o próprio chatLid como identificador
        // estável) se a resolução falhar de verdade.
        //
        // Checagem estrita — só pelo literal "@lid" em payload.phone,
        // igual ao mobai-crm (webhooks.ts:1066 lá). Chegou a existir aqui
        // uma condição extra (`!phone.match(/^\d+$/) && chatLid`) achando
        // que "não é dígito puro + tem chatLid" também era sinal de @lid —
        // mobai-crm prova que não é: chatLid vem preenchido MESMO quando
        // phone já é o número real (webhooks.ts:1107-1109 lá, "Phone é
        // número real mas chatLid também veio"), então aquela condição
        // extra classificava contato com número real como pendente à toa
        // (foi exatamente o que aconteceu com um cliente novo — o número
        // real já tinha chegado no payload e foi escondido sem necessidade).
        const ehLidBruto = payload.phone.includes("@lid");
        identificadorContato = ehLidBruto ? (payload.chatLid ?? payload.phone) : payload.phone;
        ehLid = ehLidBruto;

        if (ehLidBruto && !(unidade.zapiInstanceId && unidade.zapiToken && unidade.zapiClientToken)) {
          console.warn(`[Webhook Z-API] @lid ${identificadorContato} não resolvido: faltam credenciais Z-API (instanceId/token/clientToken) na unidade ${unidadeId}.`);
        }
        if (ehLidBruto && unidade.zapiInstanceId && unidade.zapiToken && unidade.zapiClientToken) {
          try {
            const resolvido = await zapiApi.resolveLid(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, identificadorContato);
            if (resolvido) {
              identificadorContato = resolvido.phone;
              ehLid = false;
              nomeResolvidoPorLid = resolvido.name || undefined;
              fotoUrlResolvidaPorLid = resolvido.imgUrl || undefined;
            }
          } catch (error) {
            console.error("[Webhook Z-API] Falha ao resolver @lid:", error);
          }
        }
      }

      let tipo: "texto" | "imagem" | "audio" | "documento" = "texto";
      let conteudo = payload.text?.message ?? "";
      let metadados: Record<string, unknown> | null = null;

      if (payload.image?.imageUrl) {
        tipo = "imagem";
        conteudo = payload.image.caption ?? "";
        metadados = { url: payload.image.imageUrl, legenda: payload.image.caption };
      } else if (payload.audio?.audioUrl) {
        tipo = "audio";
        metadados = { url: payload.audio.audioUrl };
      } else if (payload.document?.documentUrl) {
        tipo = "documento";
        metadados = { url: payload.document.documentUrl, fileName: payload.document.fileName };
      }

      const resumo = conteudo || (tipo !== "texto" ? `[${tipo}]` : "");

      // Puxa o nome de Clientes (Belle) quando o telefone bate — mesmo
      // padrão do mobai-crm, pra Inbox não depender só do nome que o
      // WhatsApp manda. Só tenta quando o número é real (não @lid ainda
      // não resolvido, nem grupo — grupo não é 1 cliente, não tem como
      // bater telefone).
      const clienteId = (ehLid || payload.isGroup) ? undefined : await db.buscarClienteIdPorTelefone(identificadorContato);

      // Busca foto de perfil se não veio do LID e não é fromMe. Só chama a
      // Z-API quando a conversa ainda não tem fotoUrl salva — evita
      // rechamar em toda mensagem recebida, candidato real a rate limit
      // silencioso. Grupo usa um endpoint diferente: /profile-picture é
      // voltado a contato individual e não devolve nada pra ID de grupo
      // (confirmado testando em produção) — /chats/{phone} (getGroupPhoto)
      // devolve profileThumbnail pra qualquer chat, grupo incluso. A URL
      // que a Z-API devolve é um link temporário do WhatsApp (expira e
      // passa a responder 403) — baixa a imagem uma vez e guarda no
      // storage do próprio CRM, mesmo padrão já usado pra mídia de
      // mensagens do Inbox, pra nunca depender desse link expirar.
      let fotoUrlContato: string | undefined = fotoUrlResolvidaPorLid;
      if (!payload.fromMe && !fotoUrlContato && unidade.zapiInstanceId && unidade.zapiToken && unidade.zapiClientToken) {
        try {
          const jaTemFoto = await db.inboxConversaTemFoto(identificadorContato);
          if (!jaTemFoto) {
            const fotoWhatsappUrl = payload.isGroup
              ? await zapiApi.getGroupPhoto(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, identificadorContato)
              : await zapiApi.getProfilePicture(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, identificadorContato);
            if (fotoWhatsappUrl) {
              const imgResp = await fetch(fotoWhatsappUrl);
              if (imgResp.ok) {
                const buffer = Buffer.from(await imgResp.arrayBuffer());
                const contentType = imgResp.headers.get("content-type") || "image/jpeg";
                const chaveSegura = identificadorContato.replace(/[^a-zA-Z0-9_-]/g, "_");
                const { url: storedUrl } = await storagePut(`inbox-fotos-perfil/${chaveSegura}.jpg`, buffer, contentType);
                fotoUrlContato = storedUrl;
              } else {
                console.warn(`[Webhook Z-API] profile-picture ${identificadorContato} → link do WhatsApp expirado/inválido (HTTP ${imgResp.status})`);
              }
            }
          }
        } catch (error) {
          console.error("[Webhook Z-API] Falha ao buscar/armazenar foto de perfil:", error);
        }
      }

      const conversaId = await db.upsertInboxConversa({
        unidadeId,
        canal: "zapi",
        telefone: identificadorContato,
        chatLid: payload.chatLid,
        isLidPendente: ehLid,
        isGrupo: payload.isGroup,
        clienteId,
        fotoUrl: fotoUrlContato,
        // "senderName" nesse payload é o nome de quem mandou — só faz
        // sentido atualizar o nome do contato quando é ele mandando
        // (recebida); num fromMe não teria como significar "nome do
        // contato" e o campo pode nem vir preenchido do mesmo jeito.
        // Se o @lid foi resolvido agora e a Z-API não mandou senderName
        // (comum em mensagem antiga reprocessada), usa o nome que veio
        // do próprio resolveLid. Em grupo, o nome da CONVERSA é o nome
        // do grupo (chatName) — senderName ali é de quem mandou aquela
        // mensagem específica, não do grupo.
        nomeContato: payload.isGroup
          ? payload.chatName
          : (payload.fromMe ? undefined : (payload.senderName ?? nomeResolvidoPorLid)),
        ultimaMensagemTexto: resumo,
        incrementarNaoLidas: !payload.fromMe,
      });

      if (!conversaId) {
        res.status(500).json({ error: "falha ao registrar conversa" });
        return;
      }

      const mensagemId = await db.insertInboxMensagem({
        conversaId,
        direcao: payload.fromMe ? "enviada" : "recebida",
        // Quem dentro do grupo mandou essa mensagem — só em recebida
        // (fromMe é a própria recepção, não um participante do grupo).
        ...(payload.isGroup && !payload.fromMe ? {
          participanteTelefone: payload.participantPhone,
          participanteNome: payload.senderName,
        } : {}),
        tipo,
        conteudo,
        metadados: metadados ? JSON.stringify(metadados) : null,
        zapiMessageId: payload.fromMe ? (payload.messageId ?? null) : null,
      });

      if (tipo === "audio" && payload.audio?.audioUrl && mensagemId) {
        // Assíncrono — não bloqueia a resposta ao webhook.
        transcribeAudio({ audioUrl: payload.audio.audioUrl, language: "pt" })
          .then((result) => {
            if ("text" in result) {
              // Whisper retorna string vazia pra áudio curto/sem fala — sem
              // esse fallback o resultado "com sucesso, mas vazio" fica
              // indistinguível de "ainda não transcreveu" na tela (a UI só
              // renderiza quando transcricao é truthy).
              return db.updateInboxMensagemTranscricao(mensagemId, result.text.trim() || "(sem fala identificada)");
            }
            console.error("[Webhook Z-API] Transcrição recusada:", result.code, result.details ?? result.error);
          })
          .catch((error) => console.error("[Webhook Z-API] Falha na transcrição:", error));
      }

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("[Webhook Z-API] Falha ao processar:", error);
      res.status(500).json({
        error: error.message ?? String(error),
        causa: error.cause?.message ?? error.cause ?? null,
      });
    }
  });
}

// ===== Buddha Mkt (WhatsApp Cloud API, conta única) =====

function registerBuddhaMktWebhook(app: Express) {
  // Handshake de verificação exigido pela Meta ao cadastrar o webhook.
  app.get("/api/webhooks/buddha-mkt", async (req: Request, res: Response) => {
    const verifyToken = await getConfig("buddha_mkt_verify_token");
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && verifyToken?.valor && token === verifyToken.valor) {
      res.status(200).send(challenge);
      return;
    }
    res.status(403).send("Verificação falhou");
  });

  app.post("/api/webhooks/buddha-mkt", async (req: Request, res: Response) => {
    // Estrutura padrão da Cloud API: entry[].changes[].value.{messages,contacts}
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const mensagem = change?.messages?.[0];

    if (!mensagem) {
      res.status(200).json({ ignored: true });
      return;
    }

    const contato = change?.contacts?.[0];
    const telefone: string = mensagem.from;
    const nomeContato: string | undefined = contato?.profile?.name;

    let tipo: "texto" | "imagem" | "audio" | "documento" = "texto";
    let conteudo = "";
    if (mensagem.type === "text") {
      tipo = "texto";
      conteudo = mensagem.text?.body ?? "";
    } else if (mensagem.type === "image") {
      tipo = "imagem";
    } else if (mensagem.type === "audio") {
      tipo = "audio";
    } else if (mensagem.type === "document") {
      tipo = "documento";
    }

    // unidadeId fica null aqui — resolver a unidade certa (cruzando o
    // telefone com o cliente correspondente em cada unidade no Belle)
    // é trabalho de uma fase futura, quando o canal for ativado de
    // verdade (ver "Fora de escopo" no plano).
    const conversaId = await db.upsertInboxConversa({
      unidadeId: null,
      canal: "buddha_mkt",
      telefone,
      nomeContato,
      ultimaMensagemTexto: conteudo || `[${tipo}]`,
      incrementarNaoLidas: true,
    });

    if (conversaId) {
      await db.insertInboxMensagem({
        conversaId,
        direcao: "recebida",
        tipo,
        conteudo,
        metadados: null,
      });
    }

    res.status(200).json({ success: true });
  });
}
