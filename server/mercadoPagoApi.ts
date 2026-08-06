/**
 * mercadoPagoApi.ts
 * Cliente de leitura pra API do Mercado Pago — bem mais simples que a do
 * Banco Inter: Bearer token gerado self-service no painel MP (Suas
 * integrações → Credenciais), sem certificado/mTLS.
 *
 * Usa GET /v1/payments/search — traz, no mesmo registro, tanto o valor
 * da venda quanto a taxa/parcela/líquido (diferente do Inter, onde
 * extrato bancário e dados de adquirente são dois sistemas separados).
 *
 * IMPORTANTE (lição aprendida com o Inter): os nomes de campo abaixo
 * (fee_details, transaction_details.net_received_amount, etc.) vêm da
 * doc pública, não de um payload real confirmado ainda. O primeiro
 * sync real deve ter a amostra bruta auditada antes de confiar 100% no
 * mapeamento — mesmo padrão de cautela que usamos pro Inter.
 */

const MP_BASE_URL = "https://api.mercadopago.com";

export interface MpFeeDetail {
  type: string;
  amount: number;
  fee_payer?: string;
}

export interface MpPagamento {
  id: number;
  date_approved: string | null; // ISO 8601 com timezone
  status: string;
  status_detail?: string;
  installments?: number;
  payment_method_id?: string; // "master", "visa", "pix", "account_money"...
  payment_type_id?: string; // "credit_card", "debit_card", "pix"...
  transaction_amount?: number;
  fee_details?: MpFeeDetail[];
  transaction_details?: {
    net_received_amount?: number;
    total_paid_amount?: number;
  };
  money_release_date?: string | null; // ISO 8601 — quando o valor é liberado/cai
  description?: string;
  external_reference?: string;
}

export interface MpPaymentsSearchResponse {
  paging: { total: number; limit: number; offset: number };
  results: MpPagamento[];
}

async function mpRequest<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${MP_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`[Mercado Pago] ${path} → ${res.status}: ${corpo}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Busca pagamentos aprovados num período (date_approved), paginado.
 * Escopo: leitura de pagamentos da própria conta (token de vendedor).
 */
export async function consultarPagamentos(
  accessToken: string,
  dataInicio: string, // AAAA-MM-DD
  dataFim: string, // AAAA-MM-DD
  offset = 0,
  limit = 50,
): Promise<MpPaymentsSearchResponse> {
  const params = new URLSearchParams({
    range: "date_approved",
    begin_date: `${dataInicio}T00:00:00.000-03:00`,
    end_date: `${dataFim}T23:59:59.999-03:00`,
    sort: "date_approved",
    criteria: "desc",
    offset: String(offset),
    limit: String(limit),
  });
  return mpRequest<MpPaymentsSearchResponse>(`/v1/payments/search?${params.toString()}`, accessToken);
}

/** Extrai bruto/taxa/líquido de um pagamento — undefined se algum campo não vier como esperado. */
export function extrairValoresMp(p: MpPagamento): { bruto?: number; taxa?: number; liquido?: number } {
  const bruto = p.transaction_amount;
  const taxa = p.fee_details?.reduce((soma, f) => soma + (f.amount ?? 0), 0);
  const liquido = p.transaction_details?.net_received_amount;
  return { bruto, taxa, liquido };
}
