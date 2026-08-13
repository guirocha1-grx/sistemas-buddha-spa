import { once } from "node:events";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerStorageProxy } from "./_core/storageProxy";

class FakeResponse extends Writable {
  chunks: Buffer[] = [];
  status = vi.fn(() => this);
  set = vi.fn(() => this);
  send = vi.fn(() => this);

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("storage proxy", () => {
  it("transmite a mídia pelo domínio do CRM sem redirecionar o navegador ao CDN", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: "https://cdn.example/anexo.png" }), { status: 200 }))
      .mockResolvedValueOnce(new Response("imagem", {
        status: 200,
        headers: { "Content-Type": "image/png", "Content-Length": "6" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    let handler: ((req: any, res: any) => Promise<void>) | undefined;
    registerStorageProxy({ get: vi.fn((_path: string, callback: typeof handler) => { handler = callback; }) } as any);
    const response = new FakeResponse();
    const finished = once(response, "finish");

    await handler?.({ params: { 0: "inbox/2/anexo.png" } }, response);
    await finished;

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.set).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(Buffer.concat(response.chunks).toString()).toBe("imagem");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
