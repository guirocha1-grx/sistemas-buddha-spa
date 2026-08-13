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
   *
   * Não usa zapiGet aqui de propósito: zapiGet engole qualquer resposta
   * não-2xx e devolve null sem dizer por quê (404 de contato ainda não
   * sincronizado do lado da Z-API vs. 401 de credencial errada vs. 500
   * são causas bem diferentes) — loga status+corpo em cada caminho de
   * falha pra dar pra diagnosticar direto no log do servidor.
   */
  async resolveLid(
    instanceId: string,
    token: string,
    clientToken: string,
    lid: string,
  ): Promise<{ phone: string; name: string; imgUrl?: string } | null> {
    const response = await fetch(buildUrl(instanceId, token, `/contacts/${encodeURIComponent(lid)}`), {
      method: "GET",
      headers: { "Client-Token": clientToken },
    });
    if (!response.ok) {
      const corpo = await response.text().catch(() => "");
      console.error(`[Z-API resolveLid] ${lid} → HTTP ${response.status}: ${corpo.slice(0, 300)}`);
      return null;
    }
    const data = await response.json() as any;
    const rawPhone = data?.phone;
    if (!rawPhone || typeof rawPhone !== "string" || rawPhone.includes("@")) {
      console.warn(`[Z-API resolveLid] ${lid} → resposta sem phone válido: ${JSON.stringify(data).slice(0, 300)}`);
      return null;
    }
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length < 10) {
      console.warn(`[Z-API resolveLid] ${lid} → phone retornado muito curto: ${rawPhone}`);
      return null;
    }
    if (rawPhone === lid || digits === lid.replace(/\D/g, "")) {
      console.warn(`[Z-API resolveLid] ${lid} → phone retornado é o próprio lid, não resolvido`);
      return null;
    }
    console.log(`[Z-API resolveLid] ${lid} → ${rawPhone} (${data.name})`);
    return { phone: rawPhone, name: data.name || data.short || "", imgUrl: data.imgUrl };
  },

  /**
   * Não usa zapiGet aqui de propósito, mesmo motivo do resolveLid: precisa
   * do corpo da resposta em caso de erro pra diagnosticar (rate limit,
   * credencial errada, endpoint fora do plano contratado etc.), coisa que
   * zapiGet engole silenciosamente.
   */
  async getProfilePicture(
    instanceId: string,
    token: string,
    clientToken: string,
    phone: string,
  ): Promise<string | null> {
    const response = await fetch(buildUrl(instanceId, token, `/profile-picture?phone=${phone}`), {
      method: "GET",
      headers: { "Client-Token": clientToken },
    });
    if (!response.ok) {
      const corpo = await response.text().catch(() => "");
      console.warn(`[Z-API getProfilePicture] ${phone} → HTTP ${response.status}: ${corpo.slice(0, 300)}`);
      return null;
    }
    const data = await response.json() as any;
    // Z-API retorna { value: "..." }, { profilePictureUrl: "..." } ou só
    // { link: "..." } — confirmado em produção no mobai-crm que a resposta
    // às vezes só tem "link", e checar só as outras duas chaves faz a foto
    // nunca ser encontrada mesmo com a consulta funcionando.
    const url = data?.value || data?.profilePictureUrl || data?.link || null;
    if (typeof url === "string" && url.startsWith("http")) return url;
    console.warn(`[Z-API getProfilePicture] ${phone} → resposta sem URL válida: ${JSON.stringify(data).slice(0, 300)}`);
    return null;
  },

  /**
   * Foto de grupo — /profile-picture é voltado a contato individual e não
   * devolve nada pra ID de grupo (sufixo "-group"). O endpoint de metadata
   * de chat (GET /chats/{phone}, confirmado em developer.z-api.io/en/chats/
   * get-metadata-chat) devolve profileThumbnail pra qualquer chat, grupo
   * incluso — é o que usamos aqui em vez de getProfilePicture.
   */
  async getGroupPhoto(
    instanceId: string,
    token: string,
    clientToken: string,
    groupPhone: string,
  ): Promise<string | null> {
    const response = await fetch(buildUrl(instanceId, token, `/chats/${groupPhone}`), {
      method: "GET",
      headers: { "Client-Token": clientToken },
    });
    if (!response.ok) {
      const corpo = await response.text().catch(() => "");
      console.warn(`[Z-API getGroupPhoto] ${groupPhone} → HTTP ${response.status}: ${corpo.slice(0, 300)}`);
      return null;
    }
    const data = await response.json() as any;
    const url = data?.profileThumbnail || null;
    if (typeof url === "string" && url.startsWith("http")) return url;
    console.warn(`[Z-API getGroupPhoto] ${groupPhone} → resposta sem profileThumbnail: ${JSON.stringify(data).slice(0, 300)}`);
    return null;
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
