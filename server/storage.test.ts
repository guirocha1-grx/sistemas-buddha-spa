import { describe, expect, it } from "vitest";
import { normalizeStorageKey } from "./storage";

describe("normalizeStorageKey", () => {
  it("remove espaços e acentos de nomes enviados pelo usuário", () => {
    expect(normalizeStorageKey("/inbox/2/Captura de Tela à noite.png"))
      .toBe("inbox/2/Captura-de-Tela-a-noite.png");
  });

  it("preserva os separadores de diretório e a extensão", () => {
    expect(normalizeStorageKey("inbox/12/Contrato final.pdf"))
      .toBe("inbox/12/Contrato-final.pdf");
  });
});
