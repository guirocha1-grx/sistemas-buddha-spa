import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { montarCorpoPreferenciaPagamento } from "./mercadoPagoApi";
import { extrairDataIdWebhookMercadoPago, validarAssinaturaWebhookMercadoPago } from "./mercadoPagoWebhook";
import { normalizarExtracaoCobrancaLink, montarMensagemExcecaoParcelamento } from "./cobrancaLink";
import { parcelamentoForaDoPadrao } from "@shared/cobrancaParcelamento";

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

  it("limita o parcelamento no checkout quando parcelas > 1", () => {
    const comParcelas = montarCorpoPreferenciaPagamento({
      titulo: "Day Spa",
      valor: 300,
      externalReference: "buddha-link-2-def",
      notificationUrl: "https://spa.grxcorp.com.br/api/webhooks/mercadopago",
      parcelas: 3,
    });
    expect(comParcelas).toMatchObject({ payment_methods: { installments: 3 } });

    const semParcelas = montarCorpoPreferenciaPagamento({
      titulo: "Day Spa",
      valor: 300,
      externalReference: "buddha-link-2-ghi",
      notificationUrl: "https://spa.grxcorp.com.br/api/webhooks/mercadopago",
      parcelas: 1,
    });
    expect(semParcelas).not.toHaveProperty("payment_methods");
  });
});

describe("regras de parcelamento da Cobrança por Link", () => {
  it("está dentro do padrão com parcela mínima de R$100 e até 3x", () => {
    expect(parcelamentoForaDoPadrao(300, 3)).toBe(false);
    expect(parcelamentoForaDoPadrao(100, 1)).toBe(false);
  });

  it("é exceção quando ultrapassa 3x, mesmo com parcela acima de R$100", () => {
    expect(parcelamentoForaDoPadrao(1000, 4)).toBe(true);
  });

  it("é exceção quando a parcela fica abaixo de R$100, mesmo dentro de 3x", () => {
    expect(parcelamentoForaDoPadrao(250, 3)).toBe(true); // R$83,33/parcela
  });

  it("monta a mensagem de exceção com valor por parcela calculado", () => {
    const texto = montarMensagemExcecaoParcelamento({
      clienteNome: "Ana Paula",
      valor: 250,
      parcelas: 3,
      motivo: "Negociação especial",
      autorizador: "Gerente Fulana",
      enviadoPor: "Recepção RBS",
    });
    expect(texto).toContain("Cliente: Ana Paula");
    expect(texto).toContain("Parcelas: 3x");
    expect(texto).toContain("83,33");
    expect(texto).toContain("Motivo: Negociação especial");
    expect(texto).toContain("Autorizador: Gerente Fulana");
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
