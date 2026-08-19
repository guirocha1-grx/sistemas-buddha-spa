import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Tabela de Preços", () => {
  it("exibe apenas a orientação manual solicitada", () => {
    const source = readFileSync(new URL("../client/src/pages/Tabela.tsx", import.meta.url), "utf8");

    expect(source).toContain("Valores oficiais para consulta manual da equipe.");
    expect(source).not.toContain("também é a referência comercial usada pelo agente Estela");
    expect(source).toContain("Campanha do Mês");
    expect(source).toContain("{{campanha_do_mes}}");

    const fluxosSource = readFileSync(new URL("./fluxos.ts", import.meta.url), "utf8");
    expect(fluxosSource).toContain("campanha_do_mes");
    expect(fluxosSource).toContain("obterCampanhaMensal");
  });
});
