import { desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { agentesCasosRegressao, agentesRegressaoExecucoes, type AgenteCasoRegressao } from "../drizzle/schema";
import { obterRespostaEspecialistaParaRegressao } from "./agentesService";

type Usuario = { id: number; name: string | null };

/** Frases proibidas checadas por substring, sem diferenciar maiúsculas/minúsculas ou acento. */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").toLowerCase();
}

export function verificarViolacoes(caso: Pick<AgenteCasoRegressao, "regrasProibidas" | "mensagemDeveSerVazia">, mensagem: string): string[] {
  const violacoes: string[] = [];
  if (caso.mensagemDeveSerVazia && mensagem.trim()) {
    violacoes.push(`Deveria ficar em silêncio (saída de não intervenção), mas respondeu: "${mensagem.slice(0, 100)}"`);
  }
  const mensagemNormalizada = normalizar(mensagem);
  for (const regra of caso.regrasProibidas) {
    if (mensagemNormalizada.includes(normalizar(regra))) violacoes.push(`Contém frase proibida: "${regra}"`);
  }
  return violacoes;
}

export async function listarCasosRegressaoComUltimaExecucao() {
  const db = await getDb();
  if (!db) return [];
  const casos = await db.select().from(agentesCasosRegressao).orderBy(desc(agentesCasosRegressao.createdAt));
  const resultado = [];
  for (const caso of casos) {
    const ultima = await db.select().from(agentesRegressaoExecucoes)
      .where(eq(agentesRegressaoExecucoes.casoId, caso.id))
      .orderBy(desc(agentesRegressaoExecucoes.executadoEm)).limit(1);
    resultado.push({ caso, ultimaExecucao: ultima[0] ?? null });
  }
  return resultado;
}

export async function criarCasoRegressao(params: {
  nome: string;
  chaveAgente: "bianca" | "fabricia" | "estela" | "carol" | "diana";
  conversaId: number;
  ateDataHora: Date;
  regrasProibidas: string[];
  mensagemDeveSerVazia: boolean;
  descricaoEsperada?: string | null;
  usuario: Usuario;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const [resultado] = await db.insert(agentesCasosRegressao).values({
    nome: params.nome,
    chaveAgente: params.chaveAgente,
    conversaId: params.conversaId,
    ateDataHora: params.ateDataHora,
    regrasProibidas: params.regrasProibidas,
    mensagemDeveSerVazia: params.mensagemDeveSerVazia,
    descricaoEsperada: params.descricaoEsperada ?? null,
    criadoPorUserId: params.usuario.id,
    criadoPorNome: params.usuario.name,
  }).$returningId();
  return resultado;
}

/** Roda um caso contra o prompt ATIVO agora e grava o resultado — nunca toca em execução/sugestão/Inbox real. */
export async function rodarCasoRegressao(casoId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const [caso] = await db.select().from(agentesCasosRegressao).where(eq(agentesCasosRegressao.id, casoId)).limit(1);
  if (!caso) throw new Error("Caso de regressão não encontrado.");

  try {
    const { resposta, promptVersao } = await obterRespostaEspecialistaParaRegressao({
      conversaId: caso.conversaId,
      chaveAgente: caso.chaveAgente,
      ateDataHora: caso.ateDataHora,
    });
    const violacoes = verificarViolacoes(caso, resposta.message);
    const [execucao] = await db.insert(agentesRegressaoExecucoes).values({
      casoId,
      promptVersao,
      mensagem: resposta.message,
      status: resposta.status,
      summary: resposta.summary,
      violacoes,
    }).$returningId();
    return { execucaoId: execucao.id, violacoes, mensagem: resposta.message, status: resposta.status, summary: resposta.summary };
  } catch (error) {
    const erroMsg = error instanceof Error ? error.message : String(error);
    await db.insert(agentesRegressaoExecucoes).values({ casoId, erro: erroMsg });
    throw error;
  }
}

export async function rodarSuiteRegressao() {
  const db = await getDb();
  if (!db) return { total: 0, comViolacao: 0 };
  const casos = await db.select({ id: agentesCasosRegressao.id }).from(agentesCasosRegressao).where(eq(agentesCasosRegressao.ativo, true));
  let comViolacao = 0;
  for (const caso of casos) {
    try {
      const resultado = await rodarCasoRegressao(caso.id);
      if (resultado.violacoes.length) comViolacao++;
    } catch {
      comViolacao++;
    }
  }
  return { total: casos.length, comViolacao };
}

export async function avaliarExecucaoRegressao(params: { execucaoId: number; notaHumana?: number | null; comentarioHumano?: string | null; usuario: Usuario }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.update(agentesRegressaoExecucoes).set({
    notaHumana: params.notaHumana ?? null,
    comentarioHumano: params.comentarioHumano ?? null,
    avaliadoPorUserId: params.usuario.id,
    avaliadoPorNome: params.usuario.name,
    avaliadoEm: new Date(),
  }).where(eq(agentesRegressaoExecucoes.id, params.execucaoId));
  return { success: true };
}
