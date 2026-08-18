import { describe, expect, it } from "vitest";
import { ENV } from "./_core/env";

describe("configuração do relatório diário no Telegram", () => {
  it("valida que o chat pessoal configurado é acessível pelo bot", async () => {
    expect(ENV.telegramBotToken).not.toBe("");
    expect(ENV.telegramChatIdGuilherme).not.toBe("");

    const url = new URL(`https://api.telegram.org/bot${ENV.telegramBotToken}/getChat`);
    url.searchParams.set("chat_id", ENV.telegramChatIdGuilherme);

    const response = await fetch(url);
    const body = (await response.json()) as { ok?: boolean; result?: { id?: number | string } };

    expect(response.ok).toBe(true);
    expect(body.ok).toBe(true);
    expect(String(body.result?.id)).toBe(ENV.telegramChatIdGuilherme);
  });
});
