import { afterEach, describe, expect, it, vi } from "vitest";
import { zapiApi } from "./zapiApi";

const instanceId = "instance";
const token = "token";
const clientToken = "client-token";
const phone = "5516999999999";

function mockZapiSuccess() {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ messageId: "ABC123", zaapId: "ZAAP123" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("zapiApi — anexos enviados pelo Inbox", () => {
  it("envia uma imagem local como Data URL em Base64", async () => {
    const fetchMock = mockZapiSuccess();
    vi.stubGlobal("fetch", fetchMock);

    await zapiApi.sendImageBase64(instanceId, token, clientToken, phone, "aW1hZ2Vt", "image/png", "Legenda");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.z-api.io/instances/instance/token/token/send-image",
      expect.objectContaining({ method: "POST" }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      phone,
      image: "data:image/png;base64,aW1hZ2Vt",
      caption: "Legenda",
    });
  });

  it("envia documento com extensão dinâmica, Base64 e legenda", async () => {
    const fetchMock = mockZapiSuccess();
    vi.stubGlobal("fetch", fetchMock);

    await zapiApi.sendDocumentBase64(instanceId, token, clientToken, phone, "cGRm", "application/pdf", "Contrato.PDF", "Assine, por favor");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.z-api.io/instances/instance/token/token/send-document/pdf",
      expect.objectContaining({ method: "POST" }),
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      phone,
      document: "data:application/pdf;base64,cGRm",
      fileName: "Contrato.PDF",
      caption: "Assine, por favor",
    });
  });

  it("não confirma o Inbox quando a Z-API responde 2xx sem identificador de entrega", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "queued failed" }), { status: 200 })));

    await expect(
      zapiApi.sendImageBase64(instanceId, token, clientToken, phone, "aW1hZ2Vt", "image/png"),
    ).rejects.toThrow("sem confirmação de envio");
  });
});
