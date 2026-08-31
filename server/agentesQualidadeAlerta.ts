import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "./db";
import { agentesAtendimento, agentesExecucoes, agentesSugestoes } from "../drizzle/schema";
import { sendTelegramMessage } from "./telegramApi";
import { ENV } from "./_core/env";

const JANELA_ATUAL_HORAS = 24;
const JANELA_BASELINE_DIAS = 7;
const MIN_REPETICOES_MESMA_CONVERSA = 3;
const MIN_AVALIACOES_PARA_COMPARAR = 5;
const TAXA_REPROVACAO_ABSOLUTA_ALERTA = 0.2;
const AUMENTO_ABSOLUTO_ALERTA = 0.15;

/**
 * Fecha o loop que hoje depende de alguém da recepção notar e reclamar
 * (ver análise de evolução dos agentes, 30/08 — "Qual será a terapia?"
 * repetido 9x numa conversa rodou 2 dias antes de alguém avisar). Roda
 * periodicamente (ver server/_core/scheduler.ts) e só manda mensagem
 * quando encontra algo — silêncio quando está tudo normal.
 */
export async function verificarQualidadeAgentes(): Promise<{ alertasEnviados: number }> {
  const db = await getDb();
  if (!db) return { alertasEnviados: 0 };

  const agora = new Date();
  const inicioJanelaAtual = new Date(agora.getTime() - JANELA_ATUAL_HORAS * 60 * 60 * 1000);
  const inicioBaseline = new Date(inicioJanelaAtual.getTime() - JANELA_BASELINE_DIAS * 24 * 60 * 60 * 1000);

  const [repeticoes, taxaAtual, taxaBaseline] = await Promise.all([
    detectarSugestaoRepetida(db, inicioJanelaAtual),
    taxaReprovacaoPorAgente(db, inicioJanelaAtual, agora),
    taxaReprovacaoPorAgente(db, inicioBaseline, inicioJanelaAtual),
  ]);

  const agentes = await db.select({ id: agentesAtendimento.id, nome: agentesAtendimento.nome }).from(agentesAtendimento);
  const nomePorId = new Map(agentes.map((a) => [a.id, a.nome]));

  const blocos: string[] = [];

  if (repeticoes.length) {
    blocos.push(
      `🔁 *Sugestão repetida na mesma conversa* (últimas ${JANELA_ATUAL_HORAS}h):\n` +
      repeticoes.map((r) => `• Conversa ${r.conversaId}: "${r.sugestao.slice(0, 80)}${r.sugestao.length > 80 ? "…" : ""}" — ${r.qtd}x`).join("\n"),
    );
  }

  const regressoes: string[] = [];
  for (const [agenteId, atual] of taxaAtual) {
    const baseline = taxaBaseline.get(agenteId);
    if (!deveAlertarReprovacao(atual, baseline)) continue;
    const taxaBase = baseline && baseline.avaliadas >= MIN_AVALIACOES_PARA_COMPARAR ? baseline.taxa : 0;
    const nome = nomePorId.get(agenteId) ?? `Agente ${agenteId}`;
    regressoes.push(`• ${nome}: ${(atual.taxa * 100).toFixed(0)}% de reprovação agora (${atual.reprovadas}/${atual.avaliadas}) vs ${(taxaBase * 100).toFixed(0)}% na semana anterior`);
  }
  if (regressoes.length) {
    blocos.push(`📉 *Taxa de reprovação subiu*:\n${regressoes.join("\n")}`);
  }

  if (!blocos.length) return { alertasEnviados: 0 };
  if (!ENV.telegramChatIdGuilherme) {
    console.warn("[AgentesQualidadeAlerta] Anomalia encontrada, mas TELEGRAM_CHAT_ID_GUILHERME não configurado.");
    return { alertasEnviados: 0 };
  }

  const texto = `⚠️ *Alerta de qualidade dos agentes*\n\n${blocos.join("\n\n")}`;
  await sendTelegramMessage(ENV.telegramChatIdGuilherme, texto);
  return { alertasEnviados: 1 };
}

type TaxaAgente = { avaliadas: number; reprovadas: number; taxa: number };

/**
 * Alerta se a taxa atual já é alta por si só, OU se subiu bastante em
 * relação à semana anterior — mesmo que ainda não pareça alta em
 * termos absolutos. As duas condições usam MIN_AVALIACOES_PARA_COMPARAR
 * pra não disparar com amostra pequena (1 reprovada em 2 já é 50%).
 */
export function deveAlertarReprovacao(atual: TaxaAgente, baseline: TaxaAgente | undefined): boolean {
  if (atual.avaliadas < MIN_AVALIACOES_PARA_COMPARAR) return false;
  const taxaBase = baseline && baseline.avaliadas >= MIN_AVALIACOES_PARA_COMPARAR ? baseline.taxa : 0;
  const estourouAbsoluto = atual.taxa >= TAXA_REPROVACAO_ABSOLUTA_ALERTA;
  const estourouAumento = atual.taxa - taxaBase >= AUMENTO_ABSOLUTO_ALERTA;
  return estourouAbsoluto || estourouAumento;
}

async function detectarSugestaoRepetida(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, desde: Date) {
  return db
    .select({
      conversaId: agentesExecucoes.conversaId,
      sugestao: agentesSugestoes.sugestao,
      qtd: sql<number>`count(*)`,
    })
    .from(agentesSugestoes)
    .innerJoin(agentesExecucoes, eq(agentesExecucoes.id, agentesSugestoes.execucaoId))
    .where(gte(agentesSugestoes.createdAt, desde))
    .groupBy(agentesExecucoes.conversaId, agentesSugestoes.sugestao)
    .having(sql`count(*) >= ${MIN_REPETICOES_MESMA_CONVERSA}`)
    .orderBy(sql`count(*) desc`)
    .limit(10);
}

async function taxaReprovacaoPorAgente(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, desde: Date, ate: Date) {
  const linhas = await db
    .select({
      agenteId: agentesExecucoes.agenteEspecialistaId,
      avaliacao: agentesSugestoes.avaliacao,
      qtd: sql<number>`count(*)`,
    })
    .from(agentesSugestoes)
    .innerJoin(agentesExecucoes, eq(agentesExecucoes.id, agentesSugestoes.execucaoId))
    .where(and(
      gte(agentesSugestoes.createdAt, desde),
      lt(agentesSugestoes.createdAt, ate),
      inArray(agentesSugestoes.avaliacao, ["aprovada", "reprovada"]),
    ))
    .groupBy(agentesExecucoes.agenteEspecialistaId, agentesSugestoes.avaliacao);

  const porAgente = new Map<number, { avaliadas: number; reprovadas: number; taxa: number }>();
  for (const linha of linhas) {
    if (!linha.agenteId) continue;
    const atual = porAgente.get(linha.agenteId) ?? { avaliadas: 0, reprovadas: 0, taxa: 0 };
    atual.avaliadas += linha.qtd;
    if (linha.avaliacao === "reprovada") atual.reprovadas += linha.qtd;
    porAgente.set(linha.agenteId, atual);
  }
  for (const valor of porAgente.values()) valor.taxa = valor.avaliadas ? valor.reprovadas / valor.avaliadas : 0;
  return porAgente;
}
