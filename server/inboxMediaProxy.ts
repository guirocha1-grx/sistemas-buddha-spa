import { Readable } from "node:stream";
import type { Response } from "express";

type SignedUrlGetter = (key: string) => Promise<string>;

/** Entrega bytes de um anexo pelo próprio domínio do CRM para uso em <img>. */
export async function pipeInboxMedia(
  key: string,
  res: Response,
  getSignedUrl: SignedUrlGetter,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  // "fluxos/" também passa por aqui — miniatura de mídia de Fluxo
  // (preview em Scripts.tsx/ScriptPicker.tsx, 2026-08-13), mesma rota
  // em vez de duplicar o proxy só pra esse caso.
  if (!key.startsWith("inbox/") && !key.startsWith("fluxos/")) {
    res.status(400).send("Invalid media key");
    return;
  }

  const signedUrl = await getSignedUrl(key);
  const fileResp = await fetchFn(signedUrl);
  if (!fileResp.ok || !fileResp.body) {
    const body = await fileResp.text().catch(() => "");
    console.error(`[InboxMediaProxy] file error: ${fileResp.status} ${body}`);
    res.status(502).send("Inbox media unavailable");
    return;
  }

  const contentType = fileResp.headers.get("content-type");
  const contentLength = fileResp.headers.get("content-length");
  res.status(200).set("Cache-Control", "private, max-age=60");
  if (contentType) res.set("Content-Type", contentType);
  if (contentLength) res.set("Content-Length", contentLength);
  Readable.fromWeb(fileResp.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
}
