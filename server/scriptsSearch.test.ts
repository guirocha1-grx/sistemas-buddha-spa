import { describe, expect, it } from "vitest";
import { filtrarScriptsPorTipo } from "../client/src/lib/scriptsSearch";

const scripts = [
  { id: 1, titulo: "Mensagem", tipo: "texto" as const },
  { id: 2, titulo: "Fluxo", tipo: "fluxo" as const },
];

describe("filtrarScriptsPorTipo", () => {
  it("mantém todos os scripts quando os dois filtros estão em todos", () => {
    expect(filtrarScriptsPorTipo(scripts, "todos", "todos").map((script) => script.id)).toEqual([1, 2]);
  });

  it("combina texto e fluxo com opções sim e não", () => {
    expect(filtrarScriptsPorTipo(scripts, "sim", "todos").map((script) => script.id)).toEqual([1]);
    expect(filtrarScriptsPorTipo(scripts, "nao", "sim").map((script) => script.id)).toEqual([2]);
    expect(filtrarScriptsPorTipo(scripts, "nao", "nao")).toEqual([]);
  });
});
