import type { Express } from "express";
import { Readable } from "node:stream";
import { storageGetSignedUrl } from "../storage";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    try {
      const url = await storageGetSignedUrl(key);

      // Não redirecione mídias embutidas ao CDN. O navegador pode alterar a
      // URL assinada no redirecionamento e bloquear a prévia; transmitindo
      // os bytes pelo mesmo domínio, <img> e <audio> ficam estáveis dentro
      // do histórico do Inbox.
      const fileResp = await fetch(url);
      if (!fileResp.ok || !fileResp.body) {
        const body = await fileResp.text().catch(() => "");
        console.error(`[StorageProxy] file error: ${fileResp.status} ${body}`);
        res.status(502).send("Storage file unavailable");
        return;
      }

      const contentType = fileResp.headers.get("content-type");
      const contentLength = fileResp.headers.get("content-length");
      const contentDisposition = fileResp.headers.get("content-disposition");
      res.status(200).set("Cache-Control", "private, max-age=60");
      if (contentType) res.set("Content-Type", contentType);
      if (contentLength) res.set("Content-Length", contentLength);
      if (contentDisposition) res.set("Content-Disposition", contentDisposition);
      Readable.fromWeb(fileResp.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}
