import { describe, expect, it } from "vitest";
import { getFileExtension } from "./_core/voiceTranscription";

describe("getFileExtension", () => {
  it("reconhece o MIME OGG/Opus retornado pela Z-API", () => {
    expect(getFileExtension("audio/ogg; codecs=opus")).toBe("ogg");
  });

  it("mantém o mapeamento para formatos de áudio aceitos", () => {
    expect(getFileExtension("audio/webm")).toBe("webm");
    expect(getFileExtension("audio/mpeg")).toBe("mp3");
  });
});
