import { describe, expect, it } from "vitest";
import { combinarLinksConfirmacao, dataSaoPaulo, ePixRecebidoInter, excluirPixDeContasProprias, listarLinksConfirmadosLocalmente, listarLinksMercadoPagoRecentes, listarPixInterRecentes } from "./confirmacaoPagamento";

describe("confirmação de pagamento", () => {
  it("seleciona somente Pix recebidos do Inter e mantém nome, valor e identificador da transação", () => {
    const inicio = new Date("2026-08-25T12:00:00.000Z");
    const pix = {
      idTransacao: "pix-1", dataInclusao: "2026-08-26T10:30:00.000Z", dataTransacao: "2026-08-26",
      tipoTransacao: "PIX", tipoOperacao: "C", valor: "359.00", titulo: "Pix recebido", descricao: "Ketty",
      detalhes: { nomePagador: "Ketty", cpfCnpjPagador: "30573303800", endToEndId: "E123" },
    };
    const pixEnviado = { ...pix, idTransacao: "pix-2", tipoOperacao: "D" } as const;

    expect(ePixRecebidoInter(pix)).toBe(true);
    expect(ePixRecebidoInter(pixEnviado)).toBe(false);
    expect(listarPixInterRecentes([pix, pixEnviado], inicio)).toEqual([{
      idTransacao: "pix-1", dataHora: "2026-08-26T10:30:00.000Z", valor: "359.00", pagador: "Ketty",
      cpfCnpjPagador: "30573303800", descricao: "Ketty", endToEndId: "E123",
    }]);
  });

  it("traz apenas Links de Pagamento aprovados dentro da janela real de 48 horas", () => {
    const inicio = new Date("2026-08-25T12:00:00.000Z");
    const base = { date_approved: "2026-08-26T10:00:00.000Z", status: "approved" as const, transaction_amount: 359, point_of_interaction: { type: "CHECKOUT", business_info: { unit: "online_payments", sub_unit: "payment_link" } } };
    const ponto = { ...base, id: 2, point_of_interaction: { type: "POINT", business_info: { unit: "point" } } };
    const antigo = { ...base, id: 3, date_approved: "2026-08-24T10:00:00.000Z" };

    expect(listarLinksMercadoPagoRecentes([{ ...base, id: 1 }, ponto, antigo], inicio)).toEqual([{
      idPagamento: "1", dataHora: "2026-08-26T10:00:00.000Z", valorBruto: "359.00", valorLiquido: null,
      parcelas: null, formaPagamento: null, pagador: null, identificacaoPagador: null, descricao: null,
    }]);
  });

  it("remove Pix cujo CNPJ do pagador é de uma conta própria, mantendo os demais", () => {
    const pagamentos = [
      { idTransacao: "pix-1", dataHora: "2026-08-26T10:00:00.000Z", valor: "100.00", pagador: "Satori Spa", cpfCnpjPagador: "12.345.678/0001-74", descricao: null, endToEndId: null },
      { idTransacao: "pix-2", dataHora: "2026-08-26T10:05:00.000Z", valor: "200.00", pagador: "Cliente Real", cpfCnpjPagador: "30573303800", descricao: null, endToEndId: null },
    ];
    expect(excluirPixDeContasProprias(pagamentos, new Set(["12345678000174"]))).toEqual([pagamentos[1]]);
    expect(excluirPixDeContasProprias(pagamentos, new Set())).toEqual(pagamentos);
  });

  it("calcula a data da janela no fuso de São Paulo", () => {
    expect(dataSaoPaulo(new Date("2026-08-27T02:30:00.000Z"))).toBe("2026-08-26");
  });

  it("interpreta dataInclusao sem offset como horário de Brasília", () => {
    const inicio = new Date("2026-08-25T13:30:00.000Z"); // 10:30 em Brasília
    const transacao = {
      idTransacao: "pix-brasilia", dataInclusao: "2026-08-25 10:00:00.000", dataTransacao: "2026-08-25",
      tipoTransacao: "PIX", tipoOperacao: "C", valor: "100.00", titulo: "Pix recebido", descricao: "Cliente",
    };
    expect(listarPixInterRecentes([transacao], inicio)).toHaveLength(0);
  });

  it("inclui imediatamente a cobrança aprovada pelo Webhook e evita duplicá-la quando a API retornar o mesmo pagamento", () => {
    const local = listarLinksConfirmadosLocalmente([{
      id: 2,
      clienteNome: "Robinson Gomes",
      titulo: "Relaxante MenCare",
      valor: "259.00",
      formaPagamentoInformada: null,
      paymentId: "176022256588",
      paymentApprovedAt: new Date("2026-08-28T13:39:16.000Z"),
      pagadorNome: "Robinson Gomes",
    }]);
    const combinados = combinarLinksConfirmacao([{
      ...local[0],
      formaPagamento: "pix",
    }], local);
    expect(combinados).toHaveLength(1);
    expect(combinados[0]).toMatchObject({ idPagamento: "176022256588", formaPagamento: "pix", valorBruto: "259.00" });
  });
});
