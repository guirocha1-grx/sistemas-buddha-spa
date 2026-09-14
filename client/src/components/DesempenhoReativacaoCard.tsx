import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Target, TrendingUp, Award, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

function fmtMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPercentual(fracao: number | null): string {
  return fracao === null ? "—" : `${(fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/**
 * Rótulo "Atualização DD/MM HHh" (2026-09-13) — mostra a hora REAL da
 * última sincronização (Comanda/Caixa/Mercado Pago), não mais um
 * checkpoint chutado por relógio: achado real (SSU, 12/09) em que o
 * rótulo dizia "20h" mas o dado só tinha vindo da sincronização das 7h
 * da manhã, porque a sincronização automática de Comanda só rodava uma
 * vez por dia. Sem isso não dá pra saber se o número é de agora ou de
 * horas atrás.
 */
function fmtUltimaSincronizacao(data: Date | null): string {
  if (!data) return "sem sincronização registrada ainda";
  // Defesa extra: se por algum motivo chegar algo que não é uma Date
  // válida (viu-se um caso real de string crua escapando da tipagem do
  // servidor), formatToParts() estoura RangeError em vez de só não
  // mostrar a data — nunca deixar isso derrubar a tela inteira.
  const instante = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(instante.getTime())) return "sem sincronização registrada ainda";
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(instante);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${valor("day")}/${valor("month")} ${valor("hour")}h${valor("minute")}`;
}

/**
 * Desempenho mensal da reativação (2026-09-12, reorganizado em
 * 2026-09-12) — dividido em 3 cards a pedido do usuário pra caber na
 * nova ordem do Dashboard (gráfico e quadro-resumo lado a lado, ações de
 * conversão numa seção própria). Sempre pela unidade selecionada
 * (números muito diferentes entre RBS e SSU pra fazer sentido
 * consolidado). Meta e conversão são sempre da recepção como equipe,
 * nunca por atendente — é comum uma pessoa iniciar o atendimento e
 * outra terminar.
 */

export function EvolucaoMensalReativacaoCard({ unidadeId }: { unidadeId: number }) {
  const evolucaoQuery = trpc.funilReativacao.evolucaoDiaria.useQuery({ unidadeId });
  const composicaoQuery = trpc.funilReativacao.composicaoMeta.useQuery({ unidadeId });
  const evolucao = evolucaoQuery.data ?? [];
  const composicao = composicaoQuery.data;
  const projecaoFechamento = [...evolucao].reverse().find((p) => p.tendencia !== null)?.tendencia ?? null;

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Evolução do faturamento
        </CardTitle>
      </CardHeader>
      <CardContent>
        {evolucao.length === 0 ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={evolucao} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 70)" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} stroke="oklch(0.55 0.01 60)" />
                <YAxis tick={{ fontSize: 11 }} stroke="oklch(0.55 0.01 60)" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value: number) => fmtMoeda(value)}
                  labelFormatter={(dia) => `Dia ${dia}`}
                  contentStyle={{ backgroundColor: "oklch(1 0 0)", border: "1px solid oklch(0.91 0.005 70)", borderRadius: "0.5rem", fontSize: "12px" }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Line type="monotone" dataKey="metaEsperada" name="Meta" stroke="#eab308" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="superMeta" name="SuperMeta" stroke="#dc2626" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="acumuladoGrafico" name="Realizado" stroke="#2563eb" dot={false} strokeWidth={2.5} connectNulls={false} />
                <Line type="monotone" dataKey="tendencia" name="Tendência" stroke="#16a34a" strokeDasharray="5 5" dot={false} strokeWidth={2} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
            {projecaoFechamento !== null && (
              <p className="text-sm text-muted-foreground mt-3">
                No ritmo dos últimos dias, a unidade fecha o mês em <strong className="text-foreground">~{fmtMoeda(projecaoFechamento)}</strong>
                {composicao && composicao.metaFaturamento > 0 && (
                  <> — {fmtPercentual(projecaoFechamento / composicao.metaFaturamento)} da meta.</>
                )}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function ResumoMensalReativacaoCard({ unidadeId }: { unidadeId: number }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const composicaoQuery = trpc.funilReativacao.composicaoMeta.useQuery({ unidadeId });
  const composicao = composicaoQuery.data;

  const sincronizarAgoraMutation = trpc.funilReativacao.sincronizarAgora.useMutation({
    onSuccess: () => {
      utils.funilReativacao.composicaoMeta.invalidate({ unidadeId });
      utils.funilReativacao.evolucaoDiaria.invalidate({ unidadeId });
      utils.financeiro.dashboard.invalidate();
      toast.success("Sincronização concluída.");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Desempenho mensal
          </CardTitle>
          <p className="text-xs text-muted-foreground/70">
            Atualização {composicao ? fmtUltimaSincronizacao(composicao.ultimaSincronizacao) : "…"}
          </p>
        </div>
        {isAdmin && (
          <Button
            size="sm" variant="outline" className="h-7 shrink-0 gap-1.5 text-xs"
            disabled={sincronizarAgoraMutation.isPending}
            onClick={() => sincronizarAgoraMutation.mutate({ unidadeId })}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", sincronizarAgoraMutation.isPending && "animate-spin")} />
            {sincronizarAgoraMutation.isPending ? "Sincronizando…" : "Sincronizar agora"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {!composicao ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : composicao.metaFaturamento === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sem meta de faturamento do mês pra essa unidade — cadastre na aba "Metas" da planilha "Contabilidade SSU e RBS" e sincronize (mesmo lugar que já alimenta Financeiro &gt; Visão Geral) pra liberar o painel completo.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Acumulado do mês</p>
                <p className="font-medium tabular-nums">{fmtMoeda(composicao.faturamentoAtual)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Meta proporcional até hoje</p>
                <p className="font-medium tabular-nums">{fmtMoeda(composicao.metaEsperadaAteHoje)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Atingimento da meta</p>
                <p className="font-medium tabular-nums">{fmtPercentual(composicao.atingimentoMeta)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Obj. final do mês</p>
                <p className="font-medium tabular-nums">{fmtMoeda(composicao.metaFaturamento)}</p>
              </div>
              <div className="col-span-2 flex items-center gap-2 pt-1">
                <Award className="h-4 w-4 text-amber-600 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Premiação (se fechar hoje)</p>
                  <p className="font-medium">{composicao.premiacao}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm pt-3 border-t border-border/50">
              <div>
                <p className="text-xs text-muted-foreground">Total de atendimentos</p>
                <p className="font-medium tabular-nums">{composicao.totalAtendimentos}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Planos vendidos</p>
                <p className="font-medium tabular-nums">{composicao.planosVendidos}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Atend. com plano</p>
                <p className="font-medium tabular-nums">
                  {composicao.atendComPlano}
                  {composicao.totalAtendimentos > 0 && <span className="text-muted-foreground text-xs"> ({Math.round((composicao.atendComPlano / composicao.totalAtendimentos) * 100)}%)</span>}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Atend. sem plano</p>
                <p className="font-medium tabular-nums">
                  {composicao.atendSemPlano}
                  {composicao.totalAtendimentos > 0 && <span className="text-muted-foreground text-xs"> ({Math.round((composicao.atendSemPlano / composicao.totalAtendimentos) * 100)}%)</span>}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AcoesConversaoReativacaoCard({ unidadeId }: { unidadeId: number }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const progressoQuery = trpc.funilReativacao.progressoHoje.useQuery({ unidadeId });
  const conversaoQuery = trpc.funilReativacao.conversao.useQuery({ unidadeId });
  const composicaoQuery = trpc.funilReativacao.composicaoMeta.useQuery({ unidadeId });
  const hoje = progressoQuery.data?.hoje ?? 0;
  const conversao = conversaoQuery.data;
  const composicao = composicaoQuery.data;
  const percentualConversao = conversao && conversao.contatados > 0 ? Math.round((conversao.convertidos / conversao.contatados) * 100) : null;
  const [editandoTicket, setEditandoTicket] = useState(false);
  const [valorInput, setValorInput] = useState("");

  const definirTicketMutation = trpc.funilReativacao.definirTicketMedio.useMutation({
    onSuccess: () => {
      setEditandoTicket(false);
      utils.funilReativacao.composicaoMeta.invalidate({ unidadeId });
      toast.success("Ticket médio atualizado.");
    },
    onError: (e) => toast.error(e.message),
  });

  function salvarTicket() {
    const numero = Number(valorInput);
    if (!Number.isFinite(numero) || numero <= 0) return;
    definirTicketMutation.mutate({ unidadeId, valor: numero });
  }

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Ações de conversão — Reativação
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-8">
          <div className="flex items-center gap-3">
            <Target className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Contatos hoje (dia)</p>
              <p className="text-lg font-semibold tabular-nums">{hoje}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Conversão (mês — 30 dias)</p>
              <p className="text-sm font-medium tabular-nums">
                {percentualConversao !== null ? `${percentualConversao}% (${conversao!.convertidos} de ${conversao!.contatados})` : "—"}
              </p>
            </div>
          </div>
        </div>

        {composicao && composicao.metaFaturamento > 0 && (
          <p className="text-sm text-muted-foreground pt-3 border-t border-border/50">
            Com ticket médio de {fmtMoeda(composicao.ticketMedio)}
            {isAdmin && (
              editandoTicket ? (
                <span className="inline-flex items-center gap-1.5 ml-1.5 align-middle">
                  <Input type="number" className="h-6 w-20 text-xs" value={valorInput} onChange={(e) => setValorInput(e.target.value)} autoFocus />
                  <Button size="sm" className="h-6 text-xs px-2" disabled={!valorInput.trim() || definirTicketMutation.isPending} onClick={salvarTicket}>Salvar</Button>
                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditandoTicket(false)}>Cancelar</Button>
                </span>
              ) : (
                <button type="button" className="ml-1.5 underline decoration-dotted underline-offset-2 hover:text-foreground" onClick={() => { setValorInput(String(composicao.ticketMedio)); setEditandoTicket(true); }}>
                  (editar)
                </button>
              )
            )}
            , precisamos de <strong className="text-foreground">{composicao.clientesAdicionaisNecessarios} cliente(s) adicionais de reativação</strong> para voltar no valor da meta proporcional ao dia do mês
            {composicao.contatosAdicionaisNecessarios !== null ? (
              <> — na conversão atual, isso é <strong className="text-primary">~{composicao.contatosAdicionaisNecessarios} contatos</strong>.</>
            ) : "."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
