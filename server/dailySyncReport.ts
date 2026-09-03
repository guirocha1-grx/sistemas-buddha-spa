/**
 * Sincronização diária — inicia às 7h BRT (10h UTC) em etapas independentes,
 * chamadas pelo agendador em processo (server/_core/scheduler.ts). As etapas
 * continuam separadas (em vez de uma única chamada) porque já nasceram assim
 * pra caber no limite de 2 minutos por callback do antigo Heartbeat da Manus,
 * e não há necessidade de juntar tudo de novo agora — são independentes e
 * idempotentes.
 */
import type { Request, Response } from "express";
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

type AgendamentoDiario = {
  name: string;
  cron: string;
  path: string;
  method: "POST";
  description: string;
};

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

const ETAPAS = [
  { id: "inter", nome: "Banco Inter" },
  { id: "caixa", nome: "Caixa Físico" },
  { id: "mercadopago-conta", nome: "Mercado Pago (conta)" },
  { id: "mercadopago-adquirente", nome: "Mercado Pago (adquirente)" },
  { id: "comanda", nome: "Comanda consolidada" },
  { id: "comanda-itens", nome: "Comanda itens" },
  { id: "contas-drive", nome: "Contas bancárias → Drive" },
] as const;

type EtapaId = (typeof ETAPAS)[number]["id"];
type ChaveEtapa = `ssu-${EtapaId}` | `rbs-${EtapaId}`;

interface TarefaSync {
  chave: ChaveEtapa;
  unidadeNome: string;
  etapa: string;
  executar: () => Promise<unknown>;
}

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

/** BRT = UTC-3, sem depender do fuso do processo Node. */
function dataIsoBrt(offsetDias: number): string {
  const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;
  const agoraBrt = new Date(Date.now() + BRT_OFFSET_MS + offsetDias * 24 * 60 * 60 * 1000);
  return `${agoraBrt.getUTCFullYear()}-${String(agoraBrt.getUTCMonth() + 1).padStart(2, "0")}-${String(agoraBrt.getUTCDate()).padStart(2, "0")}`;
}

function chaveUnidade(slug: string): "ssu" | "rbs" | null {
  if (slug.includes("ribeirao") || slug.includes("rbs")) return "rbs";
  if (slug.includes("ssu") || slug.includes("santa")) return "ssu";
  return null;
}

function montarTarefas(unidades: Array<{ id: number; nome: string; slug: string }>): TarefaSync[] {
  const caller = callerCron();
  const inicioMes = dataIsoBrt(0).slice(0, 8) + "01";
  const hoje = dataIsoBrt(0);
  const [ano, mes] = hoje.split("-").map(Number);
  const tarefas: TarefaSync[] = [];

  for (const unidade of unidades) {
    const chave = chaveUnidade(unidade.slug);
    if (!chave) continue;
    const base = { unidadeId: unidade.id, dataInicio: inicioMes, dataFim: hoje };
    tarefas.push({ chave: `${chave}-inter`, unidadeNome: unidade.nome, etapa: "Banco Inter", executar: () => caller.inter.sincronizar(base) });
    tarefas.push({ chave: `${chave}-caixa`, unidadeNome: unidade.nome, etapa: "Caixa Físico", executar: () => caller.contas.sincronizarCaixaFisico({ unidadeId: unidade.id }) });
    tarefas.push({ chave: `${chave}-mercadopago-conta`, unidadeNome: unidade.nome, etapa: "Mercado Pago (conta)", executar: () => caller.contas.sincronizarMercadoPago(base) });
    tarefas.push({ chave: `${chave}-mercadopago-adquirente`, unidadeNome: unidade.nome, etapa: "Mercado Pago (adquirente)", executar: () => caller.adquirentes.sincronizarMercadoPago(base) });
    tarefas.push({ chave: `${chave}-comanda`, unidadeNome: unidade.nome, etapa: "Comanda consolidada", executar: () => caller.comandaRecepcao.sincronizar({ unidadeId: unidade.id, ano, mes }) });
    tarefas.push({ chave: `${chave}-comanda-itens`, unidadeNome: unidade.nome, etapa: "Comanda itens", executar: () => caller.comandaRecepcao.sincronizarItens(base) });
    tarefas.push({ chave: `${chave}-contas-drive`, unidadeNome: unidade.nome, etapa: "Contas bancárias → Drive", executar: () => caller.comandaRecepcao.sincronizarContasBancariasParaDrive(base) });
  }
  return tarefas;
}

async function montarTarefasAtualizadas(): Promise<TarefaSync[]> {
  const unidadesTodas = await getUnidades();
  const unidades = unidadesTodas
    .filter((u) => u.slug !== "buddha-mkt")
    .map((u) => ({ id: u.id, nome: u.nome, slug: u.slug }));

  return montarTarefas(unidades);
}

export async function executarEtapaSincronizacaoDiaria(chave: ChaveEtapa): Promise<{ unidade: string; etapa: string }> {
  const tarefa = (await montarTarefasAtualizadas()).find((item) => item.chave === chave);
  if (!tarefa) throw new Error(`Etapa diária não encontrada: ${chave}`);
  await tarefa.executar();
  return { unidade: tarefa.unidadeNome, etapa: tarefa.etapa };
}

function fmtMoeda(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

export async function enviarRelatorioDiario(): Promise<void> {
  const ontem = dataIsoBrt(-1);
  const unidades = (await getUnidades()).filter((u) => u.slug !== "buddha-mkt");
  const blocosPorUnidade: string[] = [];

  for (const unidade of unidades) {
    const [resumo, saidas, conciliacao] = await Promise.all([
      resumoContasBancariasPorDia(unidade.id, ontem, ontem),
      totalSaidasNoPeriodo(unidade.id, ontem, ontem),
      calcularConciliacaoPorDia(unidade.id, ontem, ontem),
    ]);
    const valores = resumo.get(ontem);
    const entradas = (valores?.dinheiro ?? 0) + (valores?.cartaoDebito ?? 0) + (valores?.cartaoCredito ?? 0) + (valores?.pix ?? 0);
    const textoConciliacao = conciliacao.find((d) => d.data === ontem)?.texto;
    blocosPorUnidade.push(
      `🏢 *${unidade.nome}*\n` +
      `Entradas: ${fmtMoeda(entradas)} · Saídas: ${fmtMoeda(saidas)}\n` +
      (textoConciliacao ? `⚠️ Diferença a conciliar:\n${textoConciliacao}` : "✅ Sem diferença a conciliar"),
    );
  }

  const [aaaa, mm, dd] = ontem.split("-");
  const texto = `📊 *Relatório diário — ${dd}/${mm}/${aaaa}*\n\n` +
    "✅ Etapas de sincronização diária concluídas.\n\n" +
    blocosPorUnidade.join("\n\n");

  if (!ENV.telegramChatIdGuilherme) {
    throw new Error("TELEGRAM_CHAT_ID_GUILHERME não configurado");
  }
  await sendTelegramMessage(ENV.telegramChatIdGuilherme, texto);
}

export const ETAPAS_AGENDADAS: Array<{ chave: ChaveEtapa; minuto: number }> = [
  { chave: "ssu-inter", minuto: 0 }, { chave: "ssu-caixa", minuto: 1 },
  { chave: "ssu-mercadopago-conta", minuto: 2 }, { chave: "ssu-mercadopago-adquirente", minuto: 3 },
  { chave: "ssu-comanda", minuto: 4 }, { chave: "ssu-comanda-itens", minuto: 5 },
  { chave: "ssu-contas-drive", minuto: 6 }, { chave: "rbs-inter", minuto: 7 },
  { chave: "rbs-caixa", minuto: 8 }, { chave: "rbs-mercadopago-conta", minuto: 9 },
  { chave: "rbs-mercadopago-adquirente", minuto: 10 }, { chave: "rbs-comanda", minuto: 11 },
  { chave: "rbs-comanda-itens", minuto: 12 }, { chave: "rbs-contas-drive", minuto: 13 },
];

/**
 * Reexecução ao meio-dia (12h BRT) de só 3 etapas por unidade — Caixa
 * Físico e Mercado Pago (conta + adquirente). Achado real (2026-09-03,
 * Conciliação PDV de Santa Úrsula): a sincronização das 7h roda cedo
 * demais em relação à fonte (planilha de Caixa Físico, liquidação MP),
 * que às vezes só fica pronta depois — o mês inteiro só era
 * reconciliado de fato quando alguém lembrava de clicar em
 * "Sincronizar" manualmente horas depois. Reusa a mesma
 * executarEtapaSincronizacaoDiaria (idempotente, mês inteiro de novo),
 * só numa hora mais tarde.
 */
export const ETAPAS_REEXECUCAO_MEIODIA = ETAPAS_AGENDADAS.filter(({ chave }) =>
  chave.endsWith("-caixa") || chave.endsWith("-mercadopago-conta") || chave.endsWith("-mercadopago-adquirente"));

export function listarHeartbeatsSincronizacaoDiaria(): AgendamentoDiario[] {
  const etapas = ETAPAS_AGENDADAS.map(({ chave, minuto }) => ({
    name: `cron-sync-diaria-${chave}`,
    cron: `0 ${minuto} 10 * * *`,
    path: `/api/scheduled/sincronizar-tudo-diario-${chave}`,
    method: "POST" as const,
    description: `Sincronização diária ${chave}, executada às 7h${String(minuto).padStart(2, "0")} BRT.`,
  }));
  return [
    ...etapas,
    {
      name: "cron-relatorio-sincronizacao-diaria",
      cron: "0 20 10 * * *",
      path: "/api/scheduled/relatorio-sincronizacao-diaria",
      method: "POST",
      description: "Envia ao Telegram o relatório após a janela diária de sincronização.",
    },
  ];
}

