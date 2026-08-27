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
  payer?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    identification?: { type?: string; number?: string };
  };
  coupon_amount?: number;
  shipping_amount?: number;
  order?: { id?: string; type?: string };
  additional_info?: {
    items?: Array<{ title?: string; quantity?: number; unit_price?: number }>;
  };
  financing_group?: string; // ex.: "PSJ_LINK_HASTA_3X" — parcelamento sem juros
  // Campos opcionais de canal/origem. Eles não eram registrados pelo CRM,
  // então entram primeiro na amostra auditável da sincronização antes de
  // qualquer classificação de Link ou Point.
  point_of_interaction?: {
    type?: string;
    business_info?: { unit?: string; sub_unit?: string; branch?: string };
    transaction_data?: { pos_id?: string; store_id?: string };
  };
  pos_id?: string;
  store_id?: string;
  operation_type?: string;
  processing_mode?: string;
  collector_id?: number;
  application_id?: string;
}

/**
 * Recorte sem PII dos campos que podem identificar o canal de origem. A
 * referência externa não é gravada no log: basta registrar se ela existe
 * para a auditoria de Link/checkout sem expor conteúdo operacional.
 */
export function resumirOrigemPagamentoMp(pagamento: MpPagamento) {
  return {
    point_of_interaction_type: pagamento.point_of_interaction?.type ?? null,
    point_business_unit: pagamento.point_of_interaction?.business_info?.unit ?? null,
    point_business_sub_unit: pagamento.point_of_interaction?.business_info?.sub_unit ?? null,
    pos_id: pagamento.pos_id ?? pagamento.point_of_interaction?.transaction_data?.pos_id ?? null,
    store_id: pagamento.store_id ?? pagamento.point_of_interaction?.transaction_data?.store_id ?? null,
    order_type: pagamento.order?.type ?? null,
    operation_type: pagamento.operation_type ?? null,
    processing_mode: pagamento.processing_mode ?? null,
    possui_external_reference: Boolean(pagamento.external_reference),
    collector_id: pagamento.collector_id ?? null,
    application_id: pagamento.application_id ?? null,
  };
}

export type OrigemPagamentoMp = "link_pagamento" | "maquininha_point" | "online" | "indefinido";

/**
 * Classifica apenas sinais explícitos, comprovados no payload da API.
 * `external_reference` não é critério de Link: pode existir em outros
 * checkouts e permanece apenas como sinal de auditoria.
 */
export function classificarOrigemPagamentoMp(pagamento: MpPagamento): OrigemPagamentoMp {
  const origem = resumirOrigemPagamentoMp(pagamento);
  const tipoInteracao = origem.point_of_interaction_type?.toLowerCase() ?? "";
  const unidadeNegocio = origem.point_business_unit?.toLowerCase() ?? "";
  const subUnidadeNegocio = origem.point_business_sub_unit?.toLowerCase() ?? "";

  // Confirmado no sync RBS de 2026-08-27: CHECKOUT +
  // online_payments/payment_link identifica Link de Pagamento.
  if (subUnidadeNegocio === "payment_link") return "link_pagamento";

  // POS, store ou o domínio Point são indicadores operacionais de venda
  // presencial. Compras de equipamento Point são filtradas antes desta etapa.
  if (origem.pos_id || origem.store_id || tipoInteracao === "point" || unidadeNegocio === "point" || subUnidadeNegocio.includes("point")) {
    return "maquininha_point";
  }

  // Checkout explicitamente identificado como pagamentos online, mas que
  // não seja Link (tratado acima). Não usa somente `CHECKOUT` como critério.
  if (unidadeNegocio === "online_payments") return "online";

  return "indefinido";
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

export interface ColetaPagamentosMp {
  pagamentos: MpPagamento[];
  totalNaApi: number;
  paginasConsultadas: number;
  varreduras: number;
}

/**
 * O endpoint de pagamentos pode devolver um conjunto incompleto logo após
 * movimentações recentes da conta (inclusive `paging.total` menor que o
 * conjunto que passa a aparecer segundos depois). Uma única ação do usuário
 * faz até quatro varreduras curtas, une por ID e só então entrega as vendas.
 * Cada varredura ainda pagina normalmente quando há mais de uma página.
 */
export async function coletarPagamentosEstaveis(
  carregarPagina: (offset: number, limit: number) => Promise<MpPaymentsSearchResponse>,
  options: { limit?: number; varreduras?: number; esperaEntreVarredurasMs?: number } = {},
): Promise<ColetaPagamentosMp> {
  const limit = options.limit ?? 50;
  const varreduras = options.varreduras ?? 4;
  const esperaEntreVarredurasMs = options.esperaEntreVarredurasMs ?? 650;
  const porId = new Map<number, MpPagamento>();
  let totalNaApi = 0;
  let paginasConsultadas = 0;

  for (let tentativa = 0; tentativa < varreduras; tentativa++) {
    let offset = 0;
    while (true) {
      const pagina = await carregarPagina(offset, limit);
      paginasConsultadas++;
      totalNaApi = Math.max(totalNaApi, Number(pagina.paging.total) || 0);
      for (const pagamento of pagina.results) porId.set(pagamento.id, pagamento);

      // Página curta encerra a varredura atual. A próxima varredura volta ao
      // offset zero para capturar pagamentos que a API ainda estava indexando.
      if (pagina.results.length < limit) break;
      offset += limit;
      if (offset >= totalNaApi) break;
    }
    if (tentativa < varreduras - 1 && esperaEntreVarredurasMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, esperaEntreVarredurasMs));
    }
  }

  return { pagamentos: Array.from(porId.values()), totalNaApi, paginasConsultadas, varreduras };
}

export async function consultarTodosPagamentos(
  accessToken: string,
  dataInicio: string,
  dataFim: string,
): Promise<ColetaPagamentosMp> {
  return coletarPagamentosEstaveis(
    (offset, limit) => consultarPagamentos(accessToken, dataInicio, dataFim, offset, limit),
  );
}

/**
 * Compra do próprio equipamento Point não é venda da unidade. A API usa
 * transaction_amount como preço de tabela (R$ 840,80), enquanto
 * transaction_details.total_paid_amount traz o débito real após cupom
 * (R$ 199,90). Sem este filtro, a compra aparece como receita de Pix.
 */
export function ehCompraEquipamentoPoint(pagamento: MpPagamento): boolean {
  const descricao = (pagamento.description ?? "").toLowerCase();
  const valorTabela = Number(pagamento.transaction_amount ?? 0);
  const valorPago = Number(pagamento.transaction_details?.total_paid_amount ?? 0);
  const desconto = Number(pagamento.coupon_amount ?? 0);

  return descricao.includes("point smart")
    && pagamento.order?.type === "mercadopago"
    && valorTabela > 0
    && valorPago > 0
    && valorPago < valorTabela
    && desconto > 0;
}

/**
 * Extrai bruto/taxa/antecipação/líquido de um pagamento — undefined se
 * algum campo não vier como esperado.
 *
 * Confirmado com payload real (6 vendas, Ribeirão Shopping, 2026-08-05,
 * depuração via Manus): em vendas parceladas, fee_details tem
 * "mercadopago_fee" + "financing_fee" separados e bruto - taxa -
 * financing_fee bate exatamente com net_received_amount. Em vendas à
 * vista (1x), só "mercadopago_fee" aparece — mas net_received_amount
 * ainda vem menor do que bruto - taxa (ex.: venda de R$532,00, taxa
 * R$10,91, líquido real R$516,09 — R$5,00 "sumindo"). O MP cobra um
 * custo de antecipação em 1x sem declarar isso em fee_details.
 *
 * Por isso "antecipação" não vem de fee_details — vem por resíduo:
 * bruto - taxa - líquido. Nos casos parcelados isso dá exatamente o
 * mesmo valor que financing_fee (confirmado), e nos casos à vista
 * captura o custo escondido que não tem type próprio. net_received_amount
 * é o valor real recebido, então usar ele como âncora e calcular
 * antecipação por diferença é mais confiável do que confiar em
 * fee_details estar completo.
 */
export function extrairValoresMp(p: MpPagamento): { bruto?: number; taxa?: number; antecipacao?: number; liquido?: number } {
  const bruto = p.transaction_amount;
  const liquido = p.transaction_details?.net_received_amount;
  if (!p.fee_details) return { bruto, liquido };

  const taxa = p.fee_details
    .filter((f) => f.type !== "financing_fee")
    .reduce((soma, f) => soma + (f.amount ?? 0), 0);
  const antecipacao = (bruto !== undefined && liquido !== undefined) ? bruto - taxa - liquido : undefined;

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

/** Retorna status+corpo bruto — quem chama decide se loga pra diagnóstico. */
export async function criarRelatorioLiberado(accessToken: string, dataInicio: string, dataFim: string): Promise<{ status: number; corpo: string }> {
  const res = await fetch(`${MP_BASE_URL}/v1/account/release_report`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      begin_date: `${dataInicio}T00:00:00Z`,
      end_date: `${dataFim}T23:59:59Z`,
    }),
  });
  const corpo = await res.text();
  if (res.status !== 202 && !res.ok) {
    throw new Error(`[Mercado Pago] Falha ao gerar relatório de conta: ${res.status} — ${corpo}`);
  }
  return { status: res.status, corpo };
}

/** Texto bruto da resposta, sem nenhuma suposição de formato — pra diagnóstico. */
export async function listarRelatoriosLiberadosBruto(accessToken: string): Promise<string> {
  const res = await fetch(`${MP_BASE_URL}/v1/account/release_report/list`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const corpo = await res.text();
  if (!res.ok) throw new Error(`[Mercado Pago] Falha ao listar relatórios: ${res.status} — ${corpo}`);
  return corpo;
}

/**
 * Versão tipada — ainda sem confirmação com payload real de quais
 * campos/valores de status a API realmente usa, então tenta os
 * formatos de envelope mais comuns (array direto, {data}, {results}).
 * Se o mapeamento estiver errado, listarRelatoriosLiberadosBruto acima
 * é a fonte de verdade pra corrigir.
 */
export async function listarRelatoriosLiberados(accessToken: string): Promise<MpRelatorioInfo[]> {
  const bruto = await listarRelatoriosLiberadosBruto(accessToken);
  let dados: MpRelatorioInfo[] | { data?: MpRelatorioInfo[]; results?: MpRelatorioInfo[] };
  try {
    dados = JSON.parse(bruto);
  } catch {
    // res.ok pode vir true mesmo com corpo não-JSON (ex.: página HTML de
    // erro/manutenção servida com status 200) — listarRelatoriosLiberadosBruto
    // só lança quando !res.ok, então esse parse é o único ponto que detecta
    // esse caso. Sem o trecho bruto aqui, "Unexpected token '<'" não diz
    // qual página voltou (login, manutenção, 404 etc.) — mesmo raciocínio do
    // diagnóstico já usado em llm.ts pra resposta vazia da IA.
    throw new Error(`[Mercado Pago] Resposta de release_report/list não é JSON válido; início do corpo: ${bruto.slice(0, 300)}`);
  }
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
  // SOURCE_ID cru (sem o prefixo "mp:" nem a data) — candidato a bater
  // com o id de pagamento (adquirenteVendas.idTransacaoExterno), pra
  // enriquecer a descrição da liquidação com o tipo de venda de origem.
  // Confirmado com CSV real 2026-08-16.
  sourceId?: string;
  // PAYMENT_METHOD_TYPE ("credit_card"/"debit_card"/"pix"/...) e
  // PAYMENT_METHOD (bandeira, ex. "master") — colunas reais do relatório
  // (RECORD_TYPE, esperado pela doc pública, NÃO existe nesse CSV;
  // confirmado 2026-08-16). Usados em contas.sincronizarMercadoPago pra
  // dar um título legível às linhas que não batem com nenhuma venda
  // conhecida via SOURCE_ID.
  paymentMethodType?: string;
  paymentMethod?: string;
}

/**
 * RECORD_TYPE que são snapshot de saldo, não transação de verdade —
 * confirmado na doc oficial ("campos do relatório" de Liberações).
 * Precisa pular, senão viram linhas fantasma no extrato. Tudo que não
 * estiver nessa lista entra (release, payout — inclui transferência/
 * saque pra outra conta, com o RECORD_TYPE "payout" confirmado na doc
 * — dispute, refund, etc.), mesmo sem confirmação individual, pra não
 * perder movimento real por não reconhecer o tipo.
 */
const MP_RECORD_TYPES_SALDO = new Set(["initial_available_balance", "available_balance", "total"]);

/**
 * Parser do CSV do relatório "Dinheiro liberado" — por NOME de coluna
 * (não posição). Layout real confirmado 2026-08-16 (syncLogs,
 * amostra do CSV): DATE, SOURCE_ID, DESCRIPTION, NET_CREDIT_AMOUNT,
 * NET_DEBIT_AMOUNT, GROSS_AMOUNT, MP_FEE_AMOUNT, TAXES_AMOUNT,
 * PAYMENT_METHOD, TRANSACTION_APPROVAL_DATE, BUSINESS_UNIT, SUB_UNIT,
 * BALANCE_AMOUNT, PAYMENT_METHOD_TYPE, PURCHASE_ID — SEM coluna
 * RECORD_TYPE (a doc pública promete essa coluna, mas ela não veio no
 * arquivo real; iTipo abaixo fica sempre -1 na prática, mantido só por
 * segurança caso uma conta/versão diferente do relatório venha com
 * ela). DESCRIPTION, nesse formato, não é um texto legível — vem só
 * "payment"/"reserve_for_dispute"/etc., o mesmo valor que a doc
 * descreve pra RECORD_TYPE.
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
  const iPaymentMethod = indice("PAYMENT_METHOD");
  const iPaymentMethodType = indice("PAYMENT_METHOD_TYPE");

  if (iData === -1 || (iCredito === -1 && iDebito === -1)) {
    throw new Error(`Colunas esperadas não encontradas no CSV (cabeçalho: ${cabecalho.join(", ")})`);
  }

  const linhasDados: LinhaExtratoMp[] = [];
  for (const linha of linhas.slice(1)) {
    const campos = linha.split(delimitador).map((c) => c.trim().replace(/^"|"$/g, ""));

    const tipoRegistro = (iTipo !== -1 ? campos[iTipo] : "")?.trim().toLowerCase();
    if (tipoRegistro && MP_RECORD_TYPES_SALDO.has(tipoRegistro)) continue;

    const sourceId = iSourceId !== -1 ? campos[iSourceId] : undefined;
    const descricaoBruta = iDescricao !== -1 ? campos[iDescricao] : undefined;
    // Sem RECORD_TYPE nesse formato, o jeito de identificar a linha de
    // snapshot de saldo (sem SOURCE_ID nem DESCRIPTION, só o valor) é
    // por ausência de qualquer identificador — confirmado no CSV real:
    // é a primeira linha de cada período, só com DATE + valores.
    if (!sourceId && !descricaoBruta) continue;

    const credito = parseFloat((campos[iCredito] ?? "0").replace(",", ".")) || 0;
    const debito = parseFloat((campos[iDebito] ?? "0").replace(",", ".")) || 0;
    if (credito === 0 && debito === 0) continue;

    const dataEntrada = (campos[iData] ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataEntrada)) continue;

    const tipoOperacao: "C" | "D" = credito > 0 ? "C" : "D";
    const valor = Math.abs(credito > 0 ? credito : debito);
    const idBase = sourceId || campos[iExternalRef] || `${dataEntrada}-${valor}`;

    linhasDados.push({
      idTransacao: `mp:${idBase}:${dataEntrada}`,
      dataEntrada,
      tipoTransacao: iTipo !== -1 ? campos[iTipo] : undefined,
      tipoOperacao,
      valor: valor.toFixed(2),
      titulo: iTipo !== -1 ? campos[iTipo] : undefined,
      descricao: descricaoBruta,
      sourceId,
      paymentMethodType: iPaymentMethodType !== -1 ? campos[iPaymentMethodType] : undefined,
      paymentMethod: iPaymentMethod !== -1 ? campos[iPaymentMethod] : undefined,
    });
  }
  return linhasDados;
}
