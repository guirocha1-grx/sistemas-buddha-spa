import { describe, expect, it, vi } from "vitest";

const sendText = vi.hoisted(() => vi.fn());
const sendBuddhaMktText = vi.hoisted(() => vi.fn());

vi.mock("./db", () => ({
  createFluxoExecucao: vi.fn(),
  getFluxoById: vi.fn(),
  getFluxoExecucaoById: vi.fn(),
  getFluxoNoByOrdem: vi.fn(),
  getInboxConversaById: vi.fn(),
  getUnidadeById: vi.fn(),
  insertInboxMensagem: vi.fn(),
  listFluxoExecucoesPausadasVencidas: vi.fn(),
  listFluxoNos: vi.fn(),
  updateFluxoExecucao: vi.fn(),
}));
vi.mock("./zapiApi", () => ({ zapiApi: { sendText } }));
vi.mock("./buddhaMktApi", () => ({ buddhaMktApi: { sendText: sendBuddhaMktText } }));
vi.mock("./storage", () => ({ storageGetBase64: vi.fn(), storageGetSignedUrl: vi.fn() }));
vi.mock("./agentesDb", () => ({ obterCampanhaMensal: vi.fn() }));

import { enviarPelaUnidade } from "./fluxos";

describe("espelho de envios de fluxo", () => {
  it("devolve o identificador Z-API para o espelho local não duplicar o eco do webhook", async () => {
    sendText.mockResolvedValue({ messageId: "zapi-flux-123" });

    await expect(enviarPelaUnidade({ canal: "zapi", zapiInstanceId: "inst", zapiToken: "token", zapiClientToken: "client" } as any, "5516999999999", "Mensagem do fluxo"))
      .resolves.toEqual({ zapiMessageId: "zapi-flux-123" });
  });
});
