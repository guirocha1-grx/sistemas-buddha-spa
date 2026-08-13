export interface InboxAttachmentMetadata {
  url?: string;
  storageKey?: string;
  legenda?: string;
  fileName?: string;
}

function storageProxyUrl(key: string): string {
  const encodedKey = key
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => {
      try {
        // URL.pathname devolve trechos já codificados (%20). Decodificar
        // antes evita transformar o sinal de porcentagem em %25.
        return encodeURIComponent(decodeURIComponent(segment));
      } catch {
        return encodeURIComponent(segment);
      }
    })
    .join("/");
  return `/manus-storage/${encodedKey}`;
}

/**
 * O Inbox persiste o storageKey desde a correção de anexos. Para mensagens
 * anteriores, reaproveita a parte inbox/... da URL CloudFront antiga. O proxy
 * gera uma URL assinada nova no momento da visualização, evitando imagens
 * quebradas quando a assinatura gravada no histórico já não é reutilizável.
 */
export function getInboxAttachmentUrl(meta: InboxAttachmentMetadata): string | undefined {
  if (meta.storageKey) return storageProxyUrl(meta.storageKey);
  if (!meta.url) return undefined;

  try {
    const path = new URL(meta.url).pathname;
    const inboxIndex = path.indexOf("/inbox/");
    if (inboxIndex >= 0) return storageProxyUrl(path.slice(inboxIndex + 1));
  } catch {
    // URLs relativas e URLs legadas que não seguem o formato do CloudFront
    // continuam disponíveis pelo valor que já estava no histórico.
  }

  return meta.url;
}
