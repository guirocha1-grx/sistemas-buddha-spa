import { describe, expect, it } from "vitest";
import { encontrarLinhaVaziaComandaVirtual } from "./googleSheets";

describe("preenchimento da Comanda virtual", () => {
  it("seleciona a primeira linha existente sem cliente e preserva as linhas já preenchidas", () => {
    const resultado = encontrarLinhaVaziaComandaVirtual([
      ["Comanda virtual"],
      ["ID", "Cliente", "Abertura comanda (responsável)", "Terapia/Produto", "Terapeuta"],
      ["1", "Fabiana", "Débora", "Yin Yang 60", "Larah"],
      ["2", "", "", "", ""],
      ["3", "--", "", "", ""],
    ]);
    expect(resultado).toEqual({ linha: 4, clienteCol: 1, terapiaCol: 3, terapeutaCol: 4 });
  });

  it("recusa a escrita quando todas as linhas existentes já têm cliente", () => {
    expect(() => encontrarLinhaVaziaComandaVirtual([["ID", "Cliente", "Terapia/Produto", "Terapeuta"], ["1", "Fabiana", "Yin Yang 60", "Larah"]]))
      .toThrow("Não há uma linha vazia disponível");
  });
});
