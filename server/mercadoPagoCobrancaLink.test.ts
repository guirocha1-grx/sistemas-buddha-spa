import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { montarCorpoPreferenciaPagamento } from "./mercadoPagoApi";
import { extrairDataIdWebhookMercadoPago, validarAssinaturaWebhookMercadoPago } from "./mercadoPagoWebhook";
import { normalizarExtracaoCobrancaLink } from "./cobrancaLink";

describe("preferência individual de cobrança Mercado Pago", () => {
  it("mantém referência e notificação por cobrança, sem expiração", () => {
    const corpo = montarCorpoPreferenciaPagamento({
      titulo: "Mini Day Spa",
      descricao: "Experiência individual",
      valor: 419,
      externalReference: "buddha-link-2-abc",
      notificationUrl: "https://spa.grxcorp.com.br/api/webhooks/mercadopago",
    });
    expect(corpo).toMatchObject({
      external_reference: "buddha-link-2-abc",
      notification_url: "https://spa.grxcorp.com.br/api/webhooks/mercadopago",
      items: [{ title: "Mini Day Spa", quantity: 1, currency_id: "BRL", unit_price: 419 }],
    });
    expect(corpo).not.toHaveProperty("expires");
    expect(corpo).not.toHaveProperty("expiration_date_to");
  });
});

describe("assinatura de Webhook Mercado Pago", () => {
  it("aceita somente a assinatura HMAC correspondente ao manifesto oficial", () => {
    const segredo = "segredo-de-teste";
    const manifestacao = "id:12345;request-id:req-7;ts:1724770000;";
    const assinatura = createHmac("sha256", segredo).update(manifestacao).digest("hex");
    expect(validarAssinaturaWebhookMercadoPago({
      xSignature: `ts=1724770000,v1=${assinatura}`,
      xRequestId: "req-7",
      dataId: "12345",
      segredo,
    })).toBe(true);
    expect(validarAssinaturaWebhookMercadoPago({
      xSignature: `ts=1724770000,v1=${assinatura}`,
      xRequestId: "req-alterado",
      dataId: "12345",
      segredo,
    })).toBe(false);
  });

  it("rejeita cabeçalhos ausentes e aceita data.id somente numérico", () => {
    expect(validarAssinaturaWebhookMercadoPago({ dataId: "123", segredo: "x" })).toBe(false);
    expect(extrairDataIdWebhookMercadoPago({ query: { "data.id": "9988" }, body: {} })).toBe("9988");
    expect(extrairDataIdWebhookMercadoPago({ body: { data: { id: "abc" } } })).toBeNull();
  });
});

describe("sugestão de cobrança por conversa", () => {
  it("preserva apenas um valor explícito trazido em JSON estruturado", () => {
    const sugestao = normalizarExtracaoCobrancaLink(JSON.stringify({
      titulo: "Mini Day Spa",
      descricao: "Experiência individual",
      valor: 419.009,
      formaPagamentoMencionada: "Pix",
      confianca: 91,
      justificativa: "O valor foi informado expressamente na conversa.",
    }));
    expect(sugestao.valor).toBe(419.01);
    expect(sugestao.titulo).toBe("Mini Day Spa");
  });

  it("mantém o valor nulo quando ele não foi informado e rejeita payload inválido", () => {
    const semValor = normalizarExtracaoCobrancaLink(JSON.stringify({
      titulo: "Voucher",
      descricao: null,
      valor: null,
      formaPagamentoMencionada: null,
      confianca: 34,
      justificativa: "A conversa não informa valor final.",
    }));
    expect(semValor.valor).toBeNull();
    expect(() => normalizarExtracaoCobrancaLink('{"titulo":"sem campos obrigatórios"}')).toThrow("formato inválido");
  });
});
