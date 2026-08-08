import type { Express, Request, Response } from "express";
import * as db from "./db";
import { getConfig } from "./db";
import { transcribeAudio } from "./_core/voiceTranscription";
import { drizzle } from "drizzle-orm/mysql2";
import { mysqlTable, int, varchar, text, timestamp, boolean } from "drizzle-orm/mysql-core";
import { eq } from "drizzle-orm";

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
  registerZapiWebhook(app);
  registerBuddhaMktWebhook(app);
  registerDeployWebhook(app);
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
  text?: { message?: string };
  image?: { imageUrl?: string; caption?: string };
  audio?: { audioUrl?: string };
  document?: { documentUrl?: string; fileName?: string };
}

function registerZapiWebhook(app: Express) {
  app.post("/api/webhooks/zapi/:unidadeId", async (req: Request, res: Response) => {
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

    // Só processa mensagens recebidas de verdade — ignora eco de envio
    // (fromMe) e mensagens de grupo, que não são atendimento 1:1.
    if (payload.type !== "ReceivedCallback" || payload.fromMe || payload.isGroup || !payload.phone) {
      res.status(200).json({ ignored: true });
      return;
    }

    if (jaProcessada(payload.messageId)) {
      res.status(200).json({ ignored: true, motivo: "duplicado" });
      return;
    }

    // Contato via anúncio "clique para WhatsApp" às vezes chega com o
    // telefone ofuscado como "@lid" — não existe API pra converter @lid
    // em número real (restrição de privacidade do WhatsApp). Nesse caso
    // usamos o próprio chatLid como identificador estável: dá pra
    // responder normalmente, só não sabemos o número de verdade ainda.
    const ehLid = payload.phone.includes("@lid") || (!payload.phone.match(/^\d+$/) && !!payload.chatLid);
    const identificadorContato = ehLid ? (payload.chatLid ?? payload.phone) : payload.phone;

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

    const conversaId = await db.upsertInboxConversa({
      unidadeId,
      canal: "zapi",
      telefone: identificadorContato,
      chatLid: payload.chatLid,
      isLidPendente: ehLid,
      nomeContato: payload.senderName,
      ultimaMensagemTexto: resumo,
      incrementarNaoLidas: true,
    });

    if (!conversaId) {
      res.status(500).json({ error: "falha ao registrar conversa" });
      return;
    }

    const mensagemId = await db.insertInboxMensagem({
      conversaId,
      direcao: "recebida",
      tipo,
      conteudo,
      metadados: metadados ? JSON.stringify(metadados) : null,
    });

    if (tipo === "audio" && payload.audio?.audioUrl && mensagemId) {
      // Assíncrono — não bloqueia a resposta ao webhook.
      transcribeAudio({ audioUrl: payload.audio.audioUrl, language: "pt" })
        .then((result) => {
          if ("text" in result) {
            return db.updateInboxMensagemTranscricao(mensagemId, result.text);
          }
        })
        .catch((error) => console.error("[Webhook Z-API] Falha na transcrição:", error));
    }

    res.status(200).json({ success: true });
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
