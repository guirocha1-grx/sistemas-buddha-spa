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

// ===== Relatório "Dinheiro liberado" (extrato da conta — assíncrono) =====
// POST gera o relatório (202, processamento em background) → GET .../list
// pra saber quando ficou pronto (status "processed") → GET .../:file_name
// baixa o CSV. Formato de colunas documentado (DATE, SOURCE_ID,
// RECORD_TYPE, DESCRIPTION, NET_CREDIT_AMOUNT, NET_DEBIT_AMOUNT, ...)
// mas ainda sem confirmação com payload real — parser em routers.ts é
// por nome de coluna (não posição) e loga uma amostra bruta no primeiro
// sync, mesma cautela usada em toda a integração com o Inter.

export interface MpRelatorioInfo {
  file_name?: string;
  status?: string; // "processed" | "in_process" | ...
  begin_date?: string;
  end_date?: string;
}

export async function criarRelatorioLiberado(accessToken: string, dataInicio: string, dataFim: string): Promise<void> {
  const res = await fetch(`${MP_BASE_URL}/v1/account/release_report`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      begin_date: `${dataInicio}T00:00:00Z`,
      end_date: `${dataFim}T23:59:59Z`,
    }),
  });
  if (res.status !== 202 && !res.ok) {
    const corpo = await res.text();
    throw new Error(`[Mercado Pago] Falha ao gerar relatório de conta: ${res.status} — ${corpo}`);
  }
}

export async function listarRelatoriosLiberados(accessToken: string): Promise<MpRelatorioInfo[]> {
  const dados = await mpRequest<MpRelatorioInfo[] | { data?: MpRelatorioInfo[]; results?: MpRelatorioInfo[] }>(
    "/v1/account/release_report/list",
    accessToken,
  );
  if (Array.isArray(dados)) return dados;
  return dados.data ?? dados.results ?? [];
}

export async function baixarRelatorioLiberado(accessToken: string, fileName: string): Promise<string> {
  const res = await fetch(`${MP_BASE_URL}/v1/account/release_report/${encodeURIComponent(fileName)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`[Mercado Pago] Falha ao baixar relatório de conta: ${res.status} — ${corpo}`);
  }
  return res.text();
}

export interface LinhaExtratoMp {
  idTransacao: string;
  dataEntrada: string;
  tipoTransacao?: string;
  tipoOperacao: "C" | "D";
  valor: string;
  titulo?: string;
  descricao?: string;
}

/**
 * Parser do CSV do relatório "Dinheiro liberado" — por NOME de coluna
 * (não posição), porque o layout exato (DATE, SOURCE_ID, RECORD_TYPE,
 * DESCRIPTION, NET_CREDIT_AMOUNT, NET_DEBIT_AMOUNT, ...) vem só da doc
 * pública, sem confirmação com arquivo real ainda — se a ordem ou algum
 * nome vier diferente, isso ainda funciona (ou falha visivelmente por
 * coluna não encontrada, em vez de ler a coluna errada em silêncio).
 */
export function parseRelatorioLiberadoMp(texto: string): LinhaExtratoMp[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length < 2) return [];

  const delimitador = linhas[0].includes(";") ? ";" : ",";
  const cabecalho = linhas[0].split(delimitador).map((c) => c.trim().toUpperCase().replace(/^"|"$/g, ""));
  const indice = (nome: string) => cabecalho.indexOf(nome);

  const iData = indice("DATE");
  const iSourceId = indice("SOURCE_ID");
  const iExternalRef = indice("EXTERNAL_REFERENCE");
  const iTipo = indice("RECORD_TYPE");
  const iDescricao = indice("DESCRIPTION");
  const iCredito = indice("NET_CREDIT_AMOUNT");
  const iDebito = indice("NET_DEBIT_AMOUNT");

  if (iData === -1 || (iCredito === -1 && iDebito === -1)) {
    throw new Error(`Colunas esperadas não encontradas no CSV (cabeçalho: ${cabecalho.join(", ")})`);
  }

  const linhasDados: LinhaExtratoMp[] = [];
  for (const linha of linhas.slice(1)) {
    const campos = linha.split(delimitador).map((c) => c.trim().replace(/^"|"$/g, ""));
    const credito = parseFloat((campos[iCredito] ?? "0").replace(",", ".")) || 0;
    const debito = parseFloat((campos[iDebito] ?? "0").replace(",", ".")) || 0;
    if (credito === 0 && debito === 0) continue;

    const dataEntrada = (campos[iData] ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEntrada)) continue;

    const tipoOperacao: "C" | "D" = credito > 0 ? "C" : "D";
    const valor = Math.abs(credito > 0 ? credito : debito);
    const idBase = campos[iSourceId] || campos[iExternalRef] || `${dataEntrada}-${valor}`;

    linhasDados.push({
      idTransacao: `mp:${idBase}:${dataEntrada}`,
      dataEntrada,
      tipoTransacao: iTipo !== -1 ? campos[iTipo] : undefined,
      tipoOperacao,
      valor: valor.toFixed(2),
      titulo: iTipo !== -1 ? campos[iTipo] : undefined,
      descricao: iDescricao !== -1 ? campos[iDescricao] : undefined,
    });
  }
  return linhasDados;
}
