import { describe, expect, it } from "vitest";
import { chaveRascunhoConversa, rotaInboxConversa } from "@shared/inboxNavigation";

describe("atalho Clientes → Inbox", () => {
  it("abre a conversa retornada pela procedure", () => {
    expect(rotaInboxConversa(41)).toBe("/mensagens?conversaId=41");
  });

  it("rejeita uma conversa sem ID válido", () => {
    expect(() => rotaInboxConversa(0)).toThrow("ID de conversa inválido");
  });

  it("gera a mesma chave de rascunho pro mesmo ID de conversa", () => {
    expect(chaveRascunhoConversa(41)).toBe(chaveRascunhoConversa(41));
    expect(chaveRascunhoConversa(41)).not.toBe(chaveRascunhoConversa(42));
  });
});
