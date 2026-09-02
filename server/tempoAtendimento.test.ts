import { describe, expect, it } from "vitest";
import {
  calcularRelatorioTempoAtendimento,
  classificarDesvioDuracao,
  escolherAtendimentoPorEvento,
  identificarEventoTempoAtendimento,
  identificarTerapeuta,
  nomesClienteCorrespondem,
} from "./tempoAtendimento";

const ROSTER_TESTE = [
  { id: 1, nomeCompleto: "Crislane Valeska Cardoso de Sá", nomeAbreviado: "Crislane" },
  { id: 2, nomeCompleto: "Gabriel Henrique Ribeiro Cotrim", nomeAbreviado: "Gabriel" },
  { id: 3, nomeCompleto: "Camila Vieira", nomeAbreviado: "Camila" },
];

describe("identificarTerapeuta", () => {
  it("resolve apelido com erro de digitação (Crislaine -> Crislane)", () => {
    expect(identificarTerapeuta("Crislaine", ROSTER_TESTE)).toBe(1);
  });

  it("resolve nome prefixado com o cargo, como o Belle às vezes manda", () => {
    expect(identificarTerapeuta("Terapeuta Gabriel", ROSTER_TESTE)).toBe(2);
  });

  it("resolve o nome completo oficial", () => {
    expect(identificarTerapeuta("Crislane Valeska Cardoso de Sá", ROSTER_TESTE)).toBe(1);
  });

  it("não resolve texto que não é nome de pessoa (linha de Produto/Voucher na Comanda)", () => {
    expect(identificarTerapeuta("Produto (não esquecer NFP)", ROSTER_TESTE)).toBeNull();
    expect(identificarTerapeuta("Voucher (exceto utilização hoje)", ROSTER_TESTE)).toBeNull();
  });

  it("não resolve nome de sala/recurso do Belle (banho de imersão sem terapeuta dedicado)", () => {
    expect(identificarTerapeuta("Banho II", ROSTER_TESTE)).toBeNull();
  });
});

describe("nomesClienteCorrespondem", () => {
  it("tolera prefixo de tratamento que o Belle às vezes usa", () => {
    expect(nomesClienteCorrespondem("Pedro Luis Taveira", "Sr. Pedro Luis Taveira")).toBe(true);
  });

  it("tolera erro de digitação pequeno no primeiro nome", () => {
    expect(nomesClienteCorrespondem("Daniele fernandes", "Daniela Fernandes")).toBe(true);
    expect(nomesClienteCorrespondem("Giovanna Brito", "Giovana Brito")).toBe(true);
    expect(nomesClienteCorrespondem("Prisacila Batalzar", "Priscila Baltazar lazzarini")).toBe(true);
  });

  it("não casa nomes curtos diferentes só porque a distância é pequena", () => {
    expect(nomesClienteCorrespondem("Ana Silva", "Ada Silva")).toBe(false);
  });

  it("não casa clientes genuinamente diferentes", () => {
    expect(nomesClienteCorrespondem("Marcos Rocha", "Rodrigo Costa")).toBe(false);
  });
});

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

  it("diferencia chamados consecutivos do mesmo terapeuta pelo identificador textual", () => {
    const candidatos = [
      { atendimentoBelleId: 101, terapeutaNome: "Ana", clienteNome: "Maria Paula", servicoNome: "Massagem Relaxante", sala: "Sala 1" },
      { atendimentoBelleId: 102, terapeutaNome: "Ana", clienteNome: "João Pedro", servicoNome: "Drenagem Linfática", sala: "Sala 2" },
    ];
    expect(escolherAtendimentoPorEvento("Ana Souza", "Iniciei João Pedro, na Sala 2 para Drenagem Linfática", candidatos)?.atendimentoBelleId).toBe(102);
    expect(escolherAtendimentoPorEvento("Ana Souza", "Iniciei o próximo atendimento", candidatos)).toBeNull();
    expect(escolherAtendimentoPorEvento("Ana Souza", "Iniciei o próximo atendimento", candidatos, true)?.atendimentoBelleId).toBe(101);
  });

  it("classifica desvios sem transformar ausência de referência em atraso", () => {
    expect(classificarDesvioDuracao(null, 60)).toBe("sem_referencia");
    expect(classificarDesvioDuracao(50, 60)).toBe("abaixo_do_tempo");
    expect(classificarDesvioDuracao(67, 60)).toBe("acima_do_tempo");
    expect(classificarDesvioDuracao(76, 60)).toBe("muito_acima_do_tempo");
  });
});
