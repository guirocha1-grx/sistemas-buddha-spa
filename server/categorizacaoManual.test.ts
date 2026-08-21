import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("categorização manual de extratos", () => {
  it("não cria regra aprendida a partir de uma escolha humana", () => {
    const fonteDb = readFileSync(new URL("./db.ts", import.meta.url), "utf8");

    expect(fonteDb).not.toContain('origem: "aprendida"');
    expect(fonteDb).toContain('sem criar ou alterar regras de match');
  });
});
