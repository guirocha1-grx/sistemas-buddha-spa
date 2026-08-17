/**
 * Rotina diária (7h BRT) — roda a mesma sincronização do botão
 * "Sincronizar tudo" (client/src/components/GlobalSyncCenter.tsx) do
 * lado do servidor, com a mesma retomada automática de erros (1x), e
 * ao final manda um relatório pro Telegram do Guilherme
 * (TELEGRAM_CHAT_ID_GUILHERME): resumo financeiro do dia anterior por
 * unidade + status da conciliação Comanda x Contas (subseção
 * "Conciliação Recepção", mesmo texto que já aparece no hover das
 * células vermelhas em ComandaRecepcao.tsx, ver shared/conciliacao.ts).
 *
 * Registrada via botão admin (routers.ts:
 * financeiro.registrarHeartbeatSincronizacaoDiaria) usando
 * server/_core/heartbeat.ts, não no boot do servidor — mesmo padrão de
 * server/fluxosScheduled.ts.
 *
 * Reaproveita as MESMAS mutations tRPC que o botão "Sincronizar tudo"
 * já chama (appRouter.createCaller), em vez de duplicar a lógica de
 * cada integração aqui — um único lugar de verdade pra cada
 * sincronização, sem risco de o cron divergir do que roda pelo painel.
 * O caller usa um usuário sintético (role admin, sem restrição de
 * módulo) só pra satisfazer o middleware de autenticação dos
 * procedures — auditLog.userId não tem FK, então o id fictício não
 * quebra nada, e fica identificável no log (nome "Cron · Sincronização
 * diária").
 */
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import type { User } from "../drizzle/schema";
import {
  getUnidades,
  resumoContasBancariasPorDia,
  totalSaidasNoPeriodo,
  calcularConciliacaoPorDia,
} from "./db";
import { sendTelegramMessage } from "./telegramApi";

const CRON_USER: User = {
  id: -1,
  openId: "cron-sincronizacao-diaria",
  name: "Cron · Sincronização diária",
  email: null,
  loginMethod: null,
  role: "admin",
  permissoesCustomizadas: false,
  unidadesCustomizadas: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

function callerCron() {
  return appRouter.createCaller({
    req: {} as Request,
    res: {} as Response,
    user: CRON_USER,
    atendente: null,
    permissoesModulos: null,
    permissoesSubsecoes: new Set(),
  });
}

interface TarefaSync {
  unidadeNome: string;
  etapa: string;
  executar: () => Promise<unknown>;
}

/** BRT = UTC-3 — mesma conversão manual usada em client/src/pages/Mensagens.tsx (formatHora), pra não depender do fuso do processo Node. */
function dataIsoBrt(offsetDias: number): string {
  const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;
  const agoraBrt = new Date(Date.now() + BRT_OFFSET_MS + offsetDias * 24 * 60 * 60 * 1000);
  return `${agoraBrt.getUTCFullYear()}-${String(agoraBrt.getUTCMonth() + 1).padStart(2, "0")}-${String(agoraBrt.getUTCDate()).padStart(2, "0")}`;
}

function montarTarefas(caller: ReturnType<typeof callerCron>, unidades: Array<{ id: number; nome: string }>): TarefaSync[] {
  const inicioMes = dataIsoBrt(0).slice(0, 8) + "01";
  const hoje = dataIsoBrt(0);
  const [ano, mes] = hoje.split("-").map(Number);

  const tarefas: TarefaSync[] = [];
  for (const unidade of unidades) {
    tarefas.push({ unidadeNome: unidade.nome, etapa: "Banco Inter", executar: () => caller.inter.sincronizar({ unidadeId: unidade.id, dataInicio: inicioMes, dataFim: hoje }) });
    tarefas.push({ unidadeNome: unidade.nome, etapa: "Caixa Físico", executar: () => caller.contas.sincronizarCaixaFisico({ unidadeId: unidade.id }) });
    tarefas.push({ unidadeNome: unidade.nome, etapa: "Mercado Pago (conta)", executar: () => caller.contas.sincronizarMercadoPago({ unidadeId: unidade.id, dataInicio: inicioMes, dataFim: hoje }) });
    tarefas.push({ unidadeNome: unidade.nome, etapa: "Mercado Pago (adquirente)", executar: () => caller.adquirentes.sincronizarMercadoPago({ unidadeId: unidade.id, dataInicio: inicioMes, dataFim: hoje }) });
    tarefas.push({ unidadeNome: unidade.nome, etapa: "Comanda consolidada", executar: () => caller.comandaRecepcao.sincronizar({ unidadeId: unidade.id, ano, mes }) });
    tarefas.push({ unidadeNome: unidade.nome, etapa: "Comanda itens", executar: () => caller.comandaRecepcao.sincronizarItens({ unidadeId: unidade.id, dataInicio: inicioMes, dataFim: hoje }) });
    tarefas.push({ unidadeNome: unidade.nome, etapa: "Contas bancárias → Drive", executar: () => caller.comandaRecepcao.sincronizarContasBancariasParaDrive({ unidadeId: unidade.id, dataInicio: inicioMes, dataFim: hoje }) });
  }
  return tarefas;
}

async function rodarTarefas(tarefas: TarefaSync[]): Promise<Array<{ tarefa: TarefaSync; erro: string | null }>> {
  const resultados: Array<{ tarefa: TarefaSync; erro: string | null }> = [];
  for (const tarefa of tarefas) {
    try {
      await tarefa.executar();
      resultados.push({ tarefa, erro: null });
    } catch (error) {
      resultados.push({ tarefa, erro: error instanceof Error ? error.message : String(error) });
    }
  }
  return resultados;
}

function fmtMoeda(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

export async function executarSincronizacaoDiariaComRelatorio(): Promise<{ ok: number; comErro: number }> {
  const caller = callerCron();
  const unidadesTodas = await getUnidades();
  const unidades = unidadesTodas.filter((u) => u.slug !== "buddha-mkt");
  const tarefas = montarTarefas(caller, unidades);

  let resultados = await rodarTarefas(tarefas);
  const falhasPrimeiraPassada = resultados.filter((r) => r.erro);
  if (falhasPrimeiraPassada.length > 0) {
    const retentativa = await rodarTarefas(falhasPrimeiraPassada.map((f) => f.tarefa));
    resultados = resultados.map((r) => (r.erro ? retentativa.find((rt) => rt.tarefa === r.tarefa) ?? r : r));
  }

  const falhasFinal = resultados.filter((r) => r.erro);
  const ontem = dataIsoBrt(-1);

  const blocosPorUnidade: string[] = [];
  for (const unidade of unidades) {
    const [resumo, saidas, conciliacao] = await Promise.all([
      resumoContasBancariasPorDia(unidade.id, ontem, ontem),
      totalSaidasNoPeriodo(unidade.id, ontem, ontem),
      calcularConciliacaoPorDia(unidade.id, ontem, ontem),
    ]);
    const valores = resumo.get(ontem);
    const entradas = (valores?.dinheiro ?? 0) + (valores?.cartaoDebito ?? 0) + (valores?.cartaoCredito ?? 0) + (valores?.pix ?? 0);
    const diaConciliacao = conciliacao.find((d) => d.data === ontem);
    const textoConciliacao = diaConciliacao?.texto;

    blocosPorUnidade.push(
      `🏢 *${unidade.nome}*\n` +
      `Entradas: ${fmtMoeda(entradas)} · Saídas: ${fmtMoeda(saidas)}\n` +
      (textoConciliacao ? `⚠️ Diferença a conciliar:\n${textoConciliacao}` : "✅ Sem diferença a conciliar"),
    );
  }

  const statusSync = falhasFinal.length === 0
    ? `✅ Sincronização completa, sem erros (${resultados.length} etapas).`
    : `⚠️ Sincronização com ${falhasFinal.length} etapa(s) ainda com erro após retomada automática:\n` +
      falhasFinal.map((f) => `· ${f.tarefa.unidadeNome} — ${f.tarefa.etapa}: ${f.erro}`).join("\n");

  const [aaaa, mm, dd] = ontem.split("-");
  const texto =
    `📊 *Relatório diário — ${dd}/${mm}/${aaaa}*\n\n` +
    `${statusSync}\n\n` +
    blocosPorUnidade.join("\n\n");

  if (ENV.telegramChatIdGuilherme) {
    await sendTelegramMessage(ENV.telegramChatIdGuilherme, texto);
  } else {
    console.error("[dailySyncReport] TELEGRAM_CHAT_ID_GUILHERME não configurado — relatório não enviado.");
  }

  return { ok: resultados.length - falhasFinal.length, comErro: falhasFinal.length };
}

export function registerDailySyncScheduledRoute(app: Express) {
  app.post("/api/scheduled/sincronizar-tudo-diario", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) {
        return res.status(403).json({ error: "cron-only" });
      }
      const resultado = await executarSincronizacaoDiariaComRelatorio();
      res.json({ success: true, ...resultado });
    } catch (error) {
      console.error("[dailySyncReport] Erro no cron diário:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "erro desconhecido" });
    }
  });
}
