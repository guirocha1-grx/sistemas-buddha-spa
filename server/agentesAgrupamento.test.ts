import { beforeEach, describe, expect, it, vi } from "vitest";

const agentesDb = vi.hoisted(() => ({
  recuperarAgrupamentosTravados: vi.fn(),
  listarAgrupamentosProntos: vi.fn(),
  assumirAgrupamentoMensagem: vi.fn(),
  concluirAgrupamentoMensagem: vi.fn(),
}));
const processarMensagemRecebida = vi.hoisted(() => vi.fn());

vi.mock("./agentesDb", () => agentesDb);
vi.mock("./agentesService", () => ({ processarMensagemRecebida }));

import { processarAgrupamentosProntos } from "./agentesAgrupamento";

describe("agrupamento de mensagens dos agentes", () => {
  const agora = new Date("2026-08-28T14:00:10.000Z");

  beforeEach(() => {
    vi.resetAllMocks();
    agentesDb.recuperarAgrupamentosTravados.mockResolvedValue(undefined);
    agentesDb.listarAgrupamentosProntos.mockResolvedValue([]);
    agentesDb.assumirAgrupamentoMensagem.mockResolvedValue(true);
    agentesDb.concluirAgrupamentoMensagem.mockResolvedValue("concluido");
  });

  it("usa apenas a última mensagem do bloco como marco e deixa a Áurea ler o histórico consolidado", async () => {
    agentesDb.listarAgrupamentosProntos.mockResolvedValue([{
      id: 9, conversaId: 81, unidadeId: 2, primeiraMensagemId: 500, ultimaMensagemId: 504, versao: 3,
    }]);
    processarMensagemRecebida.mockResolvedValue({ status: "concluida", sugestaoId: 20 });

    await processarAgrupamentosProntos(agora);

    expect(agentesDb.assumirAgrupamentoMensagem).toHaveBeenCalledWith(9, 3, agora);
    expect(processarMensagemRecebida).toHaveBeenCalledWith({ conversaId: 81, mensagemEntradaId: 504 });
    expect(agentesDb.concluirAgrupamentoMensagem).toHaveBeenCalledWith({ id: 9, versao: 3, agora, erro: null });
  });

  it("não executa um bloco que outra instância já assumiu", async () => {
    agentesDb.listarAgrupamentosProntos.mockResolvedValue([{ id: 9, conversaId: 81, ultimaMensagemId: 504, versao: 3 }]);
    agentesDb.assumirAgrupamentoMensagem.mockResolvedValue(false);

    await processarAgrupamentosProntos(agora);

    expect(processarMensagemRecebida).not.toHaveBeenCalled();
    expect(agentesDb.concluirAgrupamentoMensagem).not.toHaveBeenCalled();
  });
});
