import { ENV } from "./_core/env";

/**
 * Cliente mínimo do Bot API do Telegram (BotFather) — base pra avisos
 * automáticos pro grupo da recepção (2026-08-10). Token e chat id vêm
 * de env vars (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID_GRUPO_RECEPCAO),
 * nada hardcoded.
 */
export async function sendTelegramMessage(chatId: string, texto: string): Promise<void> {
  if (!ENV.telegramBotToken) throw new Error("TELEGRAM_BOT_TOKEN não configurado");

  const url = `https://api.telegram.org/bot${ENV.telegramBotToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: texto }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage falhou: ${response.status} ${body}`);
  }
}

/** Atalho pro grupo fixo da recepção — o único destino usado até agora. */
export async function sendTelegramParaRecepcao(texto: string): Promise<void> {
  if (!ENV.telegramChatIdGrupoRecepcao) throw new Error("TELEGRAM_CHAT_ID_GRUPO_RECEPCAO não configurado");
  await sendTelegramMessage(ENV.telegramChatIdGrupoRecepcao, texto);
}
