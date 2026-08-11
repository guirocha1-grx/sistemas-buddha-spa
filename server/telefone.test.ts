import { describe, expect, it } from "vitest";
import { normalizarTelefone, telefonesCorrespondem } from "@shared/telefone";

describe("telefone do Inbox", () => {
  it("normaliza telefone formatado para dígitos", () => {
    expect(normalizarTelefone("(16) 97400-7994")).toBe("16974007994");
  });

  it("considera equivalentes números com e sem DDI 55", () => {
    expect(telefonesCorrespondem("(16) 97400-7994", "5516974007994")).toBe(true);
  });

  it("não associa números diferentes", () => {
    expect(telefonesCorrespondem("(16) 97400-7994", "5516999999999")).toBe(false);
  });
});
