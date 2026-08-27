import { createHmac, timingSafeEqual } from "node:crypto";

export type AssinaturaWebhookMpInput = {
  xSignature?: string | string[];
  xRequestId?: string | string[];
  dataId?: string | number | null;
  segredo?: string | null;
};

function cabecalhoUnico(valor: string | string[] | undefined): string {
  return Array.isArray(valor) ? valor[0] ?? "" : valor ?? "";
}

/**
 * Implementa a manifestação documentada pelo Mercado Pago:
 * `id:<data.id>;request-id:<x-request-id>;ts:<timestamp>;` assinada em
 * HMAC SHA-256. A comparação é constante para não vazar informação do hash.
 */
export function validarAssinaturaWebhookMercadoPago(input: AssinaturaWebhookMpInput): boolean {
  const assinatura = cabecalhoUnico(input.xSignature);
  const requestId = cabecalhoUnico(input.xRequestId);
  const dataId = input.dataId === undefined || input.dataId === null ? "" : String(input.dataId).toLowerCase();
  const segredo = input.segredo?.trim() ?? "";
  if (!assinatura || !requestId || !dataId || !segredo) return false;

  const partes = Object.fromEntries(assinatura.split(",").map((parte) => {
    const [chave, ...valor] = parte.trim().split("=");
    return [chave, valor.join("=")];
  }));
  const timestamp = partes.ts;
  const recebida = partes.v1;
  if (!timestamp || !recebida || !/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(recebida)) return false;

  const manifestacao = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const esperada = createHmac("sha256", segredo).update(manifestacao).digest("hex");
  const esperadoBuffer = Buffer.from(esperada, "hex");
  const recebidoBuffer = Buffer.from(recebida, "hex");
  return esperadoBuffer.length === recebidoBuffer.length && timingSafeEqual(esperadoBuffer, recebidoBuffer);
}

export function extrairDataIdWebhookMercadoPago(params: {
  query?: Record<string, unknown>;
  body?: { data?: { id?: unknown }; type?: unknown; action?: unknown } | null;
}): string | null {
  const daQuery = params.query?.["data.id"];
  const doCorpo = params.body?.data?.id;
  const candidato = daQuery ?? doCorpo;
  if (typeof candidato !== "string" && typeof candidato !== "number") return null;
  const valor = String(candidato).trim();
  return /^\d+$/.test(valor) ? valor : null;
}
