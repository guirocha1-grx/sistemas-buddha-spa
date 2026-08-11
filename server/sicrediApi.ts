/**
 * sicrediApi.ts
 * Cliente para a API "Extrato de Conta Corrente" do Sicredi.
 *
 * Confirmado contra a documentação oficial (developers.sicredi.com.br/
 * public/docs/getting-started-current-account, 2026-08-11):
 *   - Autenticação: OAuth 2.0 client_credentials + mTLS obrigatório em
 *     toda chamada, mesmo servidor de auth da família Multipag.
 *     Credenciais vão no CORPO da requisição (client_id/client_secret/
 *     grant_type/scope), não em Basic Auth — diferente do que a versão
 *     anterior deste arquivo assumia.
 *   - Escopo: contacorrente.extratos.consultar.
 *   - Endpoint plural: GET /contacorrente/v1/extratos (não /extrato).
 *   - Sem parâmetros de cooperativa/agência/conta na query — a conta é
 *     implícita nas credenciais/certificado do associado.
 *   - Paginado (page/size); resposta traz saldoAnterior + saldo por
 *     movimento (não precisa recalcular saldo corrido).
 *   - Token Bearer, validade 60 min.
 *
 * NÃO confirmado ainda: API "Saldo de Conta Corrente" (saldo atual,
 * bloqueios, limite de cheque especial) — doc existe mas ainda não foi
 * consultada; consultarSaldo() permanece um stub até isso acontecer.
 *
 * Credenciais armazenadas por unidade na tabela `unidades`:
 *   sicrediClientId, sicrediClientSecret, sicrediCertificado (.crt em
 *   PEM), sicrediChavePrivada (.key em PEM) — obtidos via Portal do
 *   Desenvolvedor (developer.sicredi.com.br), não geração manual de
 *   CSR: o próprio Portal tem o fluxo "Registrar Novo CSR" em
 *   Certificados e Credenciais.
 */

import * as https from "node:https";

const SICREDI_BASE_URL = "https://mtls-api-parceiro.sicredi.com.br";
const SICREDI_AUTH_URL = `${SICREDI_BASE_URL}/thirdparty/auth/token`;
const SICREDI_SCOPE = "contacorrente.extratos.consultar";

export interface SicrediToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface SicrediMovimento {
  data: string; // yyyy-mm-dd
  descricao: string;
  complemento: string | null;
  documento: string | null;
  valor: number; // negativo = débito, positivo = crédito
  saldo: number; // saldo resultante após este movimento
  codigoLancamento: string;
  idMovimento: string; // identificador único do movimento — usar como idTransacao
}

export interface SicrediExtratoResponse {
  saldoAnterior: number;
  dtlMovimentos: SicrediMovimento[];
  quantidade: number;
  totalElements: number;
  totalPages: number;
  pageNumber: number;
  pageSize: number;
}

export interface CredenciaisSicredi {
  certificado: string; // .crt em PEM
  chavePrivada: string; // .key em PEM
}

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
 * Obtém ou renova o token OAuth. Credenciais vão no corpo (urlencoded),
 * não em header Authorization — confirmado no exemplo curl da doc
 * oficial.
 */
export async function getSicrediAccessToken(
  clientId: string,
  clientSecret: string,
  credenciais: CredenciaisSicredi,
): Promise<{ accessToken: string; expiresAt: number }> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: SICREDI_SCOPE,
  }).toString();

  const res = await requisicaoHttps({
    url: SICREDI_AUTH_URL,
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
    throw new Error(`[Sicredi OAuth] Falha ao obter token: ${res.status} — ${res.body}`);
  }

  const data = JSON.parse(res.body) as SicrediToken;
  const expiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return { accessToken: data.access_token, expiresAt };
}

export function isSicrediTokenValid(expiresAt: number | null | undefined): boolean {
  if (!expiresAt) return false;
  return Date.now() < expiresAt;
}

async function sicrediRequest<T>(
  path: string,
  accessToken: string,
  params: Record<string, string>,
  credenciais: CredenciaisSicredi,
): Promise<T> {
  const url = new URL(`${SICREDI_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const res = await requisicaoHttps({
    url: url.toString(),
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cert: credenciais.certificado,
    key: credenciais.chavePrivada,
  });

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`[Sicredi API] ${path} → ${res.status}: ${res.body}`);
  }

  return JSON.parse(res.body) as T;
}

export const sicrediApi = {
  /**
   * GET /contacorrente/v1/extratos — paginado. `size` default 100 pra
   * reduzir o número de chamadas; ajustar se a API tiver um teto menor
   * em produção (a doc não especifica um máximo).
   */
  async consultarExtrato(
    accessToken: string,
    dataInicio: string,
    dataFim: string,
    credenciais: CredenciaisSicredi,
    page = 0,
    size = 100,
  ): Promise<SicrediExtratoResponse> {
    return sicrediRequest<SicrediExtratoResponse>(
      "/contacorrente/v1/extratos",
      accessToken,
      { dataInicio, dataFim, page: String(page), size: String(size) },
      credenciais,
    );
  },

  /**
   * PROVISÓRIO — API "Saldo de Conta Corrente" documentada
   * separadamente pelo Sicredi, ainda não consultada. Path/formato
   * abaixo são um chute e vão falhar até isso ser confirmado.
   */
  async consultarSaldo(): Promise<never> {
    throw new Error(
      "API Saldo de Conta Corrente do Sicredi ainda não foi confirmada — falta consultar a documentação oficial (link 'API Saldo de Conta Corrente Sicredi' no portal do desenvolvedor).",
    );
  },
};
