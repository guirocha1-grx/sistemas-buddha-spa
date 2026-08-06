/**
 * interApi.ts
 * Cliente para a API Banking do Banco Inter (v2).
 *
 * Autenticação: OAuth 2.0 (client_credentials) **+ mTLS obrigatório**.
 * O Inter exige um certificado digital (par certificado/chave privada,
 * gerado no Portal de Desenvolvedores) apresentado em TODA chamada —
 * inclusive na própria troca de token. Por isso este arquivo usa
 * `node:https` diretamente (com `cert`/`key` na conexão) em vez de
 * `fetch()`: o `fetch` nativo do Node não expõe uma forma simples de
 * anexar certificado cliente por requisição.
 *
 * Base URL produção: https://cdpj.partners.bancointer.com.br
 * Escopo necessário: extrato.read, saldo.read
 * Rate limit: 10 req/min por endpoint
 * Token: válido por 60 minutos — deve ser reutilizado
 *
 * Credenciais armazenadas por unidade na tabela `unidades`:
 *   interClientId, interClientSecret, interCertificado (.crt em PEM),
 *   interChavePrivada (.key em PEM), interContaCorrente,
 *   interAccessToken, interTokenExpiresAt
 */

import * as https from "node:https";

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

/**
 * Formato confirmado em produção (payload real de 2026-08-05, transação
 * Pix recebido) — bem diferente do que a doc sugeria. Alguns campos
 * (lado "recebedor"/débito) ainda não foram confirmados com um exemplo
 * real, só inferidos por simetria com o lado "pagador".
 */
export interface InterDetalhesTransacao {
  txId?: string;
  nomePagador?: string;
  nomeRecebedor?: string;
  descricaoPix?: string;
  cpfCnpjPagador?: string;
  cpfCnpjRecebedor?: string;
  nomeEmpresaPagador?: string;
  nomeEmpresaRecebedor?: string;
  tipoDetalhe?: string;
  endToEndId?: string;
  chavePixRecebedor?: string;
  chavePixPagador?: string;
  [chaveNaoMapeada: string]: unknown;
}

export interface InterTransacaoCompleta {
  idTransacao: string;
  // Data+hora de inclusão ("AAAA-MM-DD HH:mm:ss.SSS") — não "dataEntrada"
  // como a doc sugeria. Usar .slice(0, 10) pra virar AAAA-MM-DD.
  dataInclusao?: string;
  dataTransacao: string;
  tipoTransacao: string;
  tipoOperacao: string;
  valor: string;
  titulo: string;
  descricao: string;
  numeroDocumento?: string;
  detalhes?: InterDetalhesTransacao;
  // Não confirmados num payload real ainda — mantidos por segurança
  // caso apareçam em outros tipos de transação (TED, boleto).
  contaOrigem?: string;
  contaDestino?: string;
}

/** AAAA-MM-DD a partir de dataInclusao ("...HH:mm:ss") ou dataTransacao. */
export function dataEntradaDe(t: InterTransacaoCompleta): string {
  return t.dataInclusao?.slice(0, 10) ?? t.dataTransacao;
}

/**
 * Extrai nome/CPF-CNPJ da contraparte a partir do lado certo (pagador
 * pra crédito recebido, recebedor pra débito enviado) — a API não manda
 * isso em campos planos como cpfCnpjOrigem/cpfCnpjDestino.
 */
export function extrairContraparte(t: InterTransacaoCompleta): {
  nomeOrigem?: string;
  nomeDestino?: string;
  cpfCnpjOrigem?: string;
  cpfCnpjDestino?: string;
} {
  const d = t.detalhes;
  if (!d) return {};
  if (t.tipoOperacao === "C") {
    return { nomeOrigem: d.nomePagador, cpfCnpjOrigem: d.cpfCnpjPagador };
  }
  return { nomeDestino: d.nomeRecebedor, cpfCnpjDestino: d.cpfCnpjRecebedor };
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

/**
 * Certificado mTLS — passado explicitamente em toda função pública
 * (mesmo padrão de token/client_id já usado neste arquivo: nada de
 * credencial lida de ENV ou global).
 */
export interface CredenciaisInter {
  certificado: string; // .crt em PEM
  chavePrivada: string; // .key em PEM
}

// ===== Helpers internos =====

interface RequisicaoHttps {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  cert: string;
  key: string;
}

function requisicaoHttps({ url, method = "GET", headers = {}, body, cert, key }: RequisicaoHttps): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const alvo = new URL(url);
    const req = https.request(
      {
        hostname: alvo.hostname,
        port: alvo.port || 443,
        path: `${alvo.pathname}${alvo.search}`,
        method,
        headers,
        cert,
        key,
      },
      (res) => {
        let dados = "";
        res.on("data", (chunk) => { dados += chunk; });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: dados }));
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Obtém ou renova o token OAuth para as credenciais fornecidas.
 * Retorna o access_token e o timestamp de expiração (ms).
 */
export async function getInterAccessToken(
  clientId: string,
  clientSecret: string,
  credenciais: CredenciaisInter,
): Promise<{ accessToken: string; expiresAt: number }> {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "extrato.read saldo.read",
    grant_type: "client_credentials",
  }).toString();

  const res = await requisicaoHttps({
    url: INTER_TOKEN_URL,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(body)),
    },
    body,
    cert: credenciais.certificado,
    key: credenciais.chavePrivada,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`[Inter OAuth] Falha ao obter token: ${res.status} — ${res.body}`);
  }

  const data = JSON.parse(res.body) as InterToken;
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
  contaCorrente: string | null | undefined,
  credenciais: CredenciaisInter,
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

  const res = await requisicaoHttps({
    url: url.toString(),
    headers,
    cert: credenciais.certificado,
    key: credenciais.chavePrivada,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`[Inter API] ${path} → ${res.status}: ${res.body}`);
  }

  return JSON.parse(res.body) as T;
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
    contaCorrente: string | null | undefined,
    credenciais: CredenciaisInter,
  ): Promise<InterExtratoResponse> {
    return interRequest<InterExtratoResponse>(
      "/extrato",
      accessToken,
      { dataInicio, dataFim },
      contaCorrente,
      credenciais,
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
    credenciais: CredenciaisInter,
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
      credenciais,
    );
  },

  /**
   * Consulta saldo da conta.
   * Escopo: saldo.read
   */
  async consultarSaldo(
    accessToken: string,
    contaCorrente: string | null | undefined,
    credenciais: CredenciaisInter,
  ): Promise<InterSaldoResponse> {
    return interRequest<InterSaldoResponse>(
      "/saldo",
      accessToken,
      {},
      contaCorrente,
      credenciais,
    );
  },
};
