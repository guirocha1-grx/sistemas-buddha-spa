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
  financing_group?: string; // ex.: "PSJ_LINK_HASTA_3X" — parcelamento sem juros
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

/**
 * Extrai bruto/taxa/antecipação/líquido de um pagamento — undefined se
 * algum campo não vier como esperado.
 *
 * Confirmado em payload real (venda parcelada 3x, Ribeirão Shopping,
 * 2026-08-05): fee_details vem com tipos separados — "mercadopago_fee"
 * (taxa normal da maquininha) e "financing_fee" (custo do parcelamento,
 * equivalente à "antecipação" do Interpag). Qualquer outro tipo que
 * apareça no futuro (ainda não visto: débito, Pix) cai em "taxa" por
 * padrão, pra não perder valor mesmo sem reconhecer o tipo.
 */
export function extrairValoresMp(p: MpPagamento): { bruto?: number; taxa?: number; antecipacao?: number; liquido?: number } {
  const bruto = p.transaction_amount;
  const liquido = p.transaction_details?.net_received_amount;
  if (!p.fee_details) return { bruto, liquido };

  let taxa = 0;
  let antecipacao = 0;
  for (const f of p.fee_details) {
    if (f.type === "financing_fee") antecipacao += f.amount ?? 0;
    else taxa += f.amount ?? 0;
  }
  return { bruto, taxa, antecipacao, liquido };
}
