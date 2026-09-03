import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, Target, RefreshCw } from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { toast } from "sonner";

const MESES_ABREV_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmtMesAno(mesAno: string) {
  const [ano, mes] = mesAno.split("-").map(Number);
  return `${MESES_ABREV_PT[mes - 1]}/${String(ano).slice(-2)}`;
}

export default function Financeiro() {
  const { unidadeSelecionada, unidades } = useUnidade();
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  const { data: vendas, isLoading: loadingVendas } = trpc.financeiro.vendas.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0, data_inicio: fmtDate(firstDay), data_fim: fmtDate(today) },
    { enabled: !!unidadeSelecionada }
  );

  const { data: recebimentos, isLoading: loadingRec } = trpc.financeiro.recebimentos.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0, data_inicio: fmtDate(firstDay), data_fim: fmtDate(today) },
    { enabled: !!unidadeSelecionada }
  );

  const { data: metas } = trpc.financeiro.metas.list.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0 },
    { enabled: !!unidadeSelecionada }
  );

  const utils = trpc.useUtils();
  const { data: resumoMensal, isLoading: loadingResumoMensal } = trpc.financeiro.resumoMensal.listar.useQuery();
  const sincronizarResumoMensalMutation = trpc.financeiro.resumoMensal.sincronizar.useMutation({
    onSuccess: (r) => {
      toast.success(`Resumo mensal sincronizado — ${r.totalGravados} mês(es)/unidade atualizados.`);
      utils.financeiro.resumoMensal.listar.invalidate();
    },
    onError: (err) => toast.error(`Erro ao sincronizar: ${err.message}`),
  });
  // Buddha Mkt é uma unidade sintética (só WhatsApp Marketing) — nunca
  // tem resumo mensal de faturamento, fora do comparativo (mesmo filtro
  // usado em GlobalSyncCenter/dashboardConsolidado).
  const unidadesFinanceiras = unidades.filter((u) => u.slug !== "buddha-mkt");
  const nomeUnidade = (unidadeId: number) => unidadesFinanceiras.find((u) => u.id === unidadeId)?.nome ?? `Unidade ${unidadeId}`;

  // Últimos 12 meses com algum dado, mais antigo primeiro (leitura de
  // gráfico da esquerda pra direita) — resumoMensal já vem mais recente
  // primeiro (ver db.ts: listResumoMensalUnidade).
  const mesesRecentes = Array.from(new Set((resumoMensal ?? []).map((r) => r.mesAno))).slice(0, 12).reverse();
  const chartResumoMensal = mesesRecentes.map((mesAno) => {
    const linha: Record<string, number | string> = { mesAno, label: fmtMesAno(mesAno) };
    let metaTotal = 0;
    let temMeta = false;
    for (const r of (resumoMensal ?? []).filter((r) => r.mesAno === mesAno)) {
      linha[nomeUnidade(r.unidadeId)] = Number(r.faturamentoTotal ?? 0);
      if (r.metaFaturamento !== null) { metaTotal += Number(r.metaFaturamento); temMeta = true; }
    }
    if (temMeta) linha["Meta (2 unidades)"] = metaTotal;
    return linha;
  });

  const fmtCurrency = (val: number) => val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const totalRecebimentos = recebimentos?.reduce((sum: number, r: any) => sum + (r.valor || 0), 0) ?? 0;
  const metaAtual = metas?.find((m: any) => m.mes === today.getMonth() + 1 && m.ano === today.getFullYear());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Financeiro
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            DRE, fluxo de caixa e metas — dados do Belle Software
          </p>
        </div>
        <UnidadeSelector />
      </div>

      <Tabs defaultValue="dre">
        <TabsList>
          <TabsTrigger value="dre">DRE Simplificado</TabsTrigger>
          <TabsTrigger value="fluxo">Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="metas">Metas</TabsTrigger>
          <TabsTrigger value="mes-a-mes">Visão mês a mês</TabsTrigger>
        </TabsList>

        {/* DRE */}
        <TabsContent value="dre" className="space-y-4">
          {loadingVendas ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                  DRE Simplificado — {today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                </CardTitle>
                <CardDescription>Receita e vendas do período</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-sm text-muted-foreground">Receita Bruta (Vendas)</span>
                  <span className="font-medium">{fmtCurrency(vendas?.valorTotal ?? 0)}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-sm text-muted-foreground">Total de Vendas</span>
                  <span className="font-medium">{vendas?.totalVendas ?? 0}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-sm text-muted-foreground">Ticket Médio</span>
                  <span className="font-medium">
                    {fmtCurrency((vendas?.valorTotal ?? 0) / Math.max(vendas?.totalVendas ?? 1, 1))}
                  </span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-sm text-muted-foreground">Recebimentos no Período</span>
                  <span className="font-medium">{fmtCurrency(totalRecebimentos)}</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-sm font-semibold">Saldo do Período</span>
                  <span className="font-bold">
                    {fmtCurrency((vendas?.valorTotal ?? 0) - totalRecebimentos)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Fluxo de Caixa */}
        <TabsContent value="fluxo" className="space-y-4">
          {loadingRec ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                  Fluxo de Caixa — {today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                </CardTitle>
                <CardDescription>Recebimentos do período</CardDescription>
              </CardHeader>
              <CardContent>
                {recebimentos && recebimentos.length > 0 ? (
                  <div className="space-y-2">
                    {recebimentos.map((r: any) => (
                      <div key={r.codigo} className="flex justify-between border-b border-border/30 pb-2">
                        <div>
                          <div className="text-sm font-medium">{r.descricao || "Recebimento"}</div>
                          <div className="text-xs text-muted-foreground">{r.data} — {r.formaPagamento}</div>
                        </div>
                        <span className="font-medium text-sm">{fmtCurrency(r.valor)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-3 font-semibold">
                      <span>Total Recebido</span>
                      <span>{fmtCurrency(totalRecebimentos)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum recebimento no período.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Metas */}
        <TabsContent value="metas" className="space-y-4">
          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                Metas — {today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </CardTitle>
              <CardDescription>
                {metaAtual ? "Meta definida para o mês atual" : "Nenhuma meta definida para este mês"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {metaAtual && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-border/50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Meta de Faturamento</span>
                    </div>
                    <div className="text-xl font-bold">{fmtCurrency(Number(metaAtual.valorFaturamento) || 0)}</div>
                    <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(100, ((vendas?.valorTotal ?? 0) / Math.max(Number(metaAtual.valorFaturamento) || 1, 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {fmtCurrency(vendas?.valorTotal ?? 0)} de {fmtCurrency(Number(metaAtual.valorFaturamento) || 0)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Meta de Recebimento</span>
                    </div>
                    <div className="text-xl font-bold">{fmtCurrency(Number(metaAtual.valorRecebimento) || 0)}</div>
                    <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(100, (totalRecebimentos / Math.max(Number(metaAtual.valorRecebimento) || 1, 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {fmtCurrency(totalRecebimentos)} de {fmtCurrency(Number(metaAtual.valorRecebimento) || 0)}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Visão mês a mês */}
        <TabsContent value="mes-a-mes" className="space-y-4">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle style={{ fontFamily: "'Cormorant Garamond', serif" }}>Visão mês a mês</CardTitle>
                <CardDescription>
                  Histórico mensal das duas unidades (planilha "Contabilidade SSU e RBS") — realizado x meta.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={sincronizarResumoMensalMutation.isPending}
                onClick={() => sincronizarResumoMensalMutation.mutate()}
              >
                {sincronizarResumoMensalMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-2" />
                )}
                Sincronizar
              </Button>
            </CardHeader>
            <CardContent>
              {loadingResumoMensal ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : chartResumoMensal.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum dado ainda — clica em "Sincronizar" pra importar o histórico da planilha.
                </p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={chartResumoMensal} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 70)" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="oklch(0.55 0.01 60)" />
                      <YAxis tick={{ fontSize: 12 }} stroke="oklch(0.55 0.01 60)" tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(value: number) => fmtCurrency(value)}
                        contentStyle={{
                          backgroundColor: "oklch(1 0 0)",
                          border: "1px solid oklch(0.91 0.005 70)",
                          borderRadius: "0.5rem",
                          fontSize: "12px",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px" }} />
                      {unidadesFinanceiras.map((u, i) => (
                        <Bar key={u.id} dataKey={u.nome} fill={i === 0 ? "oklch(0.50 0.12 30)" : "oklch(0.65 0.10 40)"} radius={[4, 4, 0, 0]} />
                      ))}
                      <Line type="monotone" dataKey="Meta (2 unidades)" stroke="oklch(0.35 0.02 60)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
                    </ComposedChart>
                  </ResponsiveContainer>

                  <div className="mt-6 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Mês</TableHead>
                          <TableHead>Unidade</TableHead>
                          <TableHead className="text-right">Faturamento</TableHead>
                          <TableHead className="text-right">Meta</TableHead>
                          <TableHead className="text-right">% Meta</TableHead>
                          <TableHead className="text-right">Atendimentos</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...(resumoMensal ?? [])]
                          .filter((r) => mesesRecentes.includes(r.mesAno))
                          .sort((a, b) => (a.mesAno === b.mesAno ? a.unidadeId - b.unidadeId : b.mesAno.localeCompare(a.mesAno)))
                          .map((r) => {
                            const faturamento = r.faturamentoTotal !== null ? Number(r.faturamentoTotal) : null;
                            const meta = r.metaFaturamento !== null ? Number(r.metaFaturamento) : null;
                            const pctMeta = faturamento !== null && meta ? (faturamento / meta) * 100 : null;
                            return (
                              <TableRow key={r.id}>
                                <TableCell className="font-mono text-xs">{fmtMesAno(r.mesAno)}</TableCell>
                                <TableCell className="text-sm">{nomeUnidade(r.unidadeId)}</TableCell>
                                <TableCell className="text-right text-sm">{faturamento !== null ? fmtCurrency(faturamento) : "—"}</TableCell>
                                <TableCell className="text-right text-sm text-muted-foreground">{meta !== null ? fmtCurrency(meta) : "—"}</TableCell>
                                <TableCell className={`text-right text-sm ${pctMeta !== null && pctMeta < 100 ? "text-destructive" : ""}`}>
                                  {pctMeta !== null ? `${pctMeta.toFixed(0)}%` : "—"}
                                </TableCell>
                                <TableCell className="text-right text-sm">{r.totalAtendimentos ?? "—"}</TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
