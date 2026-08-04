/**
 * Z-API (WhatsApp não-oficial) — integração por unidade.
 *
 * Cada unidade tem sua própria instância Z-API, então instanceId/token/
 * clientToken são sempre passados como parâmetro explícito (mesmo padrão
 * de server/belleApi.ts), nunca lidos de ENV.
 */

const ZAPI_BASE_URL = "https://api.z-api.io/instances";

function buildUrl(instanceId: string, token: string, endpoint: string): string {
  return `${ZAPI_BASE_URL}/${instanceId}/token/${token}${endpoint}`;
}

async function zapiRequest<T>(
  instanceId: string,
  token: string,
  clientToken: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(buildUrl(instanceId, token, endpoint), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": clientToken,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Z-API error ${response.status}: ${errorBody || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export interface ZapiSendResult {
  messageId?: string;
  zaapId?: string;
}

export const zapiApi = {
  async sendText(
    instanceId: string,
    token: string,
    clientToken: string,
    phone: string,
    message: string,
  ): Promise<ZapiSendResult> {
    return zapiRequest<ZapiSendResult>(instanceId, token, clientToken, "/send-text", {
      phone,
      message,
    });
  },

  async sendImage(
    instanceId: string,
    token: string,
    clientToken: string,
    phone: string,
    imageUrl: string,
    caption?: string,
  ): Promise<ZapiSendResult> {
    return zapiRequest<ZapiSendResult>(instanceId, token, clientToken, "/send-image", {
      phone,
      image: imageUrl,
      caption,
    });
  },

  async sendAudio(
    instanceId: string,
    token: string,
    clientToken: string,
    phone: string,
    audioUrl: string,
  ): Promise<ZapiSendResult> {
    return zapiRequest<ZapiSendResult>(instanceId, token, clientToken, "/send-audio", {
      phone,
      audio: audioUrl,
    });
  },
};
