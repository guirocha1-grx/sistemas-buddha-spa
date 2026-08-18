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
  acaoJaRegistrada: vi.fn(),
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
const sendDocument = vi.hoisted(() => vi.fn());
const sendImage = vi.hoisted(() => vi.fn());

vi.mock("./agentesDb", () => agentesDb);
vi.mock("./db", () => db);
vi.mock("./_core/llm", () => ({ invokeLLM }));
vi.mock("./zapiApi", () => ({ zapiApi: { sendText, sendDocument, sendImage } }));
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
const dianaAssistida = { agente: { id: 6, chave: "diana", nome: "Diana", descricao: "Vouchers", modelo: "gpt-5-mini", modoOperacao: "assistido" }, prompt: { id: 16, conteudo: "Prepare o voucher." } };

describe("orquestrador de agentes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentesDb.buscarExecucaoPorMensagem.mockResolvedValue(undefined);
    agentesDb.criarExecucao.mockResolvedValue(90);
    agentesDb.obterEstadoConversa.mockResolvedValue(undefined);
    agentesDb.salvarEstadoConversa.mockResolvedValue(1);
    agentesDb.listarRecursosAtivos.mockResolvedValue([]);
    agentesDb.listarTabelaPrecosParaAgente.mockResolvedValue([]);
    agentesDb.acaoJaRegistrada.mockResolvedValue(false);
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

  it("cria uma sugestão com ação pendente quando o menu é solicitado", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Pode me enviar o menu de serviços?"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [biancaAutomatica]);
    invokeLLM
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"destino":"bianca","confianca":98}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: respostaJson("Claro, vou encaminhar o menu completo para você.", "in_process", "enviar_menu_servicos") } }] });

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 46 })).resolves.toEqual({ status: "concluida", sugestaoId: 91 });

    expect(agentesDb.criarSugestao).toHaveBeenCalledWith(expect.objectContaining({ acaoPendente: "enviar_menu_servicos" }));
    expect(sendText).not.toHaveBeenCalled();
  });

  it("disponibiliza as regras oficiais de voucher para a especialista Diana", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Quero presentear alguém com um voucher"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [dianaAssistida]);
    agentesDb.listarRecursosAtivos.mockResolvedValue([{ chave: "voucher_regras_ribeirao", tipo: "conteudo", titulo: "Vale Bem-Estar", conteudo: "Validade de 6 meses e emissão sob confirmação humana.", url: null }]);
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: respostaJson("Posso explicar as opções de Vale Bem-Estar e preparar sua solicitação.") } }] });

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 47 })).resolves.toEqual({ status: "concluida", sugestaoId: 91 });

    const chamadaDiana = invokeLLM.mock.calls[0]?.[0];
    expect(chamadaDiana.messages[1].content).toContain("voucher_regras_ribeirao");
    expect(chamadaDiana.messages[1].content).toContain("Validade de 6 meses");
  });

  it("disponibiliza todas as categorias de fontes oficiais ao especialista", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Quero presentear alguém com um voucher"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [dianaAssistida]);
    agentesDb.listarRecursosAtivos.mockResolvedValue([
      { chave: "preco_exemplo", tipo: "preco", titulo: "Preço", conteudo: "R$ 100", url: null },
      { chave: "promocao_exemplo", tipo: "promocao", titulo: "Promoção", conteudo: "Condição vigente", url: null },
      { chave: "conteudo_exemplo", tipo: "conteudo", titulo: "Regra", conteudo: "Confirmação humana", url: null },
      { chave: "midia_exemplo", tipo: "midia", titulo: "Menu", conteudo: null, url: "/manus-storage/menu.pdf" },
      { chave: "modelo_exemplo", tipo: "modelo_voucher", titulo: "Voucher", conteudo: null, url: "/manus-storage/voucher.jpg" },
    ]);
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: respostaJson("Vou orientar as opções de presente.") } }] });

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 48 })).resolves.toEqual({ status: "concluida", sugestaoId: 91 });

    const contextoEspecialista = invokeLLM.mock.calls[0]?.[0].messages[1].content as string;
    expect(contextoEspecialista).toContain("preco_exemplo");
    expect(contextoEspecialista).toContain("promocao_exemplo");
    expect(contextoEspecialista).toContain("conteudo_exemplo");
    expect(contextoEspecialista).toContain("midia_exemplo");
    expect(contextoEspecialista).toContain("modelo_exemplo");
  });

  it("registra uma reprovação com motivo operacional", async () => {
    await reprovarSugestao({ sugestaoId: 91, comentario: "Não pode confirmar disponibilidade", motivo: "operacional", userId: 7, atendenteId: 3 });
    expect(agentesDb.avaliarSugestao).toHaveBeenCalledWith(expect.objectContaining({ sugestaoId: 91, avaliacao: "reprovada", motivo: "operacional" }));
  });

  it("aprova, envia e registra uma ação pendente da conversa", async () => {
    agentesDb.buscarSugestao.mockResolvedValue({ sugestao: { id: 91, conversaId: 10, sugestao: "Posso enviar a tabela de valores.", acaoPendente: "enviar_tabela" } });
    agentesDb.obterNomeAtendente.mockResolvedValue("Ana");
    db.getInboxConversaById.mockResolvedValue({ id: 10, unidadeId: 1, canal: "zapi", telefone: "5516999999999", nomeContato: "Carla" });
    db.getUnidadeById.mockResolvedValue({ zapiInstanceId: "instancia", zapiToken: "token", zapiClientToken: "client" });
    sendText.mockResolvedValue({ messageId: "zapi-1" });

    await expect(aprovarEEnviarSugestao({ sugestaoId: 91, comentario: "Ajustado", motivo: "tom", userId: 7, atendenteId: 3 })).resolves.toEqual({ success: true });

    expect(agentesDb.avaliarSugestao).toHaveBeenCalledWith(expect.objectContaining({ avaliacao: "aprovada", motivo: "tom" }));
    expect(db.insertInboxMensagem).toHaveBeenCalledWith(expect.objectContaining({ conteudo: "*Ana:*\nPosso enviar a tabela de valores." }));
    expect(agentesDb.registrarAcaoConversa).toHaveBeenCalledWith(10, "enviar_tabela", 91);
  });

  it("envia o menu em PDF somente após a aprovação humana", async () => {
    agentesDb.buscarSugestao.mockResolvedValue({ sugestao: { id: 92, conversaId: 10, sugestao: "Vou enviar o menu completo para você.", acaoPendente: "enviar_menu_servicos" } });
    agentesDb.obterNomeAtendente.mockResolvedValue("Ana");
    agentesDb.listarRecursosAtivos.mockResolvedValue([{ chave: "menu_servicos_ribeirao", ativo: true, url: "/manus-storage/menu.pdf" }]);
    db.getInboxConversaById.mockResolvedValue({ id: 10, unidadeId: 1, canal: "zapi", telefone: "5516999999999", nomeContato: "Carla" });
    db.getUnidadeById.mockResolvedValue({ zapiInstanceId: "instancia", zapiToken: "token", zapiClientToken: "client" });
    sendText.mockResolvedValue({ messageId: "zapi-texto-1" });
    sendDocument.mockResolvedValue({ messageId: "zapi-documento-1" });

    await expect(aprovarEEnviarSugestao({ sugestaoId: 92, userId: 7, atendenteId: 3, origemPublica: "https://spa.exemplo.com" })).resolves.toEqual({ success: true });

    expect(sendDocument).toHaveBeenCalledWith("instancia", "token", "client", "5516999999999", "https://spa.exemplo.com/manus-storage/menu.pdf", "Menu-Experiencias-Ribeirao-Shopping-2026.pdf");
    expect(db.insertInboxMensagem).toHaveBeenCalledWith(expect.objectContaining({ tipo: "documento", conteudo: "Menu de Experiências e Rituais — Ribeirão Shopping" }));
    expect(agentesDb.registrarAcaoConversa).toHaveBeenCalledWith(10, "enviar_menu_servicos", 92);
  });

  it("envia o modelo visual de voucher somente após a aprovação humana", async () => {
    agentesDb.buscarSugestao.mockResolvedValue({ sugestao: { id: 93, conversaId: 10, sugestao: "Vou enviar um exemplo do voucher virtual.", acaoPendente: "enviar_modelo_voucher_virtual" } });
    agentesDb.obterNomeAtendente.mockResolvedValue("Ana");
    agentesDb.listarRecursosAtivos.mockResolvedValue([{ chave: "modelo_voucher_virtual_ribeirao", ativo: true, url: "/manus-storage/voucher-virtual.jpg" }]);
    db.getInboxConversaById.mockResolvedValue({ id: 10, unidadeId: 1, canal: "zapi", telefone: "5516999999999", nomeContato: "Carla" });
    db.getUnidadeById.mockResolvedValue({ zapiInstanceId: "instancia", zapiToken: "token", zapiClientToken: "client" });
    sendText.mockResolvedValue({ messageId: "zapi-texto-voucher" });
    sendImage.mockResolvedValue({ messageId: "zapi-imagem-voucher" });

    await expect(aprovarEEnviarSugestao({ sugestaoId: 93, userId: 7, atendenteId: 3, origemPublica: "https://spa.exemplo.com" })).resolves.toEqual({ success: true });

    expect(sendImage).toHaveBeenCalledWith("instancia", "token", "client", "5516999999999", "https://spa.exemplo.com/manus-storage/voucher-virtual.jpg", "Exemplo de voucher virtual personalizado — sujeito à confirmação da equipe.");
    expect(db.insertInboxMensagem).toHaveBeenCalledWith(expect.objectContaining({ tipo: "imagem", metadados: expect.stringContaining("modelo_voucher_virtual_ribeirao") }));
    expect(agentesDb.registrarAcaoConversa).toHaveBeenCalledWith(10, "enviar_modelo_voucher_virtual", 93);
  });

  it("envia o quadro de Day Spa somente após a aprovação humana", async () => {
    agentesDb.buscarSugestao.mockResolvedValue({ sugestao: { id: 94, conversaId: 10, sugestao: "Vou enviar a composição dos Day Spas.", acaoPendente: "enviar_resumo_dayspa" } });
    agentesDb.obterNomeAtendente.mockResolvedValue("Ana");
    agentesDb.listarRecursosAtivos.mockResolvedValue([{ chave: "quadro_dayspas_ribeirao", ativo: true, url: "/manus-storage/quadro-dayspa.jpg" }]);
    db.getInboxConversaById.mockResolvedValue({ id: 10, unidadeId: 1, canal: "zapi", telefone: "5516999999999", nomeContato: "Carla" });
    db.getUnidadeById.mockResolvedValue({ zapiInstanceId: "instancia", zapiToken: "token", zapiClientToken: "client" });
    sendText.mockResolvedValue({ messageId: "zapi-texto-dayspa" });
    sendImage.mockResolvedValue({ messageId: "zapi-imagem-dayspa" });

    await expect(aprovarEEnviarSugestao({ sugestaoId: 94, userId: 7, atendenteId: 3, origemPublica: "https://spa.exemplo.com" })).resolves.toEqual({ success: true });

    expect(sendImage).toHaveBeenCalledWith("instancia", "token", "client", "5516999999999", "https://spa.exemplo.com/manus-storage/quadro-dayspa.jpg", "Composição dos Day Spas — qualquer ajuste depende de confirmação da equipe.");
    expect(db.insertInboxMensagem).toHaveBeenCalledWith(expect.objectContaining({ tipo: "imagem", metadados: expect.stringContaining("quadro_dayspas_ribeirao") }));
    expect(agentesDb.registrarAcaoConversa).toHaveBeenCalledWith(10, "enviar_resumo_dayspa", 94);
  });
});
