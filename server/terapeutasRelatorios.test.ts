import { describe, expect, it } from "vitest";
import { calcularFidelizacao, calcularPreferenciais } from "./terapeutasRelatorios";

const terapeutas = [
  { id: 1, nomeCompleto: "Ana Paula Silva", nomeAbreviado: "Ana" },
  { id: 2, nomeCompleto: "Maria Angélica Souza", nomeAbreviado: "Maria" },
];

describe("relatórios de terapeutas", () => {
  it("calcula total, fidelizados, não fidelizados e percentuais por terapeuta", () => {
    const resultado = calcularFidelizacao(terapeutas, [
      { profissionalNome: "Ana Paula Silva", temPreferencia: true },
      { profissionalNome: "Ana", temPreferencia: false },
      { profissionalNome: "Maria Angelica Souza", temPreferencia: true },
      { profissionalNome: "Profissional não cadastrado", temPreferencia: true },
    ]);

    expect(resultado).toEqual([
      {
        terapeutaId: 2,
        terapeutaNome: "Maria",
        totalAtendimentos: 1,
        atendimentosFidelizados: 1,
        atendimentosNaoFidelizados: 0,
        percentualFidelizacao: 100,
        percentualNaoFidelizacao: 0,
      },
      {
        terapeutaId: 1,
        terapeutaNome: "Ana",
        totalAtendimentos: 2,
        atendimentosFidelizados: 1,
        atendimentosNaoFidelizados: 1,
        percentualFidelizacao: 50,
        percentualNaoFidelizacao: 50,
      },
    ]);
  });

  it("mantém terapeutas sem atendimento com percentuais indefinidos", () => {
    const resultado = calcularFidelizacao(terapeutas, []);
    expect(resultado).toHaveLength(2);
    expect(resultado.every((linha) => linha.totalAtendimentos === 0)).toBe(true);
    expect(resultado.every((linha) => linha.percentualFidelizacao === null)).toBe(true);
  });

  it("conta clientes distintos com preferência, sem transformar preferência em atendimento", () => {
    const resultado = calcularPreferenciais(terapeutas, [
      { clienteId: 10, terapeutaId: 1, terapeutaNome: "Ana" },
      { clienteId: 10, terapeutaId: 1, terapeutaNome: "Ana" },
      { clienteId: 11, terapeutaId: null, terapeutaNome: "Maria Angelica Souza" },
      { clienteId: 12, terapeutaId: 999, terapeutaNome: "Ana" },
    ]);

    expect(resultado).toEqual([
      { terapeutaId: 1, terapeutaNome: "Ana", clientesPreferenciais: 1 },
      { terapeutaId: 2, terapeutaNome: "Maria", clientesPreferenciais: 1 },
    ]);
  });
});
