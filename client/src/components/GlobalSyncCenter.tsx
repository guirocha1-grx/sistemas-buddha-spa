import { useUnidade } from "@/contexts/UnidadeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { globalSyncReducer, initialGlobalSyncState } from "@/lib/globalSyncController";
import { buildGlobalSyncPlan, getSyncProgress, getSyncSummary, type SyncStep, type SyncStatus } from "@/lib/globalSyncPlan";
import { runGlobalSyncQueue } from "@/lib/globalSyncRunner";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, ChevronDown, CircleAlert, Loader2, Maximize2, Minimize2, RefreshCw, X, XCircle } from "lucide-react";
import React, { useMemo, useReducer } from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Progress } from "./ui/progress";
import { ScrollArea } from "./ui/scroll-area";

function currentPeriod() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const fim = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return {
    // Mesmo período padrão da aba de Extratos: mês vigente até hoje.
    inicio: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`,
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
    background: { Icon: Loader2, className: "text-amber-600" },
    skipped: { Icon: CircleAlert, className: "text-amber-600" },
  }[status];
  return <config.Icon className={cn("h-4 w-4 shrink-0", config.className)} />;
}

export default function GlobalSyncCenter() {
  const { unidades, loading } = useUnidade();
  const { user } = useAuth();
  const { data: minhasPermissoes, isLoading: permissoesLoading } = trpc.permissoes.minhas.useQuery();
  const registrarRotinaDiaria = trpc.contas.registrarHeartbeatSincronizacaoDiaria.useMutation({
    onSuccess: () => toast.success("Rotina diária registrada — roda todo dia às 7h e manda o relatório pro Telegram"),
    onError: (e) => toast.error(e.message),
  });
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

  const startMercadoPagoInBackground = (step: SyncStep, period: ReturnType<typeof currentPeriod>) => {
    update(step.id, { status: "running", detail: "Iniciando relatório da Conta Corrente Mercado Pago…", error: undefined });
    void syncMpConta.mutateAsync({ unidadeId: step.unidadeId, dataInicio: period.inicio, dataFim: period.fim }).then(
      () => {
        update(step.id, { status: "success", detail: "Conta Corrente Mercado Pago atualizada" });
        void Promise.all([
          utils.financeiro.dashboard.invalidate(),
          utils.financeiro.dashboardConsolidado.invalidate(),
          utils.inter.extratos.invalidate(),
        ]);
      },
      (error) => update(step.id, { status: "error", detail: "Falha na Conta Corrente Mercado Pago", error: readableError(error) }),
    );
    update(step.id, { status: "background", detail: "Solicitação enviada ao Mercado Pago. O painel continuará sem aguardar o relatório." });
  };

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

  // Retorna as etapas que rodaram nesta passada (exceto Mercado Pago,
  // que dispara em segundo plano e só resolve depois — fica de fora
  // dessa lista de propósito). É lida direto, sem depender do estado
  // do reducer (que só reflete o resultado após o próximo render) —
  // por isso `start` consegue decidir se precisa de retomada
  // automática assim que `runSteps` termina, sem esperar um re-render.
  const runSteps = async (selectedSteps: SyncStep[]): Promise<SyncStep[]> => {
    const period = currentPeriod();
    const resultados: SyncStep[] = [];
    const runStep = async (step: SyncStep) => {
      if (step.status === "skipped") { resultados.push(step); return; }
      if (step.kind === "mercadoPagoConta") {
        startMercadoPagoInBackground(step, period);
        resultados.push({ ...step, status: "background" });
        return;
      }
      update(step.id, { status: "running", detail: `Sincronizando ${step.label.toLocaleLowerCase("pt-BR")}…`, error: undefined });
      try {
        const detail = await execute(step, period);
        update(step.id, { status: "success", detail });
        resultados.push({ ...step, status: "success", detail });
      } catch (error) {
        const detail = "Falha nesta etapa";
        const errorMsg = readableError(error);
        update(step.id, { status: "error", detail, error: errorMsg });
        resultados.push({ ...step, status: "error", detail, error: errorMsg });
      }
    };

    await runGlobalSyncQueue(selectedSteps, runStep);
    await Promise.all([
      utils.financeiro.dashboard.invalidate(), utils.financeiro.dashboardConsolidado.invalidate(), utils.inter.extratos.invalidate(),
      utils.adquirentes.vendas.invalidate(), utils.comandaRecepcao.resumo.invalidate(), utils.comandaRecepcao.itensDetalhe.invalidate(),
    ]);
    dispatch({ type: "complete" });
    return resultados;
  };

  const start = async () => {
    const plan = buildGlobalSyncPlan(unidades);
    dispatch({ type: "start", steps: plan });
    const resultados = await runSteps(plan);

    // Retomada automática, 1x só — se alguma etapa falhou nessa
    // primeira passada, tenta de novo sem precisar do clique manual em
    // "Sincronizar erros" (a pedido do usuário, 2026-08-17). Usa a
    // lista de `resultados` (não `steps` do componente, que ainda
    // reflete o render anterior a essas atualizações).
    const falhas = resultados.filter((step) => step.status === "error");
    if (falhas.length > 0) {
      dispatch({ type: "restartErrors" });
      await runSteps(falhas);
    }
  };

  const retryErrors = async () => {
    const failedSteps = steps.filter((step) => step.status === "error");
    if (failedSteps.length === 0) return;
    dispatch({ type: "restartErrors" });
    await runSteps(failedSteps);
  };

  const close = () => dispatch({ type: "close" });

  if (permissoesLoading || !podeSincronizar) return null;

  return <>
    {/* env(safe-area-inset-*) — sem isso o botão fica atrás da barra de
        gestos/rodapé do navegador em boa parte dos celulares (a barra
        "come" a faixa onde bottom-5/right-5 cairiam), sumindo na
        prática mesmo estando tecnicamente renderizado (2026-08-17). */}
    <div
      className="fixed z-40"
      style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))", right: "max(1.25rem, env(safe-area-inset-right))" }}
    >
      <Button onClick={() => isRunning ? dispatch({ type: "restore" }) : prepare()} disabled={loading || unidades.length === 0} className="h-10 rounded-xl px-4 text-sm font-semibold shadow-lg shadow-primary/20">
        <RefreshCw className={cn("mr-2 h-4 w-4", isRunning && "animate-spin")} />{isRunning ? "Sincronizando" : "Sincronizar tudo"}
      </Button>
    </div>

    <Dialog open={isOpen && !isMinimized} onOpenChange={(open) => open ? dispatch({ type: "restore" }) : close()}>
      <DialogContent className="flex h-[92dvh] max-h-[92dvh] max-w-5xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:h-[86vh] sm:max-h-[86vh] sm:max-w-5xl">
        <DialogHeader className="shrink-0 border-b bg-muted/35 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"><div className="min-w-0"><DialogTitle className="font-serif text-xl leading-tight tracking-tight sm:text-2xl">Sincronização em andamento</DialogTitle><DialogDescription className="mt-1.5 max-w-2xl text-sm sm:text-base">Acompanhe todas as fontes de dados por unidade. Você pode minimizar este painel e continuar trabalhando sem interromper o processo.</DialogDescription></div>
            <div className="flex shrink-0 items-center gap-2">
              {!isRunning && user?.role === "admin" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start text-xs text-muted-foreground"
                  onClick={() => registrarRotinaDiaria.mutate()}
                  disabled={registrarRotinaDiaria.isPending}
                  title="Roda essa mesma sincronização todo dia às 7h e manda um relatório pro Telegram"
                >
                  <span className="sm:hidden">Rotina diária (7h)</span><span className="hidden sm:inline">Ativar rotina diária (7h)</span>
                </Button>
              )}
              {isRunning && <Button variant="outline" size="sm" onClick={() => dispatch({ type: "minimize" })}><Minimize2 className="mr-1.5 h-3.5 w-3.5" />Minimizar</Button>}
            </div>
          </div>
          {steps.length > 0 && <div className="mt-5 space-y-2.5"><div className="flex justify-between text-xs font-medium"><span className="text-muted-foreground">Progresso geral</span><span>{progress}% concluído</span></div><Progress value={progress} className="h-2" />{isRunning && current && <p className="flex items-center gap-2 text-xs text-primary"><Loader2 className="h-3.5 w-3.5 animate-spin" />{current.unidadeNome} · {current.label}</p>}</div>}
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1 px-4 sm:max-h-[52vh] sm:px-6">
          {steps.length === 0 ? <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center"><div className="mb-4 rounded-2xl bg-primary/10 p-3 text-primary"><RefreshCw className="h-5 w-5" /></div><p className="text-base font-semibold">Pronto para sincronizar todas as unidades</p><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">O processo executará as integrações disponíveis de contas bancárias, Mercado Pago, adquirentes e dados da recepção no Google Drive.</p></div> : <div className="space-y-7 py-6">
              {units.map(([unidadeId, unidadeNome]) => { const unitSteps = steps.filter((item) => item.unidadeId === unidadeId); const categories = Array.from(new Set(unitSteps.map((item) => item.category))); return <section key={unidadeId} className="rounded-xl border bg-card p-4 shadow-sm"><div className="mb-4 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" /><h3 className="font-semibold">{unidadeNome}</h3></div><div className="flex items-center gap-3 text-xs text-muted-foreground"><span>{getSyncProgress(unitSteps)}% concluído</span><Progress value={getSyncProgress(unitSteps)} className="h-1.5 w-28" /></div></div><div className="space-y-5">{categories.map((category) => <div key={category}><p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{category}</p><div className="divide-y rounded-lg border">{unitSteps.filter((item) => item.category === category).map((item) => <div key={item.id} className="flex gap-3 px-3 py-3"><StepIcon status={item.status} /><div className="min-w-0 flex-1"><div className="flex flex-col justify-between gap-1 sm:flex-row"><span className="text-sm font-medium">{item.label}</span><span className={cn("text-xs font-medium", item.status === "success" && "text-emerald-700", item.status === "error" && "text-destructive", (item.status === "skipped" || item.status === "background") && "text-amber-700", item.status === "running" && "text-primary", item.status === "pending" && "text-muted-foreground")}>{item.status === "success" ? "Concluída" : item.status === "error" ? "Com erro" : item.status === "background" ? "Em processamento externo" : item.status === "skipped" ? "Não configurada" : item.status === "running" ? "Em andamento" : "Na fila"}</span></div><p className={cn("mt-1 text-xs leading-5", item.status === "error" ? "text-destructive" : "text-muted-foreground")}>{item.error ?? item.detail}</p></div></div>)}</div></div>)}</div></section>; })}
            {finished && <section className="rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="flex gap-3">{summary.error > 0 ? <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" /> : <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />}<div><h3 className="font-semibold">Sincronização finalizada</h3><p className="mt-1 text-sm text-muted-foreground">{summary.success} etapa(s) concluída(s) com sucesso, {summary.error} com erro, {summary.skipped} não configurada(s) e {summary.background} em processamento externo.</p></div></div></section>}
          </div>}
        </ScrollArea>
        <div className="sticky bottom-0 z-10 shrink-0 flex flex-col-reverse gap-3 border-t bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4"><p className="text-xs text-muted-foreground">{steps.length === 0 ? "Nenhuma operação foi iniciada." : finished ? "Os dados das telas serão atualizados automaticamente." : "Mercado Pago é iniciado em paralelo; os demais itens entram em cadência própria, sem aguardar o relatório."}</p><div className="flex flex-wrap gap-2">{finished && <Button variant="outline" onClick={close}><X className="mr-1.5 h-4 w-4" />Fechar</Button>}{!isRunning && !finished && <Button onClick={start} disabled={loading || unidades.length === 0} className="w-full sm:w-auto"><RefreshCw className="mr-1.5 h-4 w-4" />Iniciar sincronização</Button>}{finished && summary.error > 0 && <Button variant="outline" onClick={retryErrors}><RefreshCw className="mr-1.5 h-4 w-4" />Sincronizar erros</Button>}{finished && <Button onClick={start}><RefreshCw className="mr-1.5 h-4 w-4" />Sincronizar novamente</Button>}</div></div>
      </DialogContent>
    </Dialog>
    {isMinimized && <button onClick={() => dispatch({ type: "restore" })} className="fixed z-50 w-[min(23rem,calc(100vw-2.5rem))] rounded-2xl border bg-card p-3 text-left shadow-xl transition-transform duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" style={{ bottom: "max(1.25rem, env(safe-area-inset-bottom))", right: "max(1.25rem, env(safe-area-inset-right))" }} aria-label="Restaurar acompanhamento da sincronização"><div className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Loader2 className="h-4 w-4 animate-spin" /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-3 text-sm font-semibold"><span className="truncate">Sincronização em andamento</span><span className="text-primary">{progress}%</span></span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{current ? `${current.unidadeNome} · ${current.label}` : "Preparando próximas etapas"}</span></span><Maximize2 className="h-4 w-4 shrink-0 text-muted-foreground" /></div><Progress value={progress} className="mt-3 h-1.5" /></button>}
  </>;
}
