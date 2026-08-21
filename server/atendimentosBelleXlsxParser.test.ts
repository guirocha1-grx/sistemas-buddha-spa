import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseAtendimentosBelleXlsx } from "./atendimentosBelleXlsxParser";

function criarRelatorio(linhas: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Relatório de Atendimentos"],
    ["ID", "Data", "Horário", "Cliente", "Tipo de Cliente", "Sala", "Serviço", "Tempo", "Profissional", "Tem Preferência", "Plano", "Área/Aplicação", "Tipo", "Status", "Celular"],
    ...linhas,
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Worksheet");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parser do relatório de atendimentos Belle", () => {
  it("lê dados de sessão, preferência, plano e serviço no formato exportado", () => {
    const linhas = parseAtendimentosBelleXlsx(criarRelatorio([[
      "71300829", "01/08/2026", "12:00", "Alexandre Clemente Neto", "", "",
      "1824-Shiatsu 30", "30", "Larah Carolinne Martins Loss", "Sim", "409436359", "",
      "Serviço", "Atendido", "(16)99992-5176",
    ]]));

    expect(linhas).toEqual([expect.objectContaining({
      atendimentoBelleId: 71300829,
      clienteNome: "Alexandre Clemente Neto",
      dataAtendimento: "2026-08-01",
      horario: "12:00",
      servicoCodigo: 1824,
      servicoNome: "Shiatsu 30",
      duracaoMinutos: 30,
      profissionalNome: "Larah Carolinne Martins Loss",
      temPreferencia: true,
      planoBelleId: 409436359,
      status: "Atendido",
      telefone: "(16)99992-5176",
    })]);
  });

  it("preserva o atendimento sem plano como nulo e ignora linhas sem ID", () => {
    const linhas = parseAtendimentosBelleXlsx(criarRelatorio([
      ["", "01/08/2026", "12:00", "Sem identificador", "", "", "1814-Relaxante 60", "60", "", "Não", "0", "", "Serviço", "Atendido", ""],
      ["71300830", "01/08/2026", "13:00", "Cliente sem plano", "", "", "1814-Relaxante 60", "60", "Profissional", "Não", "0", "", "Serviço", "Marcado", "(16)99999-1111"],
    ]));

    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toEqual(expect.objectContaining({ planoBelleId: null, temPreferencia: false, status: "Marcado" }));
  });
});
