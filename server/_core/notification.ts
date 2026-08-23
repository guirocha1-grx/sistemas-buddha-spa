import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import { sendTelegramMessage } from "../telegramApi";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Notifica o dono do projeto pelo Telegram (mesmo chat usado pelo relatório
 * diário, ver server/dailySyncReport.ts). Retorna `true` se o envio foi
 * aceito; `false` quando o Telegram não está configurado ou falhou —
 * chamadores tratam como best-effort. Erros de validação sobem como
 * TRPCError pra quem chamou corrigir o payload.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  if (!ENV.telegramChatIdGuilherme) {
    console.warn("[Notification] TELEGRAM_CHAT_ID_GUILHERME não configurado.");
    return false;
  }

  try {
    await sendTelegramMessage(ENV.telegramChatIdGuilherme, `*${title}*\n\n${content}`);
    return true;
  } catch (error) {
    console.warn("[Notification] Erro ao notificar pelo Telegram:", error);
    return false;
  }
}
