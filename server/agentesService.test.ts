import { beforeEach, describe, expect, it, vi } from "vitest";

const agentesDb = vi.hoisted(() => ({
  buscarExecucaoPorMensagem: vi.fn(),
  listarAgentesAtivosComPrompt: vi.fn(),
  criarExecucao: vi.fn(),
  obterContextoConversa: vi.fn(),
  obterEstadoConversa: vi.fn(),
  salvarEstadoConversa: vi.fn(),
  listarRecursosAtivos: vi.fn(),
  listarTabelaPrecosParaAgente: vi.fn(),
  criarSugestao: vi.fn(),
  concluirExecucao: vi.fn(),
  buscarSugestao: vi.fn(),
  avaliarSugestao: vi.fn(),
  marcarSugestaoEnviada: vi.fn(),
  registrarErroEnvioSugestao: vi.fn(),
  registrarAcaoConversa: vi.fn(),
  obterNomeAtendente: vi.fn(),
}));
const db = vi.hoisted(() => ({
  mensageriaEstaAtiva: vi.fn(),
  getInboxConversaById: vi.fn(),
  getUnidadeById: vi.fn(),
  insertInboxMensagem: vi.fn(),
  upsertInboxConversa: vi.fn(),
}));
const invokeLLM = vi.hoisted(() => vi.fn());
const sendText = vi.hoisted(() => vi.fn());

vi.mock("./agentesDb", () => agentesDb);
vi.mock("./db", () => db);
vi.mock("./_core/llm", () => ({ invokeLLM }));
vi.mock("./zapiApi", () => ({ zapiApi: { sendText } }));
vi.mock("./buddhaMktApi", () => ({ buddhaMktApi: { sendText: vi.fn() } }));

import { aprovarEEnviarSugestao, processarMensagemRecebida, reprovarSugestao } from "./agentesService";

const respostaJson = (message: string, status = "in_process", action: string | null = null) => JSON.stringify({
  message,
  status,
  summary: "Resumo atualizado para a recepção.",
  variables: { servico_interesse: "Shiatsu 60min" },
  action,
});

const contexto = (texto: string) => ({
  conversa: { id: 10, unidadeId: 1, canal: "zapi", nomeContato: "Carla", telefone: "5516999999999" },
  unidadeNome: "Ribeirão Shopping",
  clienteNome: "Carla",
  mensagens: [{ direcao: "recebida", conteudo: texto, transcricao: null, createdAt: new Date() }],
});

const receptor = { agente: { id: 1, chave: "aurea", nome: "Aurea", modelo: "gpt-5-mini", modoOperacao: "assistido" }, prompt: { id: 11, conteudo: "Classifique." } };
const biancaAssistida = { agente: { id: 2, chave: "bianca", nome: "Bianca", descricao: "Terapias", modelo: "gpt-5-mini", modoOperacao: "assistido" }, prompt: { id: 12, conteudo: "Sugira." } };
const biancaAutomatica = { ...biancaAssistida, agente: { ...biancaAssistida.agente, modoOperacao: "automatico" as const } };

describe("orquestrador de agentes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentesDb.buscarExecucaoPorMensagem.mockResolvedValue(undefined);
    agentesDb.criarExecucao.mockResolvedValue(90);
    agentesDb.obterEstadoConversa.mockResolvedValue(undefined);
    agentesDb.salvarEstadoConversa.mockResolvedValue(1);
    agentesDb.listarRecursosAtivos.mockResolvedValue([]);
    agentesDb.listarTabelaPrecosParaAgente.mockResolvedValue([]);
    agentesDb.criarSugestao.mockResolvedValue(91);
    db.mensageriaEstaAtiva.mockResolvedValue(true);
  });

  it("usa Aurea para intenção ambígua, encaminha para Bianca e cria uma sugestão assistida", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Preciso de ajuda para escolher uma experiência"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [biancaAssistida]);
    invokeLLM
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"destino":"bianca","confianca":92}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: respostaJson("Posso explicar as terapias que melhor combinam com o que você procura.") } }] });

    const resultado = await processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 44 });

    expect(resultado).toEqual({ status: "concluida", sugestaoId: 91 });
    expect(agentesDb.criarSugestao).toHaveBeenCalledWith(expect.objectContaining({
      agenteId: 2,
      conversaId: 10,
      statusAgente: "in_process",
      variaveis: expect.objectContaining({ servico_interesse: "Shiatsu 60min" }),
    }));
    expect(agentesDb.concluirExecucao).toHaveBeenCalledWith(90, expect.objectContaining({ status: "concluida", classificacao: "bianca" }));
    expect(sendText).not.toHaveBeenCalled();
  });

  it("envia imediatamente apenas quando uma resposta de baixo risco da Bianca está no modo automático", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Como funciona uma massagem relaxante?"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [biancaAutomatica]);
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: respostaJson("A massagem relaxante utiliza manobras suaves para proporcionar relaxamento.") } }] });
    db.getInboxConversaById.mockResolvedValue({ id: 10, unidadeId: 1, canal: "zapi", telefone: "5516999999999", nomeContato: "Carla" });
    db.getUnidadeById.mockResolvedValue({ zapiInstanceId: "instancia", zapiToken: "token", zapiClientToken: "client" });
    sendText.mockResolvedValue({ messageId: "zapi-auto-1" });

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 45 })).resolves.toEqual({ status: "concluida", sugestaoId: 91 });

    expect(sendText).toHaveBeenCalled();
    expect(db.insertInboxMensagem).toHaveBeenCalledWith(expect.objectContaining({ enviadaPorIa: true }));
    expect(agentesDb.marcarSugestaoEnviada).toHaveBeenCalledWith(91, true);
  });

  it("registra uma reprovação com motivo operacional", async () => {
    await reprovarSugestao({ sugestaoId: 91, comentario: "Não pode confirmar disponibilidade", motivo: "operacional", userId: 7, atendenteId: 3 });
    expect(agentesDb.avaliarSugestao).toHaveBeenCalledWith(expect.objectContaining({ sugestaoId: 91, avaliacao: "reprovada", motivo: "operacional" }));
  });

  it("aprova, envia e registra uma ação pendente da conversa", async () => {
    agentesDb.buscarSugestao.mockResolvedValue({ sugestao: { id: 91, conversaId: 10, sugestao: "Posso enviar o quadro comparativo.", acaoPendente: "enviar_resumo_dayspa" } });
    agentesDb.obterNomeAtendente.mockResolvedValue("Ana");
    db.getInboxConversaById.mockResolvedValue({ id: 10, unidadeId: 1, canal: "zapi", telefone: "5516999999999", nomeContato: "Carla" });
    db.getUnidadeById.mockResolvedValue({ zapiInstanceId: "instancia", zapiToken: "token", zapiClientToken: "client" });
    sendText.mockResolvedValue({ messageId: "zapi-1" });

    await expect(aprovarEEnviarSugestao({ sugestaoId: 91, comentario: "Ajustado", motivo: "tom", userId: 7, atendenteId: 3 })).resolves.toEqual({ success: true });

    expect(agentesDb.avaliarSugestao).toHaveBeenCalledWith(expect.objectContaining({ avaliacao: "aprovada", motivo: "tom" }));
    expect(db.insertInboxMensagem).toHaveBeenCalledWith(expect.objectContaining({ conteudo: "*Ana:*\nPosso enviar o quadro comparativo." }));
    expect(agentesDb.registrarAcaoConversa).toHaveBeenCalledWith(10, "enviar_resumo_dayspa", 91);
  });
});
