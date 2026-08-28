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
  listarScriptsParaAgentes: vi.fn(),
  criarSugestao: vi.fn(),
  descartarSugestoesPendentesDaConversa: vi.fn(),
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
  getScriptById: vi.fn(),
  insertInboxMensagem: vi.fn(),
  upsertInboxConversa: vi.fn(),
}));
const invokeLLM = vi.hoisted(() => vi.fn());
const sendText = vi.hoisted(() => vi.fn());
const sendDocument = vi.hoisted(() => vi.fn());
const sendImage = vi.hoisted(() => vi.fn());
const iniciarExecucaoFluxo = vi.hoisted(() => vi.fn());

vi.mock("./agentesDb", () => agentesDb);
vi.mock("./db", () => db);
vi.mock("./_core/llm", () => ({ invokeLLM }));
vi.mock("./zapiApi", () => ({ zapiApi: { sendText, sendDocument, sendImage } }));
vi.mock("./buddhaMktApi", () => ({ buddhaMktApi: { sendText: vi.fn() } }));
vi.mock("./fluxos", () => ({ iniciarExecucaoFluxo }));

import { aprovarEEnviarSugestao, extrairConteudoRespostaLLM, instrucaoContextoRelacionamento, liberarSugestaoParaEdicao, limitarMensagemCliente, processarMensagemRecebida, removerIdentificacaoAgente, reprovarSugestao } from "./agentesService";

const respostaJson = (message: string, status = "in_process", action: string | null = null, excecaoOperacional: boolean = false) => JSON.stringify({
  message,
  status,
  summary: "Resumo atualizado para a recepção.",
  variables: { servico_interesse: "Shiatsu 60min" },
  action,
  excecaoOperacional,
});

const respostaSemIntervencao = (summary: string, variables: Record<string, string | boolean> = {}) => JSON.stringify({
  message: "",
  status: "failure",
  summary,
  variables,
  action: null,
  scriptId: null,
  excecaoOperacional: false,
});

const contexto = (texto: string, automacaoAgentesEfetiva?: "bloqueada_temporariamente" | "bloqueada_permanentemente") => ({
  conversa: { id: 10, unidadeId: 1, canal: "zapi", nomeContato: "Carla", telefone: "5516999999999", automacaoAgentesEfetiva },
  unidadeNome: "Ribeirão Shopping",
  clienteNome: "Carla",
  mensagens: [{ direcao: "recebida", conteudo: texto, transcricao: null, createdAt: new Date() }],
});

const receptor = { agente: { id: 1, chave: "aurea", nome: "Aurea", modelo: "gpt-5-mini", modoOperacao: "assistido" }, prompt: { id: 11, conteudo: "Classifique." } };
const biancaAssistida = { agente: { id: 2, chave: "bianca", nome: "Bianca", descricao: "Terapias", modelo: "gpt-5-mini", modoOperacao: "assistido" }, prompt: { id: 12, conteudo: "Sugira." } };
const biancaAutomatica = { ...biancaAssistida, agente: { ...biancaAssistida.agente, modoOperacao: "automatico" as const } };
const fabriciaAssistida = { agente: { id: 3, chave: "fabricia", nome: "Fabricia", descricao: "Day Spa", modelo: "gpt-5-mini", modoOperacao: "assistido" }, prompt: { id: 13, conteudo: "Explique Day Spa." } };
const carolAssistida = { agente: { id: 5, chave: "carol", nome: "Carol", descricao: "Agendamento", modelo: "gpt-5-mini", modoOperacao: "assistido" }, prompt: { id: 15, conteudo: "Organize agendamentos." } };
const dianaAssistida = { agente: { id: 6, chave: "diana", nome: "Diana", descricao: "Vouchers", modelo: "gpt-5-mini", modoOperacao: "assistido" }, prompt: { id: 16, conteudo: "Prepare o voucher." } };

describe("orquestrador de agentes", () => {
  it("extrai conteúdo de uma escolha válida sem depender de acesso inseguro", () => {
    expect(extrairConteudoRespostaLLM({ choices: [{ message: { content: '{"destino":"estela"}' } }] })).toBe('{"destino":"estela"}');
  });

  it("mantém a causa do provedor quando a resposta não traz escolhas", () => {
    expect(() => extrairConteudoRespostaLLM({ error: { message: "modelo indisponível" } })).toThrow("modelo indisponível");
  });

  it("limita uma sugestão extensa preservando um encerramento legível", () => {
    const longa = "Informação importante. ".repeat(60);
    const limitada = limitarMensagemCliente(longa, 120);
    expect(limitada.length).toBeLessThanOrEqual(121);
    expect(limitada).toMatch(/…$/);
  });

  it("conta espaços no limite padrão de 350 caracteres", () => {
    const limitada = limitarMensagemCliente("palavra ".repeat(60));
    expect(limitada.length).toBeLessThanOrEqual(351);
    expect(limitada).toMatch(/…$/);
  });

  it("remove a identificação nominal do especialista antes de sugerir o texto", () => {
    expect(removerIdentificacaoAgente("Olá! Eu sou a Bianca, especialista em terapias. Posso ajudar você.", "Bianca")).toBe("Posso ajudar você.");
    expect(removerIdentificacaoAgente("Boa tarde! Sou a Estela. Vou verificar os valores.", "Estela")).toBe("Vou verificar os valores.");
  });

  beforeEach(() => {
    vi.resetAllMocks();
    agentesDb.buscarExecucaoPorMensagem.mockResolvedValue(undefined);
    agentesDb.criarExecucao.mockResolvedValue(90);
    agentesDb.obterEstadoConversa.mockResolvedValue(undefined);
    agentesDb.salvarEstadoConversa.mockResolvedValue(1);
    agentesDb.listarRecursosAtivos.mockResolvedValue([]);
    agentesDb.listarTabelaPrecosParaAgente.mockResolvedValue([]);
    agentesDb.listarScriptsParaAgentes.mockResolvedValue([]);
    agentesDb.acaoJaRegistrada.mockResolvedValue(false);
    agentesDb.criarSugestao.mockResolvedValue(91);
    agentesDb.descartarSugestoesPendentesDaConversa.mockResolvedValue(undefined);
    db.mensageriaEstaAtiva.mockResolvedValue(true);
    db.getScriptById.mockResolvedValue(undefined);
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
    expect(agentesDb.descartarSugestoesPendentesDaConversa).toHaveBeenCalledWith(10);
    expect(agentesDb.concluirExecucao).toHaveBeenCalledWith(90, expect.objectContaining({ status: "concluida", classificacao: "bianca" }));
    expect(sendText).not.toHaveBeenCalled();
    expect(invokeLLM.mock.calls[0]?.[0]).toMatchObject({ tool_choice: "none", tools: [], reasoningEffort: "minimal" });
    expect(invokeLLM.mock.calls[0]?.[0]).not.toHaveProperty("response_format");
  });

  // Regressão do P0 do relatório 2026-08-28 (analise_evolucao_agentes_2026-08-28.md):
  // 58 de 59 falhas recentes da Aurea foram resposta vazia depois de
  // esgotar o orçamento de tokens só em raciocínio interno
  // (finish_reason "length"). invokeLLM real lança nesse caso
  // (normalizarRespostaLLM, ver server/_core/llm.ts) — o teste simula
  // exatamente essa falha e confirma que o sistema falha de forma
  // recuperável (execução marcada como erro, sem sugestão enganosa),
  // não trava nem quebra o fluxo pro cliente.
  it("marca a execução como erro (sem criar sugestão) quando a Aurea esgota o orçamento em raciocínio", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Preciso de ajuda para escolher uma experiência"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [biancaAssistida]);
    invokeLLM.mockRejectedValueOnce(new Error(
      'LLM response did not contain output text; finish_reason: length; usage: {"completion_tokens":600,"reasoning_tokens":600}',
    ));

    const resultado = await processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 45 });

    expect(resultado).toEqual({ status: "erro" });
    expect(agentesDb.criarSugestao).not.toHaveBeenCalled();
    expect(agentesDb.concluirExecucao).toHaveBeenCalledWith(90, expect.objectContaining({ status: "erro" }));
  });

  it("acolhe uma abertura sem intenção e aguarda o cliente explicar a necessidade", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Bom dia, tudo bem?"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [biancaAssistida]);

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 440 })).resolves.toEqual({ status: "concluida", sugestaoId: 91 });

    expect(invokeLLM).not.toHaveBeenCalled();
    expect(agentesDb.criarSugestao).toHaveBeenCalledWith(expect.objectContaining({
      agenteId: 1,
      sugestao: "Olá, seja bem-vindo(a) ao Buddha Spa. Como posso ajudar você hoje?",
      statusAgente: "in_process",
    }));
    expect(agentesDb.salvarEstadoConversa).toHaveBeenCalledWith(expect.objectContaining({
      agenteAtualId: 1,
      etapa: "aguardando_intencao",
    }));
  });

  it("escalona caso sensível sem chamar a Áurea e registra o motivo de forma auditável", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Estou sofrendo assédio e preciso falar com uma pessoa"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [biancaAssistida]);

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 441 })).resolves.toEqual({ status: "concluida", sugestaoId: 91 });

    expect(invokeLLM).not.toHaveBeenCalled();
    expect(agentesDb.criarSugestao).toHaveBeenCalledWith(expect.objectContaining({
      agenteId: 1,
      statusAgente: "failure",
      variaveis: { motivo_escalonamento: "situação sensível ou potencialmente insegura" },
    }));
    expect(agentesDb.concluirExecucao).toHaveBeenCalledWith(90, expect.objectContaining({
      classificacao: "humano",
      rastro: { origem: "regra_deterministica", motivoEscalonamento: "situação sensível ou potencialmente insegura" },
    }));
  });

  it.each(["bloqueada_temporariamente", "bloqueada_permanentemente"] as const)("não executa os agentes quando a automação está %s", async (modo) => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Quero saber sobre massagens", modo));

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: modo === "bloqueada_temporariamente" ? 474 : 475 })).resolves.toEqual({ status: "automacao_bloqueada" });

    expect(agentesDb.criarExecucao).not.toHaveBeenCalled();
    expect(invokeLLM).not.toHaveBeenCalled();
    expect(agentesDb.criarSugestao).not.toHaveBeenCalled();
  });

  it.each([
    ["Carol", carolAssistida, "Quero agendar para sexta à tarde", "Recepção deve consultar a agenda e confirmar a disponibilidade.", { agendamento_pronto: true }],
    ["Diana", dianaAssistida, "Quero emitir o voucher virtual para a Ana", "Recepção deve emitir o voucher e orientar o pagamento.", { voucher_pronto_para_emissao: true }],
  ])("encerra sem sugestão quando %s já depende da recepção", async (_nome, especialista, texto, summary, variables) => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto(texto));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [especialista]);
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: respostaSemIntervencao(summary, variables) } }] });

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: especialista.agente.id === 5 ? 471 : 472 })).resolves.toEqual({ status: "ignorada" });

    expect(agentesDb.criarSugestao).not.toHaveBeenCalled();
    expect(agentesDb.salvarEstadoConversa).toHaveBeenCalledWith(expect.objectContaining({
      agenteAtualId: especialista.agente.id,
      etapa: "aguardando_recepcao",
      resumo: summary,
      variaveis: expect.objectContaining(variables),
    }));
    expect(agentesDb.concluirExecucao).toHaveBeenCalledWith(90, expect.objectContaining({
      classificacao: especialista.agente.chave,
      status: "ignorada",
      erroMsg: null,
    }));
    expect(invokeLLM.mock.calls[0]?.[0].messages[0].content).toContain("REGRA DE NÃO INTERVENÇÃO");
  });

  it("não cria sugestão quando o especialista devolve mensagem vazia", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Quais terapias vocês oferecem?"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [biancaAssistida]);
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: respostaJson("", "failure") } }] });

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 439 })).resolves.toEqual({ status: "erro" });

    expect(agentesDb.criarSugestao).not.toHaveBeenCalled();
    expect(agentesDb.concluirExecucao).toHaveBeenCalledWith(90, expect.objectContaining({ status: "erro" }));
  });

  it("usa o fluxo geral de Day Spa para pergunta de catálogo, sem voucher ou agendamento", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Boa tarde! Quais Day Spa vocês têm?"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [fabriciaAssistida]);
    agentesDb.listarScriptsParaAgentes.mockResolvedValue([{
      id: 210002,
      categoriaScript: "Day Spa",
      titulo: "Enviar e solicitar informações sobre Day Spa",
      descricao: "Para fornecer informações gerais do Day Spa.",
      tipo: "fluxo",
      script: null,
      fluxoId: 30002,
      fluxoNome: "Enviar informações sobre dayspa",
    }]);

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 438 })).resolves.toEqual({ status: "concluida", sugestaoId: 91 });

    expect(invokeLLM).not.toHaveBeenCalled();
    expect(agentesDb.criarSugestao).toHaveBeenCalledWith(expect.objectContaining({
      agenteId: 3,
      sugestao: "Claro. Vou enviar as opções gerais de Day Spa para você conhecer.",
      acaoPendente: "script_fluxo:210002",
    }));
  });

  it("encaminha o pedido inicial de voucher ao fluxo oficial antes de gerar texto livre", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Quero entender como funciona o voucher para presentear."));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [dianaAssistida]);
    agentesDb.listarScriptsParaAgentes.mockResolvedValue([{
      id: 210001,
      categoriaScript: "Solicitação de informações",
      titulo: "Informações e envio de vouchers",
      descricao: "Fluxo para orientar clientes sobre uso e solicitação de vouchers e para encaminhar o envio.",
      tipo: "fluxo",
      script: null,
      fluxoId: 30001,
      fluxoNome: "Enviar informações sobre vouchers",
    }]);

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 473 })).resolves.toEqual({ status: "concluida", sugestaoId: 91 });

    expect(invokeLLM).not.toHaveBeenCalled();
    expect(agentesDb.criarSugestao).toHaveBeenCalledWith(expect.objectContaining({
      agenteId: 6,
      sugestao: "Claro. Vou encaminhar as informações sobre vouchers para você.",
      acaoPendente: "script_fluxo:210001",
    }));
  });

  it("pede o período antes de a recepção verificar um horário sem preferência", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Vocês têm horário para amanhã?"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [carolAssistida]);

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 437 })).resolves.toEqual({ status: "concluida", sugestaoId: 91 });

    expect(invokeLLM).not.toHaveBeenCalled();
    expect(agentesDb.criarSugestao).toHaveBeenCalledWith(expect.objectContaining({
      agenteId: 5,
      sugestao: "Você tem algum período de preferência? Pode me informar se seria de manhã, à tarde ou à noite? ✨",
      variaveis: expect.objectContaining({ triagem_horario: "aguardando_periodo" }),
    }));
  });

  it("oferece os slots padronizados quando o cliente já informou o período", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Tem horário para hoje à tarde?"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [carolAssistida]);

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 436 })).resolves.toEqual({ status: "concluida", sugestaoId: 91 });

    expect(invokeLLM).not.toHaveBeenCalled();
    expect(agentesDb.criarSugestao).toHaveBeenCalledWith(expect.objectContaining({
      agenteId: 5,
      sugestao: "Tenho para hoje disponíveis os horários 13:00 e 14:15. Algum desses fica bom para você?",
      variaveis: expect.objectContaining({ triagem_horario: "aguardando_escolha_slot", slots_oferecidos: "13:00, 14:15" }),
    }));
  });

  it("mantém a coleta com Carol quando o cliente informa um horário específico", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Teria algum horário entre 16h15 e 16h45 no dia 28?"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [carolAssistida]);
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: respostaJson("Qual será a terapia?") } }] });

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 487 })).resolves.toEqual({ status: "concluida", sugestaoId: 91 });

    expect(invokeLLM).toHaveBeenCalledTimes(1);
    expect(agentesDb.criarSugestao).toHaveBeenCalledWith(expect.objectContaining({
      sugestao: "Qual será a terapia?",
    }));
  });

  it("oferece os slots de domingo na ordem aprovada", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Tem horário para domingo à tarde?"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [carolAssistida]);

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 492 })).resolves.toEqual({ status: "concluida", sugestaoId: 91 });

    expect(invokeLLM).not.toHaveBeenCalled();
    expect(agentesDb.criarSugestao).toHaveBeenCalledWith(expect.objectContaining({
      sugestao: "Tenho para domingo disponíveis os horários 14:00 e 15:15. Algum desses fica bom para você?",
      variaveis: expect.objectContaining({ slots_oferecidos: "14:00, 15:15" }),
    }));
  });

  it("injeta a regra de última terapia, cadastro posterior e conclusão da Carol", () => {
    const instrucao = instrucaoContextoRelacionamento("carol");
    expect(instrucao).toContain("A terapia será [última terapia]?");
    expect(instrucao).toContain("ID 30020");
    expect(instrucao).toContain("Por favor, aguarde um momento ✨");
    expect(instrucaoContextoRelacionamento("bianca")).toBe("");
  });

  it.each([
    ["Obrigado", "Cliente encerrou ou dispensou o agendamento"],
    ["Agora não, obrigada", "Cliente encerrou ou dispensou o agendamento"],
  ])("não cria nova sugestão da Carol para encerramento de conversa: %s", async (texto, resumo) => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto(texto));
    agentesDb.obterEstadoConversa.mockResolvedValue({ agenteAtualId: 5, resumo: "Agendamento em andamento", variaveis: { triagem_horario: "verificar_disponibilidade" } });
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [carolAssistida]);

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: texto === "Obrigado" ? 488 : 489 })).resolves.toEqual({ status: "ignorada" });

    expect(invokeLLM).not.toHaveBeenCalled();
    expect(agentesDb.criarSugestao).not.toHaveBeenCalled();
    expect(agentesDb.concluirExecucao).toHaveBeenCalledWith(90, expect.objectContaining({
      status: "ignorada",
      rastro: expect.objectContaining({ passos: expect.arrayContaining([expect.objectContaining({ motivo: expect.stringContaining(resumo) })]) }),
    }));
  });

  it("encerra sem nova pergunta quando o cliente confirma alternativa de agenda já verificada", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Pode ser"));
    agentesDb.obterEstadoConversa.mockResolvedValue({ agenteAtualId: 5, resumo: "Recepção verificando alternativa", variaveis: { triagem_horario: "verificar_disponibilidade" } });
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [carolAssistida]);

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 490 })).resolves.toEqual({ status: "ignorada" });

    expect(invokeLLM).not.toHaveBeenCalled();
    expect(agentesDb.criarSugestao).not.toHaveBeenCalled();
  });

  it("fornece a tabela comercial oficial também para Bianca ao responder sobre terapias", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Quais terapias vocês têm?"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [biancaAssistida]);
    agentesDb.listarTabelaPrecosParaAgente.mockResolvedValue([{ servico: "Massagem Relaxante", valor: "250.00" }]);
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: respostaJson("Temos Massagem Relaxante e outras terapias disponíveis.") } }] });

    await processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 435 });

    expect(agentesDb.listarTabelaPrecosParaAgente).toHaveBeenCalledWith(1);
    expect(invokeLLM.mock.calls[0]?.[0].messages[0].content).toContain("REGRA DE TERAPIAS");
    expect(invokeLLM.mock.calls[0]?.[0].messages[0].content).toContain("NOMENCLATURA OFICIAL");
    expect(invokeLLM.mock.calls[0]?.[0].messages[1].content).toContain("Massagem Relaxante");
  });

  it("encaminha voucher já existente para Carol, sem acionar emissão pela Diana", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Tenho voucher e quero agendar para sábado"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [carolAssistida, dianaAssistida]);
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: respostaJson("Você tem algum período de preferência? ✨") } }] });

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 491 })).resolves.toEqual({ status: "concluida", sugestaoId: 91 });

    expect(agentesDb.criarSugestao).toHaveBeenCalledWith(expect.objectContaining({ agenteId: 5 }));
    expect(agentesDb.criarSugestao).not.toHaveBeenCalledWith(expect.objectContaining({ agenteId: 6 }));
  });

  it("prioriza uma pergunta explícita sobre terapias sobre o estado anterior de voucher", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Quais terapias vocês oferecem?"));
    agentesDb.obterEstadoConversa.mockResolvedValue({ agenteAtualId: 6, resumo: "Coleta de voucher pendente", variaveis: { tipo_voucher: "virtual" } });
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [biancaAssistida, dianaAssistida]);
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: respostaJson("Claro. Temos massagens, drenagens e experiências de Day Spa. Você procura mais relaxamento, alívio de tensão ou cuidado corporal?") } }] });

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 441 })).resolves.toEqual({ status: "concluida", sugestaoId: 91 });

    expect(invokeLLM).toHaveBeenCalledTimes(1);
    expect(agentesDb.criarSugestao).toHaveBeenCalledWith(expect.objectContaining({ agenteId: 2 }));
    expect(agentesDb.concluirExecucao).toHaveBeenCalledWith(90, expect.objectContaining({ classificacao: "bianca" }));
    expect(agentesDb.salvarEstadoConversa).toHaveBeenCalledWith(expect.objectContaining({ agenteAtualId: 2, variaveis: {} }));
  });

  it("prioriza preço e mantém o agendamento como próxima etapa quando não há pedido de explicação", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Quero agendar uma massagem, quanto custa?"));
    const estelaAssistida = { agente: { id: 4, chave: "estela", nome: "Estela", descricao: "Preços", modelo: "gpt-5-mini", modoOperacao: "assistido" }, prompt: { id: 14, conteudo: "Informe apenas a tabela." } };
    const carolAssistida = { agente: { id: 5, chave: "carol", nome: "Carol", descricao: "Agendamento", modelo: "gpt-5-mini", modoOperacao: "assistido" }, prompt: { id: 15, conteudo: "Prepare o agendamento." } };
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [biancaAssistida, estelaAssistida, carolAssistida]);
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: respostaJson("A Massagem Relaxante 60 tem o valor de R$ 220,00. Na sequência, seguimos com o agendamento.") } }] });

    await processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 443 });

    expect(agentesDb.listarScriptsParaAgentes).toHaveBeenCalledWith("estela");
    expect(agentesDb.salvarEstadoConversa).toHaveBeenCalledWith(expect.objectContaining({
      agenteAtualId: 4,
      proximaRota: "carol",
      variaveis: expect.objectContaining({ rotas_pendentes: null }),
    }));
  });

  it("permite texto maior somente quando Diana marca uma coleta operacional de voucher", async () => {
    const coletaVoucher = "Para concluir seu voucher, preciso confirmar o tipo, a personalização, o nome do presenteado e a mensagem. ".repeat(5);
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Quero concluir a emissão de um voucher"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [dianaAssistida]);
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: respostaJson(coletaVoucher, "in_process", null, true) } }] });

    await processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 442 });

    const sugestao = agentesDb.criarSugestao.mock.calls[0]?.[0]?.sugestao as string;
    expect(sugestao.length).toBeGreaterThan(350);
    expect(sugestao.length).toBeLessThanOrEqual(651);
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
    expect(chamadaDiana).toMatchObject({ tool_choice: "none", tools: [], reasoningEffort: "low" });
    expect(chamadaDiana).not.toHaveProperty("response_format");
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

  it("seleciona um Script pelo contexto, preservando uma transição cordial quando necessária", async () => {
    agentesDb.obterContextoConversa.mockResolvedValue(contexto("Pode me explicar como é a drenagem linfática?"));
    agentesDb.listarAgentesAtivosComPrompt.mockImplementation(async (_unidadeId: number, tipo: string) => tipo === "receptor" ? [receptor] : [biancaAssistida]);
    agentesDb.listarScriptsParaAgentes.mockResolvedValue([{
      id: 77,
      categoriaScript: "Terapias",
      titulo: "Drenagem Linfática",
      descricao: "Explicar técnica, benefícios e durações da drenagem linfática.",
      tipo: "texto",
      script: "Técnica com movimentos sutis que auxilia na redução de edemas e na sensação de leveza.",
      fluxoId: null,
      fluxoNome: null,
    }]);
    invokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ message: "Claro, vou explicar:", status: "in_process", summary: "Explicação de drenagem solicitada.", variables: {}, action: null, scriptId: 77 }) } }] });

    await expect(processarMensagemRecebida({ conversaId: 10, mensagemEntradaId: 49 })).resolves.toEqual({ status: "concluida", sugestaoId: 91 });

    const contextoEspecialista = invokeLLM.mock.calls[0]?.[0].messages[1].content as string;
    expect(contextoEspecialista).toContain("Explicar técnica, benefícios e durações da drenagem linfática.");
    expect(contextoEspecialista).not.toContain("Técnica com movimentos sutis");
    expect(agentesDb.criarSugestao).toHaveBeenCalledWith(expect.objectContaining({
      sugestao: "Claro, vou explicar:\n\nTécnica com movimentos sutis que auxilia na redução de edemas e na sensação de leveza.",
    }));
  });

  it("registra uma reprovação com motivo operacional", async () => {
    await reprovarSugestao({ sugestaoId: 91, comentario: "Não pode confirmar disponibilidade", motivo: "operacional", userId: 7, atendenteId: 3 });
    expect(agentesDb.avaliarSugestao).toHaveBeenCalledWith(expect.objectContaining({ sugestaoId: 91, avaliacao: "reprovada", tipoRevisao: "rejeitada", motivo: "operacional" }));
  });

  it("aprova, envia e registra uma ação pendente da conversa", async () => {
    agentesDb.buscarSugestao.mockResolvedValue({ sugestao: { id: 91, conversaId: 10, sugestao: "Posso enviar a tabela de valores.", acaoPendente: "enviar_tabela" } });
    agentesDb.obterNomeAtendente.mockResolvedValue("Ana");
    db.getInboxConversaById.mockResolvedValue({ id: 10, unidadeId: 1, canal: "zapi", telefone: "5516999999999", nomeContato: "Carla" });
    db.getUnidadeById.mockResolvedValue({ zapiInstanceId: "instancia", zapiToken: "token", zapiClientToken: "client" });
    sendText.mockResolvedValue({ messageId: "zapi-1" });

    await expect(aprovarEEnviarSugestao({ sugestaoId: 91, comentario: "Ajustado", motivo: "tom", userId: 7, atendenteId: 3 })).resolves.toEqual({ success: true });

    expect(agentesDb.avaliarSugestao).toHaveBeenCalledWith(expect.objectContaining({ avaliacao: "aprovada", tipoRevisao: "aceita_como_esta", textoFinal: "Posso enviar a tabela de valores.", motivo: "tom" }));
    expect(db.insertInboxMensagem).toHaveBeenCalledWith(expect.objectContaining({ conteudo: "*Ana:*\nPosso enviar a tabela de valores." }));
    expect(agentesDb.registrarAcaoConversa).toHaveBeenCalledWith(10, "enviar_tabela", 91);
  });

  it("envia o texto editado pela equipe e registra a revisão para aprendizado", async () => {
    agentesDb.buscarSugestao.mockResolvedValue({ sugestao: { id: 95, conversaId: 10, sugestao: "Posso enviar a tabela de valores.", acaoPendente: null } });
    agentesDb.obterNomeAtendente.mockResolvedValue("Ana");
    db.getInboxConversaById.mockResolvedValue({ id: 10, unidadeId: 1, canal: "zapi", telefone: "5516999999999", nomeContato: "Carla" });
    db.getUnidadeById.mockResolvedValue({ zapiInstanceId: "instancia", zapiToken: "token", zapiClientToken: "client" });
    sendText.mockResolvedValue({ messageId: "zapi-edicao-1" });

    await expect(aprovarEEnviarSugestao({
      sugestaoId: 95,
      textoFinal: "Posso enviar a tabela atualizada de valores para você.",
      tipoRevisao: "editada",
      userId: 7,
      atendenteId: 3,
    })).resolves.toEqual({ success: true });

    expect(agentesDb.avaliarSugestao).toHaveBeenCalledWith(expect.objectContaining({
      sugestaoId: 95,
      avaliacao: "aprovada",
      tipoRevisao: "editada",
      textoFinal: "Posso enviar a tabela atualizada de valores para você.",
    }));
    expect(db.insertInboxMensagem).toHaveBeenCalledWith(expect.objectContaining({ conteudo: "*Ana:*\nPosso enviar a tabela atualizada de valores para você." }));
  });

  it("inicia um fluxo associado ao Script somente depois da aprovação humana", async () => {
    agentesDb.buscarSugestao.mockResolvedValue({ sugestao: { id: 96, conversaId: 10, sugestao: "Vou seguir com seu atendimento.", acaoPendente: "script_fluxo:78" } });
    agentesDb.obterNomeAtendente.mockResolvedValue("Ana");
    db.getInboxConversaById.mockResolvedValue({ id: 10, unidadeId: 1, clienteId: 42, canal: "zapi", telefone: "5516999999999", nomeContato: "Carla" });
    db.getUnidadeById.mockResolvedValue({ zapiInstanceId: "instancia", zapiToken: "token", zapiClientToken: "client" });
    db.getScriptById.mockResolvedValue({ id: 78, fluxoId: 31 });
    sendText.mockResolvedValue({ messageId: "zapi-flux-1" });
    iniciarExecucaoFluxo.mockResolvedValue({ id: 18 });

    await expect(aprovarEEnviarSugestao({ sugestaoId: 96, userId: 7, atendenteId: 3 })).resolves.toEqual({ success: true });

    expect(iniciarExecucaoFluxo).toHaveBeenCalledWith(31, 10, 42, { nome_atendente: "Ana" });
    expect(agentesDb.registrarAcaoConversa).toHaveBeenCalledWith(10, "script_fluxo:78", 96);
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

  it("libera a edição sem enviar mensagem nem executar uma ação pendente", async () => {
    agentesDb.buscarSugestao.mockResolvedValue({ sugestao: { id: 95, conversaId: 10, sugestao: "Texto original", acaoPendente: "enviar_menu_servicos" } });

    await expect(liberarSugestaoParaEdicao({ sugestaoId: 95, textoBase: "Texto em edição", userId: 7, atendenteId: 3 })).resolves.toEqual({ success: true });

    expect(agentesDb.avaliarSugestao).toHaveBeenCalledWith(expect.objectContaining({
      sugestaoId: 95,
      avaliacao: "aprovada",
      tipoRevisao: "editada",
      textoFinal: "Texto em edição",
    }));
    expect(sendText).not.toHaveBeenCalled();
    expect(sendDocument).not.toHaveBeenCalled();
    expect(agentesDb.marcarSugestaoEnviada).not.toHaveBeenCalled();
  });
});

describe("contexto de continuidade da Carol", () => {
  it("orienta a Carol a usar plano, histórico e último atendimento na preparação do agendamento", () => {
    const instrucao = instrucaoContextoRelacionamento("carol");
    expect(instrucao).toContain("saldo de sessões");
    expect(instrucao).toContain("Nunca afirme que existe horário");
    expect(instrucao).toContain("atendimentos concluídos");
    expect(instrucao).toContain("status \"bianca\"");
    expect(instrucaoContextoRelacionamento("bianca")).toBe("");
    expect(instrucaoContextoRelacionamento("diana")).toBe("");
  });
});
