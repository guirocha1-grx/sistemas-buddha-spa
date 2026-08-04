/**
 * Helper Z-API — funções de envio de mensagens via WhatsApp
 * Portado do Mobai CRM, adaptado para o Buddha Spa.
 * Documentação: https://developer.z-api.io/
 */

import { ENV } from "./_core/env";

/**
 * Set de messageIds enviados pelo próprio CRM via API.
 * Usado para distinguir mensagens do CRM de mensagens recebidas no webhook.
 * Expira automaticamente após 5 minutos para não crescer indefinidamente.
 */
export const _crmSentMessageIds = new Map<string, number>();

export function registerCrmMessageId(messageId: string): void {
  const now = Date.now();
  _crmSentMessageIds.set(messageId, now);
  for (const [id, ts] of Array.from(_crmSentMessageIds.entries())) {
    if (now - ts > 5 * 60 * 1000) _crmSentMessageIds.delete(id);
  }
}

export function isCrmMessageId(messageId: string): boolean {
  return _crmSentMessageIds.has(messageId);
}

function getZapiBase(): string {
  return `https://api.z-api.io/instances/${ENV.zapiInstanceId}/token/${ENV.zapiToken}`;
}

function getZapiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ENV.zapiClientToken) {
    headers["Client-Token"] = ENV.zapiClientToken;
  }
  return headers;
}

export async function zapiSendText(phone: string, message: string): Promise<string | null> {
  const base = getZapiBase();
  const resp = await fetch(`${base}/send-text`, {
    method: "POST",
    headers: getZapiHeaders(),
    body: JSON.stringify({ phone, message }),
  });
  const bodyText = await resp.text().catch(() => "");
  if (!resp.ok) {
    throw new Error(`Z-API send-text falhou (${resp.status}): ${bodyText}`);
  }
  let messageId: string | null = null;
  try {
    const parsed = JSON.parse(bodyText);
    messageId = parsed.messageId || parsed.id || null;
    if (messageId) registerCrmMessageId(messageId);
  } catch {}
  console.log(`[Z-API] send-text → ${phone} | messageId: ${messageId}`);
  return messageId;
}

export async function zapiSendImage(phone: string, imageUrl: string, caption?: string): Promise<string | null> {
  const base = getZapiBase();
  const payload: Record<string, string> = { phone, image: imageUrl };
  if (caption) payload.caption = caption;
  const resp = await fetch(`${base}/send-image`, {
    method: "POST",
    headers: getZapiHeaders(),
    body: JSON.stringify(payload),
  });
  const bodyText = await resp.text().catch(() => "");
  if (!resp.ok) {
    throw new Error(`Z-API send-image falhou (${resp.status}): ${bodyText}`);
  }
  let messageId: string | null = null;
  try {
    const parsed = JSON.parse(bodyText);
    messageId = parsed.messageId || parsed.id || null;
    if (messageId) registerCrmMessageId(messageId);
  } catch {}
  return messageId;
}

export async function zapiSendAudio(phone: string, audioUrl: string): Promise<string | null> {
  const base = getZapiBase();
  const resp = await fetch(`${base}/send-audio`, {
    method: "POST",
    headers: getZapiHeaders(),
    body: JSON.stringify({ phone, audio: audioUrl }),
  });
  const bodyText = await resp.text().catch(() => "");
  if (!resp.ok) {
    throw new Error(`Z-API send-audio falhou (${resp.status}): ${bodyText}`);
  }
  let messageId: string | null = null;
  try {
    const parsed = JSON.parse(bodyText);
    messageId = parsed.messageId || parsed.id || null;
    if (messageId) registerCrmMessageId(messageId);
  } catch {}
  return messageId;
}

export async function zapiSendDocument(phone: string, documentUrl: string, fileName?: string): Promise<string | null> {
  const base = getZapiBase();
  const payload: Record<string, string> = { phone, document: documentUrl };
  if (fileName) payload.fileName = fileName;
  const resp = await fetch(`${base}/send-document/pdf`, {
    method: "POST",
    headers: getZapiHeaders(),
    body: JSON.stringify(payload),
  });
  const bodyText = await resp.text().catch(() => "");
  if (!resp.ok) {
    throw new Error(`Z-API send-document falhou (${resp.status}): ${bodyText}`);
  }
  let messageId: string | null = null;
  try {
    const parsed = JSON.parse(bodyText);
    messageId = parsed.messageId || parsed.id || null;
    if (messageId) registerCrmMessageId(messageId);
  } catch {}
  return messageId;
}

export async function zapiResolveLid(lid: string): Promise<{ phone: string; name: string; imgUrl?: string } | null> {
  try {
    const base = getZapiBase();
    const clientToken = ENV.zapiClientToken;
    if (!clientToken) {
      console.warn('[Z-API] zapiResolveLid: ZAPI_CLIENT_TOKEN não configurado');
      return null;
    }
    const resp = await fetch(`${base}/contacts/${encodeURIComponent(lid)}`, {
      method: "GET",
      headers: getZapiHeaders(),
    });
    if (!resp.ok) {
      console.warn(`[Z-API] zapiResolveLid falhou (${resp.status}) para lid: ${lid}`);
      return null;
    }
    const data = await resp.json() as any;
    const rawPhone = data?.phone;
    if (rawPhone && typeof rawPhone === 'string' && !rawPhone.includes('@')) {
      const digits = rawPhone.replace(/\D/g, '');
      if (digits.length < 10) return null;
      if (rawPhone === lid || digits === lid.replace(/\D/g, '')) return null;
      return { phone: rawPhone, name: data.name || data.short || '', imgUrl: data.imgUrl };
    }
    return null;
  } catch (e) {
    console.error('[Z-API] zapiResolveLid erro:', e);
    return null;
  }
}

export async function zapiGetProfilePicture(phone: string): Promise<string | null> {
  try {
    const base = getZapiBase();
    const resp = await fetch(`${base}/profile-picture?phone=${phone}`, {
      method: "GET",
      headers: getZapiHeaders(),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as any;
    const url = data?.value || data?.profilePictureUrl || null;
    if (url && typeof url === "string" && url.startsWith("http")) {
      return url;
    }
    return null;
  } catch {
    return null;
  }
}
