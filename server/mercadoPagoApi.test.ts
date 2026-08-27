import { describe, expect, it } from "vitest";
import { classificarOrigemPagamentoMp, coletarPagamentosEstaveis, ehCompraEquipamentoPoint, resumirOrigemPagamentoMp, type MpPaymentsSearchResponse } from "./mercadoPagoApi";

describe("ehCompraEquipamentoPoint", () => {
  it("separa uma compra subsidiada de Point Smart das vendas", () => {
    expect(ehCompraEquipamentoPoint({
      id: 1,
      date_approved: "2026-08-18T19:30:16.000-04:00",
      status: "approved",
      transaction_amount: 840.8,
      coupon_amount: 640.9,
      description: "Point Smart 2",
      order: { type: "mercadopago" },
      transaction_details: { total_paid_amount: 199.9, net_received_amount: 840.8 },
    })).toBe(true);
  });

  it("mantém uma venda comum no fluxo de adquirente", () => {
    expect(ehCompraEquipamentoPoint({
      id: 2,
      date_approved: "2026-08-18T19:30:16.000-04:00",
      status: "approved",
      transaction_amount: 199.9,
      description: "Sessão de Massagem",
      transaction_details: { total_paid_amount: 199.9, net_received_amount: 194 },
    })).toBe(false);
  });
});

describe("coletarPagamentosEstaveis", () => {
  it("une varreduras quando a API inicialmente retorna só parte das vendas", async () => {
    const respostas: MpPaymentsSearchResponse[] = [
      { paging: { total: 1, limit: 50, offset: 0 }, results: [{ id: 1, date_approved: null, status: "approved" }] },
      { paging: { total: 3, limit: 50, offset: 0 }, results: [
        { id: 1, date_approved: null, status: "approved" },
        { id: 2, date_approved: null, status: "approved" },
        { id: 3, date_approved: null, status: "approved" },
      ] },
    ];
    const carregarPagina = async () => respostas.shift() ?? { paging: { total: 3, limit: 50, offset: 0 }, results: [] };

    const coleta = await coletarPagamentosEstaveis(carregarPagina, { varreduras: 2, esperaEntreVarredurasMs: 0 });

    expect(coleta.totalNaApi).toBe(3);
    expect(coleta.pagamentos.map((pagamento) => pagamento.id).sort()).toEqual([1, 2, 3]);
  });

  it("percorre todas as páginas de uma varredura", async () => {
    const carregarPagina = async (offset: number): Promise<MpPaymentsSearchResponse> => {
      if (offset === 0) return { paging: { total: 3, limit: 2, offset }, results: [{ id: 1, date_approved: null, status: "approved" }, { id: 2, date_approved: null, status: "approved" }] };
      return { paging: { total: 3, limit: 2, offset }, results: [{ id: 3, date_approved: null, status: "approved" }] };
    };

    const coleta = await coletarPagamentosEstaveis(carregarPagina, { limit: 2, varreduras: 1 });

    expect(coleta.paginasConsultadas).toBe(2);
    expect(coleta.pagamentos).toHaveLength(3);
  });
});

describe("resumirOrigemPagamentoMp", () => {
  it("registra sinais de Point sem expor a referência externa", () => {
    expect(resumirOrigemPagamentoMp({
      id: 10,
      date_approved: null,
      status: "approved",
      external_reference: "cliente-interno-123",
      point_of_interaction: {
        type: "POINT",
        business_info: { unit: "loja", sub_unit: "ribeirao" },
        transaction_data: { pos_id: "POS-1", store_id: "STORE-1" },
      },
    })).toEqual({
      point_of_interaction_type: "POINT",
      point_business_unit: "loja",
      point_business_sub_unit: "ribeirao",
      pos_id: "POS-1",
      store_id: "STORE-1",
      order_type: null,
      operation_type: null,
      processing_mode: null,
      possui_external_reference: true,
      collector_id: null,
      application_id: null,
    });
  });

  it("preserva ausência de sinais como nulo sem inferir origem", () => {
    expect(resumirOrigemPagamentoMp({ id: 11, date_approved: null, status: "approved" })).toEqual({
      point_of_interaction_type: null,
      point_business_unit: null,
      point_business_sub_unit: null,
      pos_id: null,
      store_id: null,
      order_type: null,
      operation_type: null,
      processing_mode: null,
      possui_external_reference: false,
      collector_id: null,
      application_id: null,
    });
  });
});

describe("classificarOrigemPagamentoMp", () => {
  it("classifica Link de Pagamento pelo subcanal confirmado, sem depender de referência externa", () => {
    expect(classificarOrigemPagamentoMp({
      id: 20,
      date_approved: null,
      status: "approved",
      point_of_interaction: { type: "CHECKOUT", business_info: { unit: "online_payments", sub_unit: "payment_link" } },
    })).toBe("link_pagamento");
  });

  it("classifica Point somente com evidência operacional de Point, POS ou loja", () => {
    expect(classificarOrigemPagamentoMp({
      id: 21,
      date_approved: null,
      status: "approved",
      point_of_interaction: { type: "POINT", business_info: { unit: "point" }, transaction_data: { pos_id: "POS-1" } },
    })).toBe("maquininha_point");
  });

  it("classifica checkout online explícito e mantém ausência de evidência como indefinida", () => {
    expect(classificarOrigemPagamentoMp({
      id: 22,
      date_approved: null,
      status: "approved",
      point_of_interaction: { type: "CHECKOUT", business_info: { unit: "online_payments", sub_unit: "checkout_pro" } },
    })).toBe("online");
    expect(classificarOrigemPagamentoMp({ id: 23, date_approved: null, status: "approved", external_reference: "não-classifica-link" })).toBe("indefinido");
  });
});
