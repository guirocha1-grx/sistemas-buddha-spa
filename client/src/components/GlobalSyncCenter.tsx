import { useUnidade } from "@/contexts/UnidadeContext";
import { globalSyncReducer, initialGlobalSyncState } from "@/lib/globalSyncController";
import { buildGlobalSyncPlan, getSyncProgress, getSyncSummary, type SyncStep, type SyncStatus } from "@/lib/globalSyncPlan";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, ChevronDown, CircleAlert, Loader2, Maximize2, Minimize2, RefreshCw, X, XCircle } from "lucide-react";
import React, { useMemo, useReducer } from "react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Progress } from "./ui/progress";
import { ScrollArea } from "./ui/scroll-area";

function currentPeriod() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const fim = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const inicioItens = new Date(now);
  inicioItens.setDate(now.getDate() - 6);
  return {
    inicio: `${inicioItens.getFullYear()}-${pad(inicioItens.getMonth() + 1)}-${pad(inicioItens.getDate())}`,
    fim,
    ano: now.getFullYear(),
    mes: now.getMonth() + 1,
  };
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir esta etapa. Revise a integração e tente novamente.";
}

function StepIcon({ status }: { status: SyncStatus }) {
  const config = {
    pending: { Icon: ChevronDown, className: "text-muted-foreground/60" },
    running: { Icon: Loader2, className: "text-primary animate-spin" },
    success: { Icon: CheckCircle2, className: "text-emerald-600" },
    error: { Icon: XCircle, className: "text-destructive" },
    skipped: { Icon: CircleAlert, className: "text-amber-600" },
  }[status];
  return <config.Icon className={cn("h-4 w-4 shrink-0", config.className)} />;
}

export default function GlobalSyncCenter() {
  const { unidades, loading } = useUnidade();
  const { data: minhasPermissoes, isLoading: permissoesLoading } = trpc.permissoes.minhas.useQuery();
  const [state, dispatch] = useReducer(globalSyncReducer, initialGlobalSyncState);
  const { isOpen, isMinimized, isRunning, steps } = state;
  const syncInter = trpc.inter.sincronizar.useMutation();
  const syncSicredi = trpc.sicredi.sincronizar.useMutation();
  const syncCaixa = trpc.contas.sincronizarCaixaFisico.useMutation();
  const syncMpConta = trpc.contas.sincronizarMercadoPago.useMutation();
  const syncMpVendas = trpc.adquirentes.sincronizarMercadoPago.useMutation();
  const syncComanda = trpc.comandaRecepcao.sincronizar.useMutation();
  const syncComandaItens = trpc.comandaRecepcao.sincronizarItens.useMutation();
  const syncDrive = trpc.comandaRecepcao.sincronizarContasBancariasParaDrive.useMutation();
  const utils = trpc.useUtils();
  const progress = getSyncProgress(steps);
  const summary = getSyncSummary(steps);
  const current = steps.find((item) => item.status === "running") ?? steps.find((item) => item.status === "pending");
  const finished = steps.length > 0 && !isRunning && !steps.some((item) => item.status === "pending" || item.status === "running");
  const units = useMemo(() => Array.from(new Map(steps.map((item) => [item.unidadeId, item.unidadeNome])).entries()), [steps]);
  const podeSincronizar = !minhasPermissoes?.restrito || minhasPermissoes.modulos.includes("sincronizacao");

  const prepare = () => {
    if (!loading && unidades.length > 0) dispatch({ type: "prepare", steps: buildGlobalSyncPlan(unidades) });
  };

  const update = (id: string, patch: Partial<SyncStep>) => dispatch({ type: "updateStep", id, patch });

  const execute = async (step: SyncStep, period: ReturnType<typeof currentPeriod>) => {
    if (step.kind === "inter") { await syncInter.mutateAsync({ unidadeId: step.unidadeId, dataInicio: period.inicio, dataFim: period.fim }); return "Extrato do Banco Inter atualizado"; }
    if (step.kind === "sicredi") { await syncSicredi.mutateAsync({ unidadeId: step.unidadeId, dataInicio: period.inicio, dataFim: period.fim }); return "Extrato do Sicredi atualizado"; }
    if (step.kind === "caixa") { await syncCaixa.mutateAsync({ unidadeId: step.unidadeId }); return "Lançamentos do caixa físico importados"; }
    if (step.kind === "mercadoPagoConta") { await syncMpConta.mutateAsync({ unidadeId: step.unidadeId, dataInicio: period.inicio, dataFim: period.fim }); return "Extrato da conta Mercado Pago atualizado"; }
    if (step.kind === "mercadoPagoAdquirentes") { await syncMpVendas.mutateAsync({ unidadeId: step.unidadeId, dataInicio: period.inicio, dataFim: period.fim }); return "Vendas aprovadas do Mercado Pago atualizadas"; }
    if (step.kind === "comandaConsolidado") { await syncComanda.mutateAsync({ unidadeId: step.unidadeId, ano: period.ano, mes: period.mes }); return "Comanda consolidada da recepção atualizada"; }
    if (step.kind === "comandaItens") { await syncComandaItens.mutateAsync({ unidadeId: step.unidadeId, dataInicio: period.inicio, dataFim: period.fim }); return "Itens recentes da comanda virtual atualizados"; }
    await syncDrive.mutateAsync({ unidadeId: step.unidadeId, dataInicio: period.inicio, dataFim: period.fim });
    return "Conciliação de contas enviada ao Drive";
  };

  const start = async () => {
    const plan = buildGlobalSyncPlan(unidades);
    dispatch({ type: "start", steps: plan });
    const period = currentPeriod();
    for (const step of plan) {
      if (step.status === "skipped") continue;
      update(step.id, { status: "running", detail: `Sincronizando ${step.label.toLocaleLowerCase("pt-BR")}…`, error: undefined });
      try {
        update(step.id, { status: "success", detail: await execute(step, period) });
      } catch (error) {
        update(step.id, { status: "error", detail: "Falha nesta etapa", error: readableError(error) });
      }
    }
    await Promise.all([
      utils.financeiro.dashboard.invalidate(), utils.financeiro.dashboardConsolidado.invalidate(), utils.inter.extratos.invalidate(),
      utils.adquirentes.vendas.invalidate(), utils.comandaRecepcao.resumo.invalidate(), utils.comandaRecepcao.itensDetalhe.invalidate(),
    ]);
    dispatch({ type: "complete" });
  };

  const close = () => dispatch({ type: "close" });

  if (permissoesLoading || !podeSincronizar) return null;

  return <>
    <div className="fixed right-4 top-4 z-40 md:right-6 md:top-5">
      <Button onClick={() => isRunning ? dispatch({ type: "restore" }) : prepare()} disabled={loading || unidades.length === 0} className="h-10 rounded-xl px-4 text-sm font-semibold shadow-lg shadow-primary/20">
        <RefreshCw className={cn("mr-2 h-4 w-4", isRunning && "animate-spin")} />{isRunning ? "Sincronizando" : "Sincronizar tudo"}
      </Button>
    </div>

    <Dialog open={isOpen && !isMinimized} onOpenChange={(open) => open ? dispatch({ type: "restore" }) : close()}>
      <DialogContent className="max-h-[86vh] max-w-5xl gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-5xl">
        <DialogHeader className="border-b bg-muted/35 px-6 py-5 pr-14">
          <div className="flex items-start justify-between gap-4"><div><DialogTitle className="font-serif text-2xl tracking-tight">Sincronização em andamento</DialogTitle><DialogDescription className="mt-1.5 max-w-2xl">Acompanhe todas as fontes de dados por unidade. Você pode minimizar este painel e continuar trabalhando sem interromper o processo.</DialogDescription></div>
            {isRunning && <Button variant="outline" size="sm" onClick={() => dispatch({ type: "minimize" })}><Minimize2 className="mr-1.5 h-3.5 w-3.5" />Minimizar</Button>}</div>
          {steps.length > 0 && <div className="mt-5 space-y-2.5"><div className="flex justify-between text-xs font-medium"><span className="text-muted-foreground">Progresso geral</span><span>{progress}% concluído</span></div><Progress value={progress} className="h-2" />{isRunning && current && <p className="flex items-center gap-2 text-xs text-primary"><Loader2 className="h-3.5 w-3.5 animate-spin" />{current.unidadeNome} · {current.label}</p>}</div>}
        </DialogHeader>
        <ScrollArea className="max-h-[52vh] px-6">
          {steps.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><div className="mb-4 rounded-2xl bg-primary/10 p-3 text-primary"><RefreshCw className="h-5 w-5" /></div><p className="text-base font-semibold">Pronto para sincronizar todas as unidades</p><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">O processo executará as integrações disponíveis de contas bancárias, Mercado Pago, adquirentes e dados da recepção no Google Drive.</p></div> : <div className="space-y-7 py-6">
            {units.map(([unidadeId, unidadeNome]) => { const unitSteps = steps.filter((item) => item.unidadeId === unidadeId); const categories = Array.from(new Set(unitSteps.map((item) => item.category))); return <section key={unidadeId} className="rounded-xl border bg-card p-4 shadow-sm"><div className="mb-4 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" /><h3 className="font-semibold">{unidadeNome}</h3></div><div className="flex items-center gap-3 text-xs text-muted-foreground"><span>{getSyncProgress(unitSteps)}% concluído</span><Progress value={getSyncProgress(unitSteps)} className="h-1.5 w-28" /></div></div><div className="space-y-5">{categories.map((category) => <div key={category}><p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{category}</p><div className="divide-y rounded-lg border">{unitSteps.filter((item) => item.category === category).map((item) => <div key={item.id} className="flex gap-3 px-3 py-3"><StepIcon status={item.status} /><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-1 sm:flex-row"><span className="text-sm font-medium">{item.label}</span><span className={cn("text-xs font-medium", item.status === "success" && "text-emerald-700", item.status === "error" && "text-destructive", item.status === "skipped" && "text-amber-700", item.status === "running" && "text-primary", item.status === "pending" && "text-muted-foreground")}>{item.status === "success" ? "Concluída" : item.status === "error" ? "Com erro" : item.status === "skipped" ? "Não configurada" : item.status === "running" ? "Em andamento" : "Na fila"}</span></div><p className={cn("mt-1 text-xs leading-5", item.status === "error" ? "text-destructive" : "text-muted-foreground")}>{item.error ?? item.detail}</p></div></div>)}</div></div>)}</div></section>; })}
            {finished && <section className="rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="flex gap-3">{summary.error > 0 ? <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />}<div><h3 className="font-semibold">Sincronização finalizada</h3><p className="mt-1 text-sm text-muted-foreground">{summary.success} etapa(s) concluída(s) com sucesso, {summary.error} com erro e {summary.skipped} não configurada(s).</p></div></div></section>}
          </div>}
        </ScrollArea>
        <div className="flex flex-col-reverse gap-3 border-t bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">{steps.length === 0 ? "Nenhuma operação foi iniciada." : finished ? "Os dados das telas serão atualizados automaticamente." : "As etapas são executadas uma a uma para preservar o limite das integraações."}</p><div className="flex gap-2">{finished && <Button variant="outline" onClick={close}><X className="mr-1.5 h-4 w-4" />Fechar</Button>}{!isRunning && !finished && <Button onClick={start} disabled={loading || unidades.length === 0}><RefreshCw className="mr-1.5 h-4 w-4" />Iniciar sincronização</Button>}{finished && <Button onClick={start}><RefreshCw className="mr-1.5 h-4 w-4" />Sincronizar novamente</Button>}</div></div>
      </DialogContent>
    </Dialog>
    {isMinimized && <button onClick={() => dispatch({ type: "restore" })} className="fixed bottom-5 right-5 z-50 w-[min(23rem,calc(100vw-2.5rem))] rounded-2xl border bg-card p-3 text-left shadow-xl transition-transform duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Restaurar acompanhamento da sincronização"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Loader2 className="h-4 w-4 animate-spin" /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-3 text-sm font-semibold"><span className="truncate">Sincronização em andamento</span><span className="text-primary">{progress}%</span></span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{current ? `${current.unidadeNome} · ${current.label}` : "Preparando próximas etapas"}</span></span><Maximize2 className="h-4 w-4 shrink-0 text-muted-foreground" /></div><Progress value={progress} className="mt-3 h-1.5" /></button>}
  </>;
}
