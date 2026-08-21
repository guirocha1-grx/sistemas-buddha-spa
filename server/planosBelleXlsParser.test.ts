import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parsePlanosBelleXls } from "./planosBelleXlsParser";

function criarRelatorio(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Worksheet");
  return XLSX.write(workbook, { type: "buffer", bookType: "xls" }) as Buffer;
}

const cabecalhoPlano = ["ID.", "Plano", "Cliente", "Pagador", "Status", "Dt. Venda", "Validade", "Valor (R$)", "Desconto", "Valor Final (R$)", "Tipo", "Avaliação", "Origem", "Campanha", "Vendedor"];
const cabecalhoServicos = ["", "Id", "Serviço", "", "", "", "", "Sessões", "Restantes", "Agendados"];

describe("parser do relatório de planos Belle", () => {
  it("preserva plano, validade, valores e saldo por serviço", () => {
    const resultado = parsePlanosBelleXls(criarRelatorio([
      ["Relatório de Planos"],
      cabecalhoPlano,
      ["409518218", "Plano Personalizado", "José Rubens Pinheiro Lima", "", "Aprovado", "13/08/2026", "13/09/2026", "1.657,00", "312,00", "1.345,00", "Personalizado", "---", "Presencial", "", "Administrador"],
      cabecalhoServicos,
      ["", "1814", "Relaxante 60", "", "", "", "", "3", "2", "1"],
    ]));

    expect(resultado.planos).toEqual([expect.objectContaining({
      planoBelleId: 409518218,
      clienteNome: "José Rubens Pinheiro Lima",
      dataVenda: "2026-08-13",
      validade: "2026-09-13",
      valorFinal: "1345.00",
      origem: "Presencial",
      vendedorNome: "Administrador",
    })]);
    expect(resultado.servicos).toEqual([{
      planoBelleId: 409518218,
      servicoCodigo: 1814,
      servicoNome: "Relaxante 60",
      sessoes: 3,
      restantes: 2,
      agendados: 1,
    }]);
  });

  it("lê vários blocos de planos na mesma aba", () => {
    const resultado = parsePlanosBelleXls(criarRelatorio([
      cabecalhoPlano,
      ["409500001", "Plano", "Cliente Um", "", "Aprovado", "01/08/2026", "01/09/2026", "0,00", "0,00", "0,00", "Personalizado", "", "Presencial", "", ""],
      cabecalhoServicos,
      ["", "1814", "Relaxante 60", "", "", "", "", "1", "1", "0"],
      [],
      cabecalhoPlano,
      ["409500002", "Plano", "Cliente Dois", "", "Aprovado", "02/08/2026", "02/09/2026", "0,00", "0,00", "0,00", "Personalizado", "", "Presencial", "", ""],
      cabecalhoServicos,
      ["", "1828", "Shiatsu 60", "", "", "", "", "2", "1", "1"],
    ]));

    expect(resultado.planos).toHaveLength(2);
    expect(resultado.servicos).toHaveLength(2);
    expect(resultado.servicos.map((servico) => servico.planoBelleId)).toEqual([409500001, 409500002]);
  });
});
