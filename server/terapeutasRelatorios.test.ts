import { describe, expect, it } from "vitest";
import { calcularFechamentoAgenda, calcularFidelizacao, calcularPreferenciaisPorAtendimento, DATA_ISO_REGEX } from "./terapeutasRelatorios";

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

  it("calcula dias sem atendimento por profissional e dia da semana", () => {
    const resultado = calcularFechamentoAgenda(terapeutas, [
      { profissionalNome: "Ana", dataAtendimento: "2026-08-03" },
      { profissionalNome: "Ana Paula Silva", dataAtendimento: "2026-08-03" },
      { profissionalNome: "Ana", dataAtendimento: "2026-08-05" },
      { profissionalNome: "Maria Angelica Souza", dataAtendimento: "2026-08-04" },
      { profissionalNome: "Ana", dataAtendimento: "2026-08-10" },
      { profissionalNome: "Profissional não cadastrado", dataAtendimento: "2026-08-03" },
    ], "2026-08-03", "2026-08-09");

    expect(resultado.totalDiasCalendario).toBe(7);
    expect(resultado.totalFechamentos).toBe(11);
    expect(resultado.terapeutas[0]).toMatchObject({
      terapeutaId: 2,
      terapeutaNome: "Maria",
      diasAnalisados: 7,
      diasSemAtendimento: 6,
      percentualDiasSemAtendimento: (6 / 7) * 100,
      diasSemAtendimentoPorDiaSemana: { "0": 1, "1": 1, "2": 0, "3": 1, "4": 1, "5": 1, "6": 1 },
    });
    expect(resultado.terapeutas[1]).toMatchObject({
      terapeutaId: 1,
      diasSemAtendimento: 5,
      diasSemAtendimentoPorDiaSemana: { "0": 1, "1": 0, "2": 1, "3": 0, "4": 1, "5": 1, "6": 1 },
    });
    expect(resultado.resumoSemanal.slice(0, 4)).toEqual([
      expect.objectContaining({ diaSemana: 1, nomeDia: "Segunda-feira", atendimentos: 2, diasAnalisados: 1, diasComAtendimento: 1, diasSemAtendimento: 0, fechamentosProfissionais: 1 }),
      expect.objectContaining({ diaSemana: 2, nomeDia: "Terça-feira", atendimentos: 1, diasAnalisados: 1, diasComAtendimento: 1, diasSemAtendimento: 0, fechamentosProfissionais: 1 }),
      expect.objectContaining({ diaSemana: 3, nomeDia: "Quarta-feira", atendimentos: 1, diasAnalisados: 1, diasComAtendimento: 1, diasSemAtendimento: 0, fechamentosProfissionais: 1 }),
      expect.objectContaining({ diaSemana: 4, nomeDia: "Quinta-feira", atendimentos: 0, diasAnalisados: 1, diasComAtendimento: 0, diasSemAtendimento: 1, fechamentosProfissionais: 2 }),
    ]);
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
