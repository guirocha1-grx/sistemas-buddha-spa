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

async function zapiGet<T>(
  instanceId: string,
  token: string,
  clientToken: string,
  endpoint: string,
): Promise<T | null> {
  const response = await fetch(buildUrl(instanceId, token, endpoint), {
    method: "GET",
    headers: { "Client-Token": clientToken },
  });
  if (!response.ok) return null;
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

  async sendDocument(
    instanceId: string,
    token: string,
    clientToken: string,
    phone: string,
    documentUrl: string,
    fileName?: string,
  ): Promise<ZapiSendResult> {
    return zapiRequest<ZapiSendResult>(instanceId, token, clientToken, "/send-document/pdf", {
      phone,
      document: documentUrl,
      ...(fileName ? { fileName } : {}),
    });
  },

  /**
   * Resolve um identificador "@lid" (contato via anúncio "clique para
   * WhatsApp", que chega sem o telefone real) para o número de verdade.
   * Retorna null se a Z-API não conseguir resolver — nesse caso a
   * conversa continua identificada só pelo lid.
   */
  async resolveLid(
    instanceId: string,
    token: string,
    clientToken: string,
    lid: string,
  ): Promise<{ phone: string; name: string; imgUrl?: string } | null> {
    const data = await zapiGet<any>(instanceId, token, clientToken, `/contacts/${encodeURIComponent(lid)}`);
    const rawPhone = data?.phone;
    if (!rawPhone || typeof rawPhone !== "string" || rawPhone.includes("@")) return null;
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length < 10) return null;
    if (rawPhone === lid || digits === lid.replace(/\D/g, "")) return null;
    return { phone: rawPhone, name: data.name || data.short || "", imgUrl: data.imgUrl };
  },

  async getProfilePicture(
    instanceId: string,
    token: string,
    clientToken: string,
    phone: string,
  ): Promise<string | null> {
    const data = await zapiGet<any>(instanceId, token, clientToken, `/profile-picture?phone=${phone}`);
    const url = data?.value || data?.profilePictureUrl || null;
    return typeof url === "string" && url.startsWith("http") ? url : null;
  },

  async getQrCodeImage(
    instanceId: string,
    token: string,
    clientToken: string,
  ): Promise<string | null> {
    const data = await zapiGet<any>(instanceId, token, clientToken, "/qr-code-image");
    const value = data?.value || data?.qrcode || data?.base64;
    if (!value) return null;
    if (typeof value === "string" && value.startsWith("data:image")) return value;
    if (typeof value === "string" && value.startsWith("/9j/")) return `data:image/jpeg;base64,${value}`;
    if (typeof value === "string" && value.startsWith("iVBOR")) return `data:image/png;base64,${value}`;
    return typeof value === "string" ? value : null;
  },

  async getStatus(
    instanceId: string,
    token: string,
    clientToken: string,
  ): Promise<{ connected?: boolean; status?: string; phone?: string } | null> {
    return zapiGet<any>(instanceId, token, clientToken, "/status");
  },
};
