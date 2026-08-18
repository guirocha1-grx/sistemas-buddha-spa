import { once } from "node:events";
import { Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { pipeInboxMedia } from "./inboxMediaProxy";

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

describe("pipeInboxMedia", () => {
  it("transmite bytes da imagem pela rota do Inbox", async () => {
    const response = new FakeResponse();
    const finished = once(response, "finish");
    const getSignedUrl = vi.fn().mockResolvedValue("https://cdn.example/imagem.png");
    const fetchFn = vi.fn().mockResolvedValue(new Response("imagem", {
      status: 200,
      headers: { "Content-Type": "image/png", "Content-Length": "6" },
    }));

    await pipeInboxMedia("inbox/2/imagem.png", response as any, getSignedUrl, fetchFn);
    await finished;

    expect(getSignedUrl).toHaveBeenCalledWith("inbox/2/imagem.png");
    expect(response.set).toHaveBeenCalledWith("Content-Type", "image/png");
    expect(Buffer.concat(response.chunks).toString()).toBe("imagem");
  });

  it("bloqueia chaves fora do diretório de anexos do Inbox", async () => {
    const response = new FakeResponse();
    const getSignedUrl = vi.fn();

    await pipeInboxMedia("outro/arquivo.png", response as any, getSignedUrl);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});
