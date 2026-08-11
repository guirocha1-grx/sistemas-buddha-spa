import { describe, expect, it } from "vitest";
import { rotaInboxConversa } from "@shared/inboxNavigation";

describe("atalho Clientes → Inbox", () => {
  it("abre a conversa retornada pela procedure", () => {
    expect(rotaInboxConversa(41)).toBe("/mensagens?conversaId=41");
  });

  it("rejeita uma conversa sem ID válido", () => {
    expect(() => rotaInboxConversa(0)).toThrow("ID de conversa inválido");
  });
});
