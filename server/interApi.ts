/**
 * interApi.ts
 * Cliente para a API Banking do Banco Inter (v2).
 *
 * Autenticação: OAuth 2.0 (client_credentials)
 * Base URL produção: https://cdpj.partners.bancointer.com.br
 * Escopo necessário: extrato.read
 * Rate limit: 10 req/min por endpoint
 * Token: válido por 60 minutos — deve ser reutilizado
 *
 * Credenciais armazenadas por unidade na tabela `unidades`:
 *   interClientId, interClientSecret, interContaCorrente,
 *   interAccessToken, interTokenExpiresAt
 */

const INTER_BASE_URL = "https://cdpj.partners.bancointer.com.br";
const INTER_TOKEN_URL = `${INTER_BASE_URL}/oauth/v2/token`;

// ===== Tipos =====

export interface InterToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface InterTransacao {
  cpmf: string;
  dataEntrada: string;
  tipoTransacao: string;
  tipoOperacao: string;
  valor: string;
  titulo: string;
  descricao: string;
}

export interface InterExtratoResponse {
  transacoes: InterTransacao[];
}

export interface InterTransacaoCompleta {
  idTransacao: string;
  dataEntrada: string;
  dataTransacao: string;
  tipoTransacao: string;
  tipoOperacao: string;
  valor: string;
  titulo: string;
  descricao: string;
  detalhe: string;
  contaOrigem?: string;
  contaDestino?: string;
  nomeOrigem?: string;
  nomeDestino?: string;
  cpfCnpjOrigem?: string;
  cpfCnpjDestino?: string;
  cpmf?: string;
}

export interface InterExtratoCompletoResponse {
  totalElementos: number;
  numeroDeElementos: number;
  hasMore?: boolean;
  scrollId?: string;
  transacoes: InterTransacaoCompleta[];
}

export interface InterSaldoResponse {
  disponivel: string;
  bloqueadoCheque: string;
  bloqueadoJudicialmente: string;
  bloqueadoAdministrativo: string;
}

// ===== Helpers internos =====

/**
 * Obtém ou renova o token OAuth para as credenciais fornecidas.
 * Retorna o access_token e o timestamp de expiração (ms).
 */
export async function getInterAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "extrato.read saldo.read",
    grant_type: "client_credentials",
  });

  const res = await fetch(INTER_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[Inter OAuth] Falha ao obter token: ${res.status} — ${text}`);
  }

  const data = (await res.json()) as InterToken;
  // expires_in em segundos; subtrai 60s de margem de segurança
  const expiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return { accessToken: data.access_token, expiresAt };
}

/**
 * Verifica se o token armazenado ainda é válido.
 */
export function isTokenValid(expiresAt: number | null | undefined): boolean {
  if (!expiresAt) return false;
  return Date.now() < expiresAt;
}

/**
 * Executa uma requisição autenticada à API Banking do Inter.
 */
async function interRequest<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {},
  contaCorrente?: string | null,
): Promise<T> {
  const url = new URL(`${INTER_BASE_URL}/banking/v2${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };

  if (contaCorrente) {
    headers["x-conta-corrente"] = contaCorrente;
  }

  const res = await fetch(url.toString(), { headers });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[Inter API] ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ===== Métodos públicos =====

export const interApi = {
  /**
   * Consulta extrato simples por período (máx 90 dias).
   * Escopo: extrato.read
   */
  async consultarExtrato(
    accessToken: string,
    dataInicio: string,
    dataFim: string,
    contaCorrente?: string | null,
  ): Promise<InterExtratoResponse> {
    return interRequest<InterExtratoResponse>(
      "/extrato",
      accessToken,
      { dataInicio, dataFim },
      contaCorrente,
    );
  },

  /**
   * Consulta extrato enriquecido com paginação.
   * Escopo: extrato.read
   */
  async consultarExtratoCompleto(
    accessToken: string,
    dataInicio: string,
    dataFim: string,
    opcoes: {
      pagina?: number;
      tamanhoPagina?: number;
      tipoOperacao?: "D" | "C";
      tipoTransacao?: string;
      scrollEnabled?: boolean;
      scrollId?: string;
      contaCorrente?: string | null;
    } = {},
  ): Promise<InterExtratoCompletoResponse> {
    const params: Record<string, string> = { dataInicio, dataFim };
    if (opcoes.pagina !== undefined) params.pagina = String(opcoes.pagina);
    if (opcoes.tamanhoPagina !== undefined) params.tamanhoPagina = String(opcoes.tamanhoPagina);
    if (opcoes.tipoOperacao) params.tipoOperacao = opcoes.tipoOperacao;
    if (opcoes.tipoTransacao) params.tipoTransacao = opcoes.tipoTransacao;
    if (opcoes.scrollEnabled) params.scrollEnabled = "true";
    if (opcoes.scrollId) params.scrollId = opcoes.scrollId;

    return interRequest<InterExtratoCompletoResponse>(
      "/extrato/completo",
      accessToken,
      params,
      opcoes.contaCorrente,
    );
  },

  /**
   * Consulta saldo da conta.
   * Escopo: saldo.read
   */
  async consultarSaldo(
    accessToken: string,
    contaCorrente?: string | null,
  ): Promise<InterSaldoResponse> {
    return interRequest<InterSaldoResponse>(
      "/saldo",
      accessToken,
      {},
      contaCorrente,
    );
  },
};
