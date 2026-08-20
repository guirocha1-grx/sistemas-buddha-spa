import { describe, expect, it } from "vitest";
import { filtrarScriptsPorTiposSelecionados } from "../client/src/lib/scriptsSearch";

const scripts = [
  { id: 1, titulo: "Mensagem", tipo: "texto" as const },
  { id: 2, titulo: "Fluxo", tipo: "fluxo" as const },
];

describe("filtrarScriptsPorTiposSelecionados", () => {
  it("mantém todos os scripts quando Texto e Fluxo estão marcados", () => {
    expect(filtrarScriptsPorTiposSelecionados(scripts, true, true).map((script) => script.id)).toEqual([1, 2]);
  });

  it("aplica os quatro estados das caixas de texto e fluxo", () => {
    expect(filtrarScriptsPorTiposSelecionados(scripts, true, false).map((script) => script.id)).toEqual([1]);
    expect(filtrarScriptsPorTiposSelecionados(scripts, false, true).map((script) => script.id)).toEqual([2]);
    expect(filtrarScriptsPorTiposSelecionados(scripts, false, false)).toEqual([]);
  });
});
