import { describe, expect, it } from "vitest";
import { coletarPagamentosEstaveis, ehCompraEquipamentoPoint, type MpPaymentsSearchResponse } from "./mercadoPagoApi";

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
