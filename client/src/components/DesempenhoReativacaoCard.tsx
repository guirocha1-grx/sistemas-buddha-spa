import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Target, TrendingUp, Award } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

function fmtMoeda(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPercentual(fracao: number | null): string {
  return fracao === null ? "—" : `${(fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
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
          Evolução do mês — Reativação
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
          Desempenho mensal — Reativação
        </CardTitle>
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
                <p className="text-xs text-muted-foreground">Meta esperada até hoje</p>
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
              , precisamos de <strong className="text-foreground">~{Math.ceil(composicao.clientesPorDia)} cliente(s)/dia</strong> nos próximos {composicao.diasRestantesNoMes} dias
              {composicao.contatosNecessariosPorDia !== null ? (
                <> — na conversão atual, isso é <strong className="text-primary">~{Math.ceil(composicao.contatosNecessariosPorDia)} contatos por dia</strong>.</>
              ) : "."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AcoesConversaoReativacaoCard({ unidadeId }: { unidadeId: number }) {
  const progressoQuery = trpc.funilReativacao.progressoHoje.useQuery({ unidadeId });
  const conversaoQuery = trpc.funilReativacao.conversao.useQuery({ unidadeId });
  const hoje = progressoQuery.data?.hoje ?? 0;
  const conversao = conversaoQuery.data;
  const percentualConversao = conversao && conversao.contatados > 0 ? Math.round((conversao.convertidos / conversao.contatados) * 100) : null;

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Ações de conversão — Reativação
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-8">
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
      </CardContent>
    </Card>
  );
}
