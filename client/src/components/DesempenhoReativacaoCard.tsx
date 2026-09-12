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
 * Desempenho mensal da reativação (2026-09-12) — movido do Funil de
 * Reativação pro Dashboard a pedido do usuário, sempre pela unidade
 * selecionada (números muito diferentes entre RBS e SSU pra fazer
 * sentido consolidado). Meta e conversão são sempre da recepção como
 * equipe, nunca por atendente — é comum uma pessoa iniciar o
 * atendimento e outra terminar. O bloco "Acumulado / Meta esperada até
 * hoje / Atingimento / Premiação" espelha o mesmo painel que a unidade
 * já usa na planilha "Informe de vendas" (confirmado por print real).
 */
export function DesempenhoReativacaoCard({ unidadeId }: { unidadeId: number }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const utils = trpc.useUtils();
  const progressoQuery = trpc.funilReativacao.progressoHoje.useQuery({ unidadeId });
  const conversaoQuery = trpc.funilReativacao.conversao.useQuery({ unidadeId });
  const composicaoQuery = trpc.funilReativacao.composicaoMeta.useQuery({ unidadeId });
  const evolucaoQuery = trpc.funilReativacao.evolucaoDiaria.useQuery({ unidadeId });
  const [editando, setEditando] = useState<"meta" | "ticket" | null>(null);
  const [valorInput, setValorInput] = useState("");

  const invalidarComposicao = () => {
    utils.funilReativacao.composicaoMeta.invalidate({ unidadeId });
    utils.funilReativacao.evolucaoDiaria.invalidate({ unidadeId });
  };
  const definirMetaMutation = trpc.funilReativacao.definirMetaMensal.useMutation({
    onSuccess: () => { setEditando(null); invalidarComposicao(); toast.success("Meta do mês atualizada."); },
    onError: (e) => toast.error(e.message),
  });
  const definirTicketMutation = trpc.funilReativacao.definirTicketMedio.useMutation({
    onSuccess: () => { setEditando(null); invalidarComposicao(); toast.success("Ticket médio atualizado."); },
    onError: (e) => toast.error(e.message),
  });

  function salvarEdicao() {
    const numero = Number(valorInput);
    if (!Number.isFinite(numero) || numero <= 0) return;
    if (editando === "meta") definirMetaMutation.mutate({ unidadeId, valorFaturamento: numero });
    else if (editando === "ticket") definirTicketMutation.mutate({ unidadeId, valor: numero });
  }

  const hoje = progressoQuery.data?.hoje ?? 0;
  const conversao = conversaoQuery.data;
  const percentualConversao = conversao && conversao.contatados > 0 ? Math.round((conversao.convertidos / conversao.contatados) * 100) : null;
  const composicao = composicaoQuery.data;
  const evolucao = evolucaoQuery.data ?? [];

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Reativação — desempenho da recepção
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3 min-w-[160px]">
            <Target className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Contatos hoje (recepção)</p>
              <p className="text-lg font-semibold tabular-nums">{hoje}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TrendingUp className="h-5 w-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Conversão (30 dias)</p>
              <p className="text-sm font-medium tabular-nums">
                {percentualConversao !== null ? `${percentualConversao}% (${conversao!.convertidos} de ${conversao!.contatados})` : "—"}
              </p>
            </div>
          </div>
          {composicao && composicao.metaFaturamento > 0 && (
            <div className="flex items-center gap-3">
              <Award className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Premiação (se fechar hoje)</p>
                <p className="text-sm font-medium">{composicao.premiacao}</p>
              </div>
            </div>
          )}
        </div>

        {composicao && (
          composicao.metaFaturamento === 0 ? (
            <div className="pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Sem meta de faturamento do mês cadastrada — defina aqui ou em Financeiro &gt; Visão Geral &gt; Metas (é a mesma) pra liberar o painel completo.
              </p>
              {isAdmin && (
                editando === "meta" ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <Input type="number" className="h-8 w-28 text-xs" placeholder="R$ meta" value={valorInput} onChange={(e) => setValorInput(e.target.value)} autoFocus />
                    <Button size="sm" className="h-8" disabled={!valorInput.trim() || definirMetaMutation.isPending} onClick={salvarEdicao}>Salvar</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditando(null)}>Cancelar</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={() => { setValorInput(""); setEditando("meta"); }}>
                    Definir meta do mês
                  </Button>
                )
              )}
            </div>
          ) : (
            <div className="pt-3 border-t border-border/50 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
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
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Obj. final do mês</p>
                    <p className="font-medium tabular-nums">{fmtMoeda(composicao.metaFaturamento)}</p>
                  </div>
                  {isAdmin && (
                    editando === "meta" ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <Input type="number" className="h-7 w-20 text-xs" placeholder="R$" value={valorInput} onChange={(e) => setValorInput(e.target.value)} autoFocus />
                        <Button size="sm" className="h-7 px-2 text-xs" disabled={!valorInput.trim() || definirMetaMutation.isPending} onClick={salvarEdicao}>OK</Button>
                      </div>
                    ) : (
                      <button type="button" className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground shrink-0" onClick={() => { setValorInput(String(composicao.metaFaturamento)); setEditando("meta"); }}>
                        editar
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Total de atendimentos</p>
                  <p className="font-medium tabular-nums">{composicao.totalAtendimentos}</p>
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
                <div>
                  <p className="text-xs text-muted-foreground">Planos vendidos</p>
                  <p className="font-medium tabular-nums">{composicao.planosVendidos}</p>
                </div>
              </div>

              {evolucao.length > 0 && (
                <ResponsiveContainer width="100%" height={240}>
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
                    <Line type="monotone" dataKey="acumulado" name="Realizado" stroke="#2563eb" dot={false} strokeWidth={2.5} />
                  </LineChart>
                </ResponsiveContainer>
              )}

              <p className="text-sm text-muted-foreground">
                Com ticket médio de {fmtMoeda(composicao.ticketMedio)}
                {isAdmin && (
                  editando === "ticket" ? (
                    <span className="inline-flex items-center gap-1.5 ml-1.5 align-middle">
                      <Input type="number" className="h-6 w-20 text-xs" value={valorInput} onChange={(e) => setValorInput(e.target.value)} autoFocus />
                      <Button size="sm" className="h-6 text-xs px-2" disabled={!valorInput.trim() || definirTicketMutation.isPending} onClick={salvarEdicao}>Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditando(null)}>Cancelar</Button>
                    </span>
                  ) : (
                    <button type="button" className="ml-1.5 underline decoration-dotted underline-offset-2 hover:text-foreground" onClick={() => { setValorInput(String(composicao.ticketMedio)); setEditando("ticket"); }}>
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
          )
        )}
      </CardContent>
    </Card>
  );
}
