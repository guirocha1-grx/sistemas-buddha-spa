import { and, desc, eq, gte, inArray, isNull, like, lte, or, sql } from "drizzle-orm";
import {
  agentesAcoesConversa,
  agentesAtendimento,
  agentesConfiguracoes,
  agentesConversas,
  agentesExecucoes,
  agentesPromptVersoes,
  agentesRecursos,
  agentesSugestoes,
  agentesTabelaPrecos,
  atendentes,
  clientes,
  inboxConversas,
  inboxMensagens,
  unidades,
  type InsertAgenteAtendimento,
} from "../drizzle/schema";
import { getDb } from "./db";
import { taxaAprovacaoHumana } from "./agentesPolicy";

export type VariaveisAgente = Record<string, string | number | boolean | null>;
export type TipoRecursoAgente = "preco" | "promocao" | "conteudo" | "midia" | "modelo_voucher";

export const AGENTES_INICIAIS: Array<Pick<InsertAgenteAtendimento, "chave" | "nome" | "descricao" | "tipo" | "ordem">> = [
  { chave: "aurea", nome: "Aurea", descricao: "Qualifica a mensagem e direciona silenciosamente para a especialidade correta.", tipo: "receptor", ordem: 1 },
  { chave: "bianca", nome: "Bianca", descricao: "Terapias e experiência sensorial, sem preços.", tipo: "especialista", ordem: 2 },
  { chave: "fabricia", nome: "Fabricia", descricao: "Day Spa, estrutura e regras operacionais.", tipo: "especialista", ordem: 3 },
  { chave: "estela", nome: "Estela", descricao: "Preços, promoções e condições comerciais oficiais.", tipo: "especialista", ordem: 4 },
  { chave: "carol", nome: "Carol", descricao: "Coleta e revisa solicitações de agendamento para confirmação humana.", tipo: "especialista", ordem: 5 },
  { chave: "diana", nome: "Diana", descricao: "Explica e prepara solicitações de voucher para emissão humana.", tipo: "especialista", ordem: 6 },
];

/** Regra compartilhada por todo especialista: o roteamento entre bianca/fabricia/estela/carol/diana
 *  é interno (ver rotaDeterministica em agentesPolicy.ts e o handoff em processarMensagemRecebida)
 *  e nunca deve aparecer pro cliente — ele deve ler como um único atendimento contínuo, nunca como
 *  vários bots se revezando. Pedido explícito do usuário 2026-08-18 após a Diana se apresentar por
 *  nome numa resposta real. */
const REGRA_SEM_IDENTIFICACAO = "Nunca diga seu nome, nunca diga que é uma especialista/atendente diferente da que já estava conversando, e nunca cumprimente de novo como se a conversa estivesse recomeçando — responda como continuação natural do mesmo atendimento, sem revelar a troca interna entre especialistas.";

const CRIADO_POR_BOOTSTRAP = "Bootstrap seguro do copilot";

const PROMPTS_BOOTSTRAP: Record<string, string> = {
  aurea: `Você é Aurea, receptora do Buddha Spa Ribeirão Shopping. Classifique a intenção da última mensagem entre bianca, fabricia, estela, carol, diana ou humano. Pedidos de pessoa, conflito, reclamação, dados sensíveis ou contexto inseguro devem ir para humano. Não escreva resposta ao cliente. Retorne apenas JSON: {"destino":"bianca","confianca":0}.`,
  bianca: `Você é Bianca, especialista em terapias e bem-estar do Buddha Spa Ribeirão Shopping. ${REGRA_SEM_IDENTIFICACAO} Explique experiências somente com base nas fontes oficiais fornecidas. Não informe preço, desconto, agenda ou disponibilidade; encaminhe preço para estela e intenção de agendar para carol. Nunca faça promessa médica. Retorne apenas JSON: {"message":"","status":"in_process","summary":"","variables":{},"action":null}.`,
  fabricia: `Você é Fabricia, especialista em Day Spa e estrutura do Buddha Spa Ribeirão Shopping. ${REGRA_SEM_IDENTIFICACAO} Use somente composições e regras presentes nas fontes oficiais. Para valores use estela e para reserva use carol. Não prometa ajustes ou substituições sem confirmação humana. Retorne apenas JSON: {"message":"","status":"in_process","summary":"","variables":{},"action":null}.`,
  estela: `Você é Estela, especialista comercial do Buddha Spa Ribeirão Shopping. ${REGRA_SEM_IDENTIFICACAO} Informe somente preços e condições presentes na tabela e fontes oficiais. Diferencie segunda a sábado de domingos e feriados quando aplicável. Não estime valores, negocie descontos ou confirme disponibilidade. Para agendamento encaminhe para carol. Retorne apenas JSON: {"message":"","status":"in_process","summary":"","variables":{},"action":null}.`,
  carol: `Você é Carol, especialista em preparação de agendamento do Buddha Spa Ribeirão Shopping. ${REGRA_SEM_IDENTIFICACAO} Colete serviço, data, período/horário e quantidade de pessoas. Nunca confirme vaga, profissional, horário ou pagamento. Quando os dados mínimos estiverem completos, use status success e deixe um pedido estruturado para confirmação humana. Retorne apenas JSON: {"message":"","status":"in_process","summary":"","variables":{},"action":null}.`,
  diana: `Você é Diana, especialista em vouchers do Buddha Spa Ribeirão Shopping. ${REGRA_SEM_IDENTIFICACAO} Explique as opções apenas com base nas fontes oficiais e colete serviço ou valor, presenteado e mensagem opcional. Nunca emita voucher, cobre ou confirme pagamento. Quando a solicitação estiver completa, use status success e deixe um pedido claro para a equipe. Retorne apenas JSON: {"message":"","status":"in_process","summary":"","variables":{},"action":null}.`,
};

async function obterAgentesCatalogo() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agentesAtendimento)
    .where(inArray(agentesAtendimento.chave, AGENTES_INICIAIS.map((agente) => agente.chave)))
    .orderBy(agentesAtendimento.ordem);
}

export async function garantirAgentesIniciais(unidadeId?: number) {
  const db = await getDb();
  if (!db) return [];
  for (const agente of AGENTES_INICIAIS) {
    await db.insert(agentesAtendimento).values({ ...agente, ativo: true, modoOperacao: "assistido", modelo: "gpt-5-mini" })
      .onDuplicateKeyUpdate({ set: {
        nome: sql`VALUES(nome)`,
        descricao: sql`VALUES(descricao)`,
        tipo: sql`VALUES(tipo)`,
        ordem: sql`VALUES(ordem)`,
      } });
  }
  const agentes = await obterAgentesCatalogo();
  if (unidadeId) {
    for (const agente of agentes) {
      await db.insert(agentesConfiguracoes).values({
        agenteId: agente.id,
        unidadeId,
        ativo: false,
        modoOperacao: "assistido",
        modelo: "gpt-5-mini",
      }).onDuplicateKeyUpdate({ set: { agenteId: sql`VALUES(agenteId)` } });
    }

    const promptsAtivos = await db.select({
      agenteId: agentesPromptVersoes.agenteId,
      id: agentesPromptVersoes.id,
      conteudo: agentesPromptVersoes.conteudo,
      criadoPorNome: agentesPromptVersoes.criadoPorNome,
    })
      .from(agentesPromptVersoes)
      .where(and(
        eq(agentesPromptVersoes.unidadeId, unidadeId),
        eq(agentesPromptVersoes.status, "ativo"),
      ));
    const promptAtivoPorAgente = new Map(promptsAtivos.map((item) => [item.agenteId, item]));
    for (const agente of agentes) {
      const bootstrap = PROMPTS_BOOTSTRAP[agente.chave] ?? "Retorne apenas JSON com uma sugestão segura para revisão humana.";
      const ativo = promptAtivoPorAgente.get(agente.id);
      // Só resincroniza prompt que o próprio bootstrap criou (criadoPorNome
      // ainda é CRIADO_POR_BOOTSTRAP) e cujo conteúdo mudou no código —
      // uma versão editada manualmente pelo admin em /agentes nunca é
      // sobrescrita aqui.
      const precisaResincronizar = ativo && ativo.criadoPorNome === CRIADO_POR_BOOTSTRAP && ativo.conteudo !== bootstrap;
      if (ativo && !precisaResincronizar) continue;
      if (ativo) {
        await db.update(agentesPromptVersoes).set({ status: "arquivado" }).where(eq(agentesPromptVersoes.id, ativo.id));
      }
      const maiorVersao = await db.select({ maior: sql<number>`COALESCE(MAX(${agentesPromptVersoes.versao}), 0)` })
        .from(agentesPromptVersoes)
        .where(and(eq(agentesPromptVersoes.agenteId, agente.id), eq(agentesPromptVersoes.unidadeId, unidadeId)));
      await db.insert(agentesPromptVersoes).values({
        agenteId: agente.id,
        unidadeId,
        versao: Number(maiorVersao[0]?.maior ?? 0) + 1,
        conteudo: bootstrap,
        status: "ativo",
        criadoPorNome: CRIADO_POR_BOOTSTRAP,
        ativadoEm: new Date(),
      });
    }
  }
  return agentes;
}

export async function listarAgentesComPrompts(unidadeId: number) {
  await garantirAgentesIniciais(unidadeId);
  const db = await getDb();
  if (!db) return [];
  const [agentes, configuracoes, versoes] = await Promise.all([
    obterAgentesCatalogo(),
    db.select().from(agentesConfiguracoes).where(eq(agentesConfiguracoes.unidadeId, unidadeId)),
    db.select().from(agentesPromptVersoes)
      .where(eq(agentesPromptVersoes.unidadeId, unidadeId))
      .orderBy(desc(agentesPromptVersoes.versao)),
  ]);
  return agentes.map((agente) => {
    const configuracao = configuracoes.find((item) => item.agenteId === agente.id);
    const versoesAgente = versoes.filter((versao) => versao.agenteId === agente.id);
    return {
      ...agente,
      ativo: configuracao?.ativo ?? false,
      modoOperacao: configuracao?.modoOperacao ?? "assistido",
      modelo: configuracao?.modelo ?? "gpt-5-mini",
      unidadeId,
      promptAtivo: versoesAgente.find((versao) => versao.status === "ativo") ?? null,
      versoes: versoesAgente,
    };
  });
}

export async function listarAgentesAtivosComPrompt(unidadeId: number, tipo?: "receptor" | "especialista") {
  await garantirAgentesIniciais(unidadeId);
  const db = await getDb();
  if (!db) return [];
  const condicoes = [
    eq(agentesConfiguracoes.unidadeId, unidadeId),
    eq(agentesConfiguracoes.ativo, true),
    eq(agentesAtendimento.ativo, true),
    eq(agentesPromptVersoes.unidadeId, unidadeId),
    eq(agentesPromptVersoes.status, "ativo"),
  ];
  if (tipo) condicoes.push(eq(agentesAtendimento.tipo, tipo));
  const linhas = await db.select({ agente: agentesAtendimento, configuracao: agentesConfiguracoes, prompt: agentesPromptVersoes })
    .from(agentesConfiguracoes)
    .innerJoin(agentesAtendimento, eq(agentesConfiguracoes.agenteId, agentesAtendimento.id))
    .innerJoin(agentesPromptVersoes, and(
      eq(agentesPromptVersoes.agenteId, agentesAtendimento.id),
      eq(agentesPromptVersoes.unidadeId, agentesConfiguracoes.unidadeId),
    ))
    .where(and(...condicoes))
    .orderBy(agentesAtendimento.ordem);
  return linhas.map(({ agente, configuracao, prompt }) => ({
    agente: { ...agente, ativo: configuracao.ativo, modoOperacao: configuracao.modoOperacao, modelo: configuracao.modelo, unidadeId },
    prompt,
  }));
}

export async function atualizarAgente(params: { id: number; nome?: string; descricao?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const dados = { nome: params.nome, descricao: params.descricao };
  await db.update(agentesAtendimento).set(dados).where(eq(agentesAtendimento.id, params.id));
}

export async function atualizarConfiguracaoAgente(params: {
  agenteId: number;
  unidadeId: number;
  ativo?: boolean;
  modoOperacao?: "assistido" | "automatico";
  modelo?: string;
}) {
  await garantirAgentesIniciais(params.unidadeId);
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const { agenteId, unidadeId, ...dados } = params;
  await db.update(agentesConfiguracoes).set(dados)
    .where(and(eq(agentesConfiguracoes.agenteId, agenteId), eq(agentesConfiguracoes.unidadeId, unidadeId)));
}

/** Ativa ou desativa o processamento assistido de todos os agentes da unidade. Não altera a automação individual. */
export async function atualizarAtivacaoTodosAgentes(unidadeId: number, ativo: boolean) {
  await garantirAgentesIniciais(unidadeId);
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  await db.update(agentesConfiguracoes).set({ ativo })
    .where(eq(agentesConfiguracoes.unidadeId, unidadeId));
}

export async function criarVersaoPrompt(params: {
  agenteId: number;
  unidadeId: number;
  conteudo: string;
  status: "rascunho" | "ativo";
  criadoPorUserId: number;
  criadoPorNome?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const resultado = await db.select({ maior: sql<number>`COALESCE(MAX(${agentesPromptVersoes.versao}), 0)` })
    .from(agentesPromptVersoes)
    .where(and(eq(agentesPromptVersoes.agenteId, params.agenteId), eq(agentesPromptVersoes.unidadeId, params.unidadeId)));
  const versao = Number(resultado[0]?.maior ?? 0) + 1;
  if (params.status === "ativo") {
    await db.update(agentesPromptVersoes).set({ status: "arquivado" })
      .where(and(
        eq(agentesPromptVersoes.agenteId, params.agenteId),
        eq(agentesPromptVersoes.unidadeId, params.unidadeId),
        eq(agentesPromptVersoes.status, "ativo"),
      ));
  }
  const insert = await db.insert(agentesPromptVersoes).values({
    agenteId: params.agenteId,
    unidadeId: params.unidadeId,
    versao,
    conteudo: params.conteudo,
    status: params.status,
    criadoPorUserId: params.criadoPorUserId,
    criadoPorNome: params.criadoPorNome ?? null,
    ativadoEm: params.status === "ativo" ? new Date() : null,
  }).$returningId();
  return { id: insert[0]?.id, versao };
}

export async function ativarVersaoPrompt(agenteId: number, unidadeId: number, versaoId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const versao = await db.select().from(agentesPromptVersoes)
    .where(and(
      eq(agentesPromptVersoes.id, versaoId),
      eq(agentesPromptVersoes.agenteId, agenteId),
      eq(agentesPromptVersoes.unidadeId, unidadeId),
    )).limit(1);
  if (!versao[0]) throw new Error("Versão de prompt não encontrada");
  await db.update(agentesPromptVersoes).set({ status: "arquivado" })
    .where(and(
      eq(agentesPromptVersoes.agenteId, agenteId),
      eq(agentesPromptVersoes.unidadeId, unidadeId),
      eq(agentesPromptVersoes.status, "ativo"),
    ));
  await db.update(agentesPromptVersoes).set({ status: "ativo", ativadoEm: new Date() })
    .where(eq(agentesPromptVersoes.id, versaoId));
}

export async function buscarExecucaoPorMensagem(mensagemEntradaId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(agentesExecucoes)
    .where(eq(agentesExecucoes.mensagemEntradaId, mensagemEntradaId)).limit(1);
  return rows[0];
}

export async function criarExecucao(params: {
  conversaId: number;
  mensagemEntradaId: number;
  agenteReceptorId?: number | null;
  agenteEspecialistaId?: number | null;
  promptReceptorId?: number | null;
  promptEspecialistaId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const insert = await db.insert(agentesExecucoes).values(params).$returningId();
  return insert[0]?.id;
}

export async function concluirExecucao(id: number, dados: {
  agenteEspecialistaId?: number | null;
  promptReceptorId?: number | null;
  promptEspecialistaId?: number | null;
  classificacao?: string | null;
  confianca?: number | null;
  status: "concluida" | "ignorada" | "erro";
  erroMsg?: string | null;
  rastro?: Record<string, unknown> | null;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(agentesExecucoes).set({ ...dados, concludedAt: new Date() }).where(eq(agentesExecucoes.id, id));
}

/** Histórico operacional seguro para diagnóstico administrativo no Inbox. Nunca inclui prompts ou credenciais. */
export async function listarDiagnosticoConversa(conversaId: number, limite = 30) {
  const db = await getDb();
  if (!db) return [];
  const execucoes = await db.select().from(agentesExecucoes)
    .where(eq(agentesExecucoes.conversaId, conversaId))
    .orderBy(desc(agentesExecucoes.createdAt))
    .limit(Math.min(Math.max(limite, 1), 100));
  if (execucoes.length === 0) return [];

  const idsAgentes = Array.from(new Set(execucoes.flatMap((item) => [item.agenteReceptorId, item.agenteEspecialistaId]).filter((id): id is number => typeof id === "number")));
  const [agentes, sugestoes] = await Promise.all([
    idsAgentes.length ? db.select({ id: agentesAtendimento.id, nome: agentesAtendimento.nome, chave: agentesAtendimento.chave }).from(agentesAtendimento).where(inArray(agentesAtendimento.id, idsAgentes)) : Promise.resolve([]),
    db.select().from(agentesSugestoes).where(inArray(agentesSugestoes.execucaoId, execucoes.map((item) => item.id))),
  ]);
  const porAgente = new Map(agentes.map((item) => [item.id, item]));
  const porExecucao = new Map(sugestoes.map((item) => [item.execucaoId, item]));

  return execucoes.map((item) => {
    const sugestao = porExecucao.get(item.id);
    return {
      id: item.id,
      mensagemEntradaId: item.mensagemEntradaId,
      createdAt: item.createdAt,
      concludedAt: item.concludedAt,
      status: item.status,
      classificacao: item.classificacao,
      confianca: item.confianca,
      receptor: item.agenteReceptorId ? porAgente.get(item.agenteReceptorId) ?? null : null,
      especialista: item.agenteEspecialistaId ? porAgente.get(item.agenteEspecialistaId) ?? null : null,
      rastro: item.rastro,
      erro: item.erroMsg,
      sugestao: sugestao ? {
        id: sugestao.id,
        texto: sugestao.sugestao,
        statusAgente: sugestao.statusAgente,
        avaliacao: sugestao.avaliacao,
        tipoRevisao: sugestao.tipoRevisao,
        textoFinal: sugestao.textoFinal,
        motivoAvaliacao: sugestao.motivoAvaliacao,
        comentarioAvaliacao: sugestao.comentarioAvaliacao,
        acaoPendente: sugestao.acaoPendente,
        enviadaEm: sugestao.enviadaEm,
        erroEnvio: sugestao.erroEnvio,
      } : null,
    };
  });
}

export async function obterEstadoConversa(conversaId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const linhas = await db.select().from(agentesConversas).where(eq(agentesConversas.conversaId, conversaId)).limit(1);
  return linhas[0];
}

export async function salvarEstadoConversa(params: {
  conversaId: number;
  unidadeId: number;
  agenteAtualId?: number | null;
  proximaRota?: string | null;
  etapa?: string | null;
  resumo?: string | null;
  variaveis?: VariaveisAgente | null;
  incrementarTentativas?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const existente = await obterEstadoConversa(params.conversaId);
  const { incrementarTentativas, ...dados } = params;
  if (!existente) {
    const insert = await db.insert(agentesConversas).values({
      ...dados,
      tentativasQualificacao: incrementarTentativas ? 1 : 0,
    }).$returningId();
    return insert[0]?.id;
  }
  const atualizacao: Record<string, unknown> = { ...dados };
  if (incrementarTentativas) atualizacao.tentativasQualificacao = sql`${agentesConversas.tentativasQualificacao} + 1`;
  await db.update(agentesConversas).set(atualizacao).where(eq(agentesConversas.conversaId, params.conversaId));
  return existente.id;
}

export async function acaoJaRegistrada(conversaId: number, chaveAcao: string) {
  const db = await getDb();
  if (!db) return false;
  const linhas = await db.select({ id: agentesAcoesConversa.id }).from(agentesAcoesConversa)
    .where(and(eq(agentesAcoesConversa.conversaId, conversaId), eq(agentesAcoesConversa.chaveAcao, chaveAcao))).limit(1);
  return Boolean(linhas[0]);
}

export async function registrarAcaoConversa(conversaId: number, chaveAcao: string, sugestaoId?: number | null) {
  const db = await getDb();
  if (!db) return;
  await db.insert(agentesAcoesConversa).values({ conversaId, chaveAcao, sugestaoId: sugestaoId ?? null })
    .onDuplicateKeyUpdate({ set: { sugestaoId: sql`VALUES(sugestaoId)` } });
}

export async function listarRecursosAtivos(unidadeId: number, tipos?: TipoRecursoAgente[]) {
  const db = await getDb();
  if (!db) return [];
  const agora = new Date();
  const condicoes = [
    eq(agentesRecursos.unidadeId, unidadeId),
    eq(agentesRecursos.ativo, true),
    or(isNull(agentesRecursos.vigenciaInicio), lte(agentesRecursos.vigenciaInicio, agora)),
    or(isNull(agentesRecursos.vigenciaFim), gte(agentesRecursos.vigenciaFim, agora)),
  ];
  if (tipos?.length) condicoes.push(inArray(agentesRecursos.tipo, tipos));
  return db.select().from(agentesRecursos).where(and(...condicoes)).orderBy(agentesRecursos.titulo);
}

export async function listarRecursosAgentes(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agentesRecursos)
    .where(eq(agentesRecursos.unidadeId, unidadeId))
    .orderBy(desc(agentesRecursos.updatedAt));
}

export async function listarTabelaPrecos(params: { unidadeId: number; busca?: string; categoria?: string; apenasAtivos?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const condicoes = [eq(agentesTabelaPrecos.unidadeId, params.unidadeId)];
  if (params.apenasAtivos !== false) condicoes.push(eq(agentesTabelaPrecos.ativo, true));
  if (params.categoria) condicoes.push(eq(agentesTabelaPrecos.categoria, params.categoria));
  if (params.busca?.trim()) condicoes.push(like(agentesTabelaPrecos.servico, `%${params.busca.trim()}%`));
  return db.select().from(agentesTabelaPrecos).where(and(...condicoes)).orderBy(agentesTabelaPrecos.categoria, agentesTabelaPrecos.servico);
}

export async function listarTabelaPrecosParaAgente(unidadeId: number) {
  const precos = await listarTabelaPrecos({ unidadeId, apenasAtivos: true });
  return precos.map((item) => ({
    servico: item.servico,
    categoria: item.categoria,
    duracaoMinutos: item.duracaoMinutos,
    precoSemana: item.precoSemana,
    precoDomingo: item.precoDomingo,
  }));
}

export async function salvarRecursoAgente(params: {
  id?: number;
  unidadeId: number;
  chave: string;
  tipo: TipoRecursoAgente;
  titulo: string;
  conteudo?: string | null;
  url?: string | null;
  vigenciaInicio?: Date | null;
  vigenciaFim?: Date | null;
  ativo: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const { id, ...dados } = params;
  if (id) {
    await db.update(agentesRecursos).set(dados).where(eq(agentesRecursos.id, id));
    return { id };
  }
  const insert = await db.insert(agentesRecursos).values(dados).$returningId();
  return { id: insert[0]?.id };
}

export async function criarSugestao(params: {
  execucaoId: number;
  agenteId: number;
  conversaId: number;
  sugestao: string;
  contexto: { ultimaMensagem: string; nomeContato?: string | null; unidadeId?: number | null };
  statusAgente?: string | null;
  variaveis?: Record<string, unknown> | null;
  acaoPendente?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const insert = await db.insert(agentesSugestoes).values(params).$returningId();
  return insert[0]?.id;
}

export async function buscarSugestao(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select({ sugestao: agentesSugestoes, agente: agentesAtendimento, conversa: inboxConversas })
    .from(agentesSugestoes)
    .innerJoin(agentesAtendimento, eq(agentesSugestoes.agenteId, agentesAtendimento.id))
    .innerJoin(inboxConversas, eq(agentesSugestoes.conversaId, inboxConversas.id))
    .where(eq(agentesSugestoes.id, id)).limit(1);
  return rows[0];
}

export async function listarFilaSugestoes(unidadeId?: number, atendenteResponsavelId?: number) {
  const db = await getDb();
  if (!db) return [];
  const condicoes = [eq(agentesSugestoes.avaliacao, "pendente"), isNull(agentesSugestoes.enviadaEm)];
  if (unidadeId) condicoes.push(eq(inboxConversas.unidadeId, unidadeId));
  if (atendenteResponsavelId) condicoes.push(eq(inboxConversas.atendenteResponsavelId, atendenteResponsavelId));
  return db.select({
    sugestao: agentesSugestoes,
    agenteNome: agentesAtendimento.nome,
    agenteChave: agentesAtendimento.chave,
    atendenteResponsavelId: inboxConversas.atendenteResponsavelId,
    contato: inboxConversas.nomeContato,
    telefone: inboxConversas.telefone,
    canal: inboxConversas.canal,
    unidadeNome: unidades.nome,
  }).from(agentesSugestoes)
    .innerJoin(agentesAtendimento, eq(agentesSugestoes.agenteId, agentesAtendimento.id))
    .innerJoin(inboxConversas, eq(agentesSugestoes.conversaId, inboxConversas.id))
    .leftJoin(unidades, eq(inboxConversas.unidadeId, unidades.id))
    .where(and(...condicoes))
    .orderBy(desc(agentesSugestoes.createdAt));
}

export async function avaliarSugestao(params: {
  sugestaoId: number;
  avaliacao: "aprovada" | "reprovada";
  tipoRevisao: "aceita_como_esta" | "editada" | "rejeitada";
  textoFinal?: string | null;
  comentario?: string | null;
  motivo?: "informacao" | "tom" | "roteamento" | "contexto" | "comercial" | "operacional" | "outro" | null;
  userId: number;
  atendenteId?: number | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const atual = await db.select().from(agentesSugestoes).where(eq(agentesSugestoes.id, params.sugestaoId)).limit(1);
  if (!atual[0]) throw new Error("Sugestão não encontrada");
  if (atual[0].avaliacao !== "pendente") throw new Error("Esta sugestão já foi avaliada");
  await db.update(agentesSugestoes).set({
    avaliacao: params.avaliacao,
    tipoRevisao: params.tipoRevisao,
    textoFinal: params.textoFinal?.trim() || null,
    comentarioAvaliacao: params.comentario?.trim() || null,
    motivoAvaliacao: params.motivo ?? null,
    avaliadaPorUserId: params.userId,
    avaliadaPorAtendenteId: params.atendenteId ?? null,
    avaliadaEm: new Date(),
  }).where(eq(agentesSugestoes.id, params.sugestaoId));
}

export async function marcarSugestaoEnviada(id: number, automatico: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(agentesSugestoes).set({ enviadaEm: new Date(), enviadaAutomaticamente: automatico, erroEnvio: null })
    .where(eq(agentesSugestoes.id, id));
}

export async function registrarErroEnvioSugestao(id: number, erro: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(agentesSugestoes).set({ erroEnvio: erro.slice(0, 4000) }).where(eq(agentesSugestoes.id, id));
}

export async function obterContextoConversa(conversaId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const conversa = await db.select({
    conversa: inboxConversas,
    unidadeNome: unidades.nome,
    clienteNome: clientes.nome,
  }).from(inboxConversas)
    .leftJoin(unidades, eq(inboxConversas.unidadeId, unidades.id))
    .leftJoin(clientes, eq(inboxConversas.clienteId, clientes.id))
    .where(eq(inboxConversas.id, conversaId)).limit(1);
  if (!conversa[0]) return undefined;
  const mensagens = await db.select({ direcao: inboxMensagens.direcao, conteudo: inboxMensagens.conteudo, transcricao: inboxMensagens.transcricao, createdAt: inboxMensagens.createdAt })
    .from(inboxMensagens).where(eq(inboxMensagens.conversaId, conversaId))
    .orderBy(desc(inboxMensagens.createdAt)).limit(12);
  return { ...conversa[0], mensagens: mensagens.reverse() };
}

export async function listarMetricasAgentes(unidadeId?: number, inicio?: Date, fim?: Date) {
  await garantirAgentesIniciais(unidadeId);
  const db = await getDb();
  if (!db) return [];
  const condicoes = [];
  if (inicio) condicoes.push(gte(agentesSugestoes.createdAt, inicio));
  if (fim) condicoes.push(lte(agentesSugestoes.createdAt, fim));
  if (unidadeId) condicoes.push(eq(inboxConversas.unidadeId, unidadeId));
  const sugestoes = await db.select({ sugestao: agentesSugestoes }).from(agentesSugestoes)
    .innerJoin(inboxConversas, eq(agentesSugestoes.conversaId, inboxConversas.id))
    .where(and(...condicoes));
  const agentes = await obterAgentesCatalogo();
  return agentes.filter((agente) => agente.tipo === "especialista").map((agente) => {
    const doAgente = sugestoes.map((item) => item.sugestao).filter((sugestao) => sugestao.agenteId === agente.id);
    const aprovadas = doAgente.filter((sugestao) => sugestao.avaliacao === "aprovada").length;
    const reprovadas = doAgente.filter((sugestao) => sugestao.avaliacao === "reprovada").length;
    return {
      agenteId: agente.id,
      agenteNome: agente.nome,
      total: doAgente.length,
      pendentes: doAgente.filter((sugestao) => sugestao.avaliacao === "pendente" && !sugestao.enviadaEm).length,
      aprovadas,
      reprovadas,
      automaticas: doAgente.filter((sugestao) => sugestao.enviadaAutomaticamente).length,
      taxaAprovacao: taxaAprovacaoHumana(aprovadas, reprovadas),
    };
  });
}

export async function listarSerieQualidadeAgentes(unidadeId?: number, inicio?: Date, fim?: Date) {
  const db = await getDb();
  if (!db) return [];
  const condicoes = [inArray(agentesSugestoes.avaliacao, ["aprovada", "reprovada"])];
  if (inicio) condicoes.push(gte(agentesSugestoes.avaliadaEm, inicio));
  if (fim) condicoes.push(lte(agentesSugestoes.avaliadaEm, fim));
  if (unidadeId) condicoes.push(eq(inboxConversas.unidadeId, unidadeId));
  const linhas = await db.select({
    agenteId: agentesAtendimento.id,
    agenteNome: agentesAtendimento.nome,
    avaliacao: agentesSugestoes.avaliacao,
    avaliadaEm: agentesSugestoes.avaliadaEm,
  }).from(agentesSugestoes)
    .innerJoin(agentesAtendimento, eq(agentesSugestoes.agenteId, agentesAtendimento.id))
    .innerJoin(inboxConversas, eq(agentesSugestoes.conversaId, inboxConversas.id))
    .where(and(...condicoes));
  const agrupado = new Map<string, { agenteId: number; agenteNome: string; dia: string; aprovadas: number; reprovadas: number }>();
  for (const linha of linhas) {
    if (!linha.avaliadaEm) continue;
    const dia = linha.avaliadaEm.toISOString().slice(0, 10);
    const chave = `${linha.agenteId}:${dia}`;
    const atual = agrupado.get(chave) ?? { agenteId: linha.agenteId, agenteNome: linha.agenteNome, dia, aprovadas: 0, reprovadas: 0 };
    if (linha.avaliacao === "aprovada") atual.aprovadas++;
    if (linha.avaliacao === "reprovada") atual.reprovadas++;
    agrupado.set(chave, atual);
  }
  return Array.from(agrupado.values()).sort((a, b) => a.dia.localeCompare(b.dia) || a.agenteNome.localeCompare(b.agenteNome));
}

export async function obterNomeAtendente(atendenteId: number | null | undefined) {
  if (!atendenteId) return null;
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ nome: atendentes.nome }).from(atendentes).where(eq(atendentes.id, atendenteId)).limit(1);
  return rows[0]?.nome ?? null;
}
