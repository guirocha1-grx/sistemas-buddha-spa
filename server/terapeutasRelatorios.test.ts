import { describe, expect, it } from "vitest";
import { calcularFidelizacao, calcularPreferenciaisPorAtendimento, DATA_ISO_REGEX } from "./terapeutasRelatorios";

const terapeutas = [
  { id: 1, nomeCompleto: "Ana Paula Silva", nomeAbreviado: "Ana" },
  { id: 2, nomeCompleto: "Maria Angélica Souza", nomeAbreviado: "Maria" },
];

describe("relatórios de terapeutas", () => {
  it("aceita datas ISO produzidas pelo campo date", () => {
    expect(DATA_ISO_REGEX.test("2026-08-28")).toBe(true);
    expect(DATA_ISO_REGEX.test("\\\\2026-08-28")).toBe(false);
    expect(DATA_ISO_REGEX.test("28/08/2026")).toBe(false);
  });

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

  it("lista clientes distintos por preferência e ordena pelo número de atendimentos", () => {
    const resultado = calcularPreferenciaisPorAtendimento(terapeutas, [
      { clienteId: 10, clienteNome: "Cliente Ana 1", profissionalNome: "Ana", temPreferencia: true },
      { clienteId: 10, clienteNome: "Cliente Ana 1", profissionalNome: "Ana", temPreferencia: true },
      { clienteId: 11, clienteNome: "Cliente Ana 2", profissionalNome: "Ana Paula Silva", temPreferencia: true },
      { clienteId: 12, clienteNome: "Cliente não preferencial", profissionalNome: "Ana", temPreferencia: false },
      { clienteId: 13, clienteNome: "Cliente Maria", profissionalNome: "Maria Angelica Souza", temPreferencia: true },
      { clienteId: 13, clienteNome: "Cliente Maria", profissionalNome: "Maria Angelica Souza", temPreferencia: true },
    ]);

    expect(resultado[0]).toEqual({
      terapeutaId: 1,
      terapeutaNome: "Ana",
      clientesPreferenciais: 2,
      clientes: [
        { clienteId: 10, clienteNome: "Cliente Ana 1", atendimentos: 2 },
        { clienteId: 11, clienteNome: "Cliente Ana 2", atendimentos: 1 },
      ],
    });
    expect(resultado[1]).toEqual({
      terapeutaId: 2,
      terapeutaNome: "Maria",
      clientesPreferenciais: 1,
      clientes: [{ clienteId: 13, clienteNome: "Cliente Maria", atendimentos: 2 }],
    });
  });
});
