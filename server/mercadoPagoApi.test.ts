import { describe, expect, it } from "vitest";
import { ehCompraEquipamentoPoint } from "./mercadoPagoApi";

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
