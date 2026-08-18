import { describe, expect, it } from "vitest";
import {
  DEFAULT_INBOX_AI_MESSAGE_PROMPT,
  INBOX_AI_PROMPT_KEY,
  montarPedidoSugestaoMensagem,
} from "@shared/inboxAi";

describe("sugestão de mensagem do Inbox", () => {
  it("usa uma chave global estável para o prompt editável", () => {
    expect(INBOX_AI_PROMPT_KEY).toBe("inbox_ai_prompt_sugestao_mensagem");
  });

  it("encapsula o rascunho como conteúdo de atendimento", () => {
    expect(montarPedidoSugestaoMensagem("  pode vir hoje as 15h? ")).toContain("pode vir hoje as 15h?");
    expect(montarPedidoSugestaoMensagem("Olá")).toContain("RASCUNHO DA ATENDENTE");
  });

  it("mantém o padrão de comunicação acolhedora e não agressiva", () => {
    expect(DEFAULT_INBOX_AI_MESSAGE_PROMPT).toContain("acolhedor");
    expect(DEFAULT_INBOX_AI_MESSAGE_PROMPT).toContain("não agressiva");
  });
});
