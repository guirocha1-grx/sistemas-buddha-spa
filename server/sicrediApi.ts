/**
 * sicrediApi.ts
 * Cliente para as APIs "Extrato de Conta Corrente" e "Saldo de Conta
 * Corrente" do Sicredi.
 *
 * ============================================================
 * PROVISÓRIO — ainda sem adesão aprovada no Portal do Desenvolvedor
 * do Sicredi, então não há acesso à documentação técnica exata (fica
 * atrás de login em developers.sicredi.com.br). Confirmado via doc
 * pública (general-information + API catalog):
 *   - Autenticação: OAuth 2.0 client_credentials + mTLS obrigatório
 *     em toda chamada, mesmo modelo do Inter (server/interApi.ts).
 *   - Consultas diretas, sem webhook.
 *   - Credenciais obtidas no Portal do Desenvolvedor após validação
 *     de certificado (CSR gerado e enviado pra emissão).
 * NÃO confirmado (ajustar assim que a adesão sair e chegar uma
 * amostra de payload real — mesmo processo usado pro Inter):
 *   - URL base exata (produtos diferentes do Sicredi usam hosts
 *     diferentes — ex. Pix usa api-pix.sicredi.com.br — "Extrato/
 *     Saldo de Conta Corrente" pode ter host próprio).
 *   - Se o token usa Basic Auth (client_id:client_secret em base64,
 *     como a API Pix) ou client_id/secret no corpo (como o Inter) —
 *     assumido Basic Auth abaixo por ser o padrão confirmado num
 *     produto Sicredi, mas pode variar por API.
 *   - Path exato dos endpoints de extrato/saldo e formato da resposta
 *     (nomes de campo, paginação).
 * ============================================================
 *
 * Credenciais armazenadas por unidade na tabela `unidades`:
 *   sicrediClientId, sicrediClientSecret, sicrediCertificado (.crt em
 *   PEM), sicrediChavePrivada (.key em PEM), sicrediCooperativa,
 *   sicrediAgencia, sicrediConta, sicrediAccessToken,
 *   sicrediTokenExpiresAt
 */

import * as https from "node:https";

// TODO(Fase B): confirmar host real assim que a adesão sair.
const SICREDI_BASE_URL = "https://api.sicredi.com.br";
const SICREDI_TOKEN_URL = `${SICREDI_BASE_URL}/oauth/token`;

export interface SicrediToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/** PROVISÓRIO — ajustar nomes de campo contra payload real (Fase B). */
export interface SicrediTransacao {
  data: string;
  tipoOperacao: "D" | "C";
  valor: string;
  descricao: string;
  historico?: string;
  documento?: string;
}

export interface SicrediExtratoResponse {
  transacoes: SicrediTransacao[];
}

export interface SicrediSaldoResponse {
  saldoDisponivel: string;
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
 * Obtém ou renova o token OAuth. Assume Basic Auth (client_id:secret em
 * base64) por ser o padrão confirmado na API Pix do Sicredi — confirmar
 * se "Extrato/Saldo de Conta Corrente" segue o mesmo (Fase B).
 */
export async function getSicrediAccessToken(
  clientId: string,
  clientSecret: string,
  credenciais: CredenciaisSicredi,
): Promise<{ accessToken: string; expiresAt: number }> {
  const body = new URLSearchParams({ grant_type: "client_credentials" }).toString();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await requisicaoHttps({
    url: SICREDI_TOKEN_URL,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(body)),
      Authorization: `Basic ${basicAuth}`,
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
  /** PROVISÓRIO — path e parâmetros não confirmados (Fase B). */
  async consultarExtrato(
    accessToken: string,
    dataInicio: string,
    dataFim: string,
    conta: { cooperativa?: string | null; agencia?: string | null; numeroConta?: string | null },
    credenciais: CredenciaisSicredi,
  ): Promise<SicrediExtratoResponse> {
    return sicrediRequest<SicrediExtratoResponse>(
      "/conta-corrente/v1/extrato",
      accessToken,
      {
        dataInicio,
        dataFim,
        cooperativa: conta.cooperativa ?? "",
        agencia: conta.agencia ?? "",
        conta: conta.numeroConta ?? "",
      },
      credenciais,
    );
  },

  /** PROVISÓRIO — path e formato de resposta não confirmados (Fase B). */
  async consultarSaldo(
    accessToken: string,
    conta: { cooperativa?: string | null; agencia?: string | null; numeroConta?: string | null },
    credenciais: CredenciaisSicredi,
  ): Promise<SicrediSaldoResponse> {
    return sicrediRequest<SicrediSaldoResponse>(
      "/conta-corrente/v1/saldo",
      accessToken,
      {
        cooperativa: conta.cooperativa ?? "",
        agencia: conta.agencia ?? "",
        conta: conta.numeroConta ?? "",
      },
      credenciais,
    );
  },
};
