import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseRegistrosFinanceirosBelleXlsx } from "./registrosFinanceirosBelleXlsxParser";

function criarRelatorio(linhas: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Relatório de Registros Financeiros"],
    ["Cód.", "Lcto.", "Vcto.", "Cliente", "Valor", "Forma Pagto.", "Observação"],
    ...linhas,
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Worksheet");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parser do relatório financeiro Belle", () => {
  it("usa Vcto. como data de vencimento, sem confundir com Lcto.", () => {
    const linhas = parseRegistrosFinanceirosBelleXlsx(criarRelatorio([[
      "9001", "29/08/2026", "01/08/2026", "Cliente de teste", "7278,70",
      "Pix - Conta Corrente", "Agendamento #71370969",
    ]]));

    expect(linhas).toEqual([{
      codigo: 9001,
      dataVencimento: "2026-08-01",
      clienteNome: "Cliente de teste",
      valor: 7278.7,
      formaPagamento: "Pix - Conta Corrente",
      observacao: "Agendamento #71370969",
      atendimentoBelleId: 71370969,
    }]);
  });

  it("rejeita relatórios sem a coluna obrigatória Vcto.", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Cód.", "Lcto.", "Cliente", "Valor", "Forma Pagto."],
      ["9001", "29/08/2026", "Cliente", "10,00", "Dinheiro"],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Worksheet");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    expect(() => parseRegistrosFinanceirosBelleXlsx(buffer)).toThrow("Coluna obrigatória ausente: dataVencimento.");
  });
});
