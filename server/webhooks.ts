import type { Express, Request, Response } from "express";
import * as db from "./db";
import { getConfig } from "./db";
import { transcribeAudio } from "./_core/voiceTranscription";

/**
 * Webhooks de mensageria (WhatsApp). Rotas Express puras — Z-API e a
 * Cloud API da Meta chamam direto, sem tRPC.
 */
export function registerWhatsappWebhookRoutes(app: Express) {
  registerZapiWebhook(app);
  registerBuddhaMktWebhook(app);
}

// ===== Z-API (por unidade) =====

interface ZapiWebhookPayload {
  type?: string;
  phone?: string;
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
      telefone: payload.phone,
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
