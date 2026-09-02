import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseRegistrosFinanceirosBelleXlsx } from "./registrosFinanceirosBelleXlsxParser";

function criarRelatorio(linhas: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Relatório de Registros Financeiros"],
    ["Cód.", "Lcto.", "Vcto.", "Cliente", "Valor", "Recebido", "Forma Pagto.", "Observação"],
    ...linhas,
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Worksheet");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("parser do relatório financeiro Belle", () => {
  it("usa Vcto. como data de vencimento, sem confundir com Lcto.", () => {
    const linhas = parseRegistrosFinanceirosBelleXlsx(criarRelatorio([[
      "9001", "29/08/2026", "01/08/2026", "Cliente de teste", "7278,70", "2426,23",
      "Pix - Conta Corrente", "Agendamento #71370969",
    ]]));

    expect(linhas).toEqual([{
      codigo: 9001,
      dataVencimento: "2026-08-01",
      clienteNome: "Cliente de teste",
      valor: 2426.23,
      pendenteConfirmacao: false,
      formaPagamento: "Pix - Conta Corrente",
      observacao: "Agendamento #71370969",
      atendimentoBelleId: 71370969,
    }]);
  });

  it("usa Recebido (o que de fato entrou) quando confirmado, não o Valor contratado da venda", () => {
    const linhas = parseRegistrosFinanceirosBelleXlsx(criarRelatorio([[
      "9002", "01/08/2026", "01/08/2026", "Cliente com plano parcelado", "2690,00", "448,33",
      "Cartão de Crédito", "Venda de Plano #409463680",
    ]]));

    expect(linhas[0].valor).toBe(448.33);
    expect(linhas[0].pendenteConfirmacao).toBe(false);
  });

  it("cai pro Valor contratado quando Recebido vem zerado, e marca como pendente de confirmação", () => {
    const linhas = parseRegistrosFinanceirosBelleXlsx(criarRelatorio([[
      "9003", "19/08/2026", "19/08/2026", "Cliente com cartão não liquidado", "160,00", "0",
      "Cartão de Débito", "Agendamento #73254563",
    ]]));

    expect(linhas[0].valor).toBe(160);
    expect(linhas[0].pendenteConfirmacao).toBe(true);
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
