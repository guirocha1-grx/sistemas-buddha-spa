import { describe, expect, it } from "vitest";
import { normalizarTelefone, telefonesCorrespondem, variantesTelefone } from "@shared/telefone";

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

  it("não confunde DDD 55 (Santa Maria/RS) com DDI — gera variante com DDI correto", () => {
    // 11 dígitos = DDD 55 + celular, SEM DDI. Bug real: cortava o "55"
    // como se fosse DDI e nunca gerava a variante com DDI de verdade.
    const variantes = variantesTelefone("55991234567");
    expect(variantes).toContain("55991234567");
    expect(variantes).toContain("5555991234567");
  });

  it("remove zero inicial de discagem antiga (0DDXXXXXXXXX)", () => {
    const variantes = variantesTelefone("016981735275");
    expect(variantes).toContain("5516981735275");
  });

  it("telefonesCorrespondem também não confunde DDD 55 com DDI", () => {
    expect(telefonesCorrespondem("55991234567", "5555991234567")).toBe(true);
  });

  // Caso real 2026-08-29: terapeuta cadastrada com celular "com 9"
  // (formato correto atual) nunca era reconhecida em mensagem de grupo
  // do WhatsApp, que chegava "sem 9" (formato antigo/incompleto) —
  // telefonesCorrespondem só tratava diferença de DDI, não essa.
  it("reconhece o mesmo celular com e sem o 9 do celular, com ou sem DDI", () => {
    expect(telefonesCorrespondem("38998516356", "553898516356")).toBe(true);
  });
});
