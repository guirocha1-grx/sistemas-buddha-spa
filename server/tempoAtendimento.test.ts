import { describe, expect, it } from "vitest";
import {
  calcularRelatorioTempoAtendimento,
  classificarDesvioDuracao,
  identificarEventoTempoAtendimento,
} from "./tempoAtendimento";

function hora(texto: string): Date {
  return new Date(`2026-08-28T${texto}-03:00`);
}

describe("tempo de atendimento", () => {
  it("reconhece somente mensagens explícitas de início e fim", () => {
    expect(identificarEventoTempoAtendimento("Comecei o atendimento na sala 2")).toBe("inicio");
    expect(identificarEventoTempoAtendimento("Finalizei, sala liberada")).toBe("fim");
    expect(identificarEventoTempoAtendimento("A cliente ainda não iniciou o atendimento")).toBeNull();
    expect(identificarEventoTempoAtendimento("Bom dia, pessoal")).toBeNull();
  });

  it("calcula espera, duração e ordena maior espera primeiro", () => {
    const resultado = calcularRelatorioTempoAtendimento([
      {
        atendimentoId: 1,
        dataAtendimento: "2026-08-28",
        horario: "09:00",
        clienteNome: "Cliente 1",
        terapeutaNome: "Ana",
        servicoNome: "Massagem",
        duracaoBelleMinutos: 60,
        chamadoEm: hora("09:00:00"),
        inicioEm: hora("09:08:00"),
        fimEm: hora("10:18:00"),
      },
      {
        atendimentoId: 2,
        dataAtendimento: "2026-08-28",
        horario: "10:00",
        clienteNome: "Cliente 2",
        terapeutaNome: "Maria",
        servicoNome: "Drenagem",
        duracaoBelleMinutos: 60,
        chamadoEm: hora("10:00:00"),
        inicioEm: null,
        fimEm: null,
      },
    ], "2026-08-28", "2026-08-28");

    expect(resultado.totalChamados).toBe(2);
    expect(resultado.atendimentosComInicio).toBe(1);
    expect(resultado.atendimentosComFim).toBe(1);
    expect(resultado.esperaMediaMinutos).toBe(8);
    expect(resultado.esperaMaximaMinutos).toBe(8);
    expect(resultado.linhas[0]).toMatchObject({
      atendimentoId: 1,
      esperaMinutos: 8,
      duracaoSalaMinutos: 70,
      desvioDuracaoMinutos: 10,
      classificacao: "acima_do_tempo",
    });
    expect(resultado.terapeutas[0]).toMatchObject({ terapeutaNome: "Ana", totalChamados: 1, dentroDoTempo: 0, acimaDoTempo: 1 });
  });

  it("classifica desvios sem transformar ausência de referência em atraso", () => {
    expect(classificarDesvioDuracao(null, 60)).toBe("sem_referencia");
    expect(classificarDesvioDuracao(50, 60)).toBe("abaixo_do_tempo");
    expect(classificarDesvioDuracao(67, 60)).toBe("acima_do_tempo");
    expect(classificarDesvioDuracao(76, 60)).toBe("muito_acima_do_tempo");
  });
});
