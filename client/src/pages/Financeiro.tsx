import { useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, TrendingUp, Target, RefreshCw } from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { toast } from "sonner";

const MESES_ABREV_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmtMesAno(mesAno: string) {
  const [ano, mes] = mesAno.split("-").map(Number);
  return `${MESES_ABREV_PT[mes - 1]}/${String(ano).slice(-2)}`;
}

/** Regressão linear simples (mínimos quadrados) — usada pra linha de tendência de cada ano. */
function regressaoLinear(pontos: { x: number; y: number }[]): { slope: number; intercept: number } | null {
  const n = pontos.length;
  if (n < 2) return null;
  const somaX = pontos.reduce((s, p) => s + p.x, 0);
  const somaY = pontos.reduce((s, p) => s + p.y, 0);
  const somaXY = pontos.reduce((s, p) => s + p.x * p.y, 0);
  const somaXX = pontos.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * somaXX - somaX * somaX;
  if (denom === 0) return null;
  const slope = (n * somaXY - somaX * somaY) / denom;
  const intercept = (somaY - slope * somaX) / n;
  return { slope, intercept };
}

export default function Financeiro() {
  const { unidadeSelecionada, unidades } = useUnidade();
  const [anosDesativados, setAnosDesativados] = useState<Set<string>>(new Set());
  const [mostrarTendencia, setMostrarTendencia] = useState(true);
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  const { data: vendas } = trpc.financeiro.vendas.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0, data_inicio: fmtDate(firstDay), data_fim: fmtDate(today) },
    { enabled: !!unidadeSelecionada }
  );

  const { data: recebimentos } = trpc.financeiro.recebimentos.useQuery(
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
  // Resumo mensal é sempre de 1 unidade por vez, igual o resto da tela
  // (seletor no topo) — "não faz sentido deixar junto" (2026-09-03): a
  // oscilação natural entre as duas unidades não é comparável mês a mês.
  const resumoUnidade = (resumoMensal ?? []).filter((r) => r.unidadeId === unidadeSelecionada?.id);
  const linhaPorMes = new Map(resumoUnidade.map((r) => [r.mesAno, r]));

  // Últimos 12 meses com algum dado, mais antigo primeiro (leitura de
  // gráfico da esquerda pra direita) — resumoMensal já vem mais recente
  // primeiro (ver db.ts: listResumoMensalUnidade).
  const mesesRecentes = Array.from(new Set(resumoUnidade.map((r) => r.mesAno))).slice(0, 12).reverse();

  // Composição do faturamento (de onde vem: caixa, voucher, parceria).
  const chartComposicao = mesesRecentes.map((mesAno) => {
    const r = linhaPorMes.get(mesAno);
    return {
      label: fmtMesAno(mesAno),
      Caixa: Number(r?.totalRecebidoCaixa ?? 0),
      Voucher: Number(r?.voucherSite ?? 0),
      Parceria: Number(r?.gympassTotalpass ?? 0),
    };
  });

  // Atendimentos, com/sem plano.
  const chartAtendimentos = mesesRecentes.map((mesAno) => {
    const r = linhaPorMes.get(mesAno);
    return {
      label: fmtMesAno(mesAno),
      "Com plano": r?.atendimentosComPlano ?? 0,
      "Sem plano": r?.atendimentosSemPlano ?? 0,
    };
  });

  // Comparativo ano a ano, mesmo mês (2026-09-03: a oscilação mês a mês
  // é grande o bastante pra tornar a análise horizontal pouco relevante
  // — o que importa é Jan/25 x Jan/26, não Jan/26 x Fev/26).
  const CORES_ANO = ["oklch(0.80 0.05 60)", "oklch(0.68 0.09 45)", "oklch(0.55 0.12 30)", "oklch(0.40 0.13 25)", "oklch(0.30 0.10 20)"];
  const anosDisponiveis = Array.from(new Set(resumoUnidade.map((r) => r.mesAno.slice(0, 4)))).sort();
  const anosVisiveis = anosDisponiveis.filter((a) => !anosDesativados.has(a));
  const corPorAno = new Map(anosDisponiveis.map((ano, i) => [ano, CORES_ANO[i % CORES_ANO.length]]));

  const pontosPorAno = new Map<string, { x: number; y: number }[]>();
  for (const ano of anosVisiveis) {
    const pontos: { x: number; y: number }[] = [];
    for (let idx = 0; idx < 12; idx++) {
      const r = linhaPorMes.get(`${ano}-${String(idx + 1).padStart(2, "0")}`);
      if (r?.faturamentoTotal !== null && r?.faturamentoTotal !== undefined) pontos.push({ x: idx, y: Number(r.faturamentoTotal) });
    }
    pontosPorAno.set(ano, pontos);
  }
  const tendenciaPorAno = new Map(anosVisiveis.map((ano) => [ano, regressaoLinear(pontosPorAno.get(ano) ?? [])]));

  const chartAnoAAno = MESES_ABREV_PT.map((label, idx) => {
    const mes = String(idx + 1).padStart(2, "0");
    const linha: Record<string, number | string> = { label };
    for (const ano of anosVisiveis) {
      const r = linhaPorMes.get(`${ano}-${mes}`);
      if (r?.faturamentoTotal !== null && r?.faturamentoTotal !== undefined) linha[ano] = Number(r.faturamentoTotal);
      const tendencia = tendenciaPorAno.get(ano);
      if (mostrarTendencia && tendencia) linha[`${ano}_tendencia`] = tendencia.slope * idx + tendencia.intercept;
    }
    return linha;
  });

  // Quando só sobram 2 anos visíveis (via checkbox), mostra a variação %
  // entre eles — comparando só os meses que os dois têm em comum, senão
  // um ano com menos meses fechados puxaria a média pra baixo à toa.
  let variacaoAnos: { anoBase: string; anoComparado: string; pct: number } | null = null;
  if (anosVisiveis.length === 2) {
    const [anoBase, anoComparado] = anosVisiveis;
    const mesesComuns = Array.from({ length: 12 }, (_, idx) => idx)
      .filter((idx) => linhaPorMes.get(`${anoBase}-${String(idx + 1).padStart(2, "0")}`)?.faturamentoTotal != null
        && linhaPorMes.get(`${anoComparado}-${String(idx + 1).padStart(2, "0")}`)?.faturamentoTotal != null);
    if (mesesComuns.length > 0) {
      const somaBase = mesesComuns.reduce((s, idx) => s + Number(linhaPorMes.get(`${anoBase}-${String(idx + 1).padStart(2, "0")}`)!.faturamentoTotal), 0);
      const somaComparado = mesesComuns.reduce((s, idx) => s + Number(linhaPorMes.get(`${anoComparado}-${String(idx + 1).padStart(2, "0")}`)!.faturamentoTotal), 0);
      if (somaBase > 0) variacaoAnos = { anoBase, anoComparado, pct: ((somaComparado - somaBase) / somaBase) * 100 };
    }
  }

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
            Visão mês a mês e metas por unidade
          </p>
        </div>
        <UnidadeSelector />
      </div>

      <Tabs defaultValue="mes-a-mes">
        <TabsList>
          <TabsTrigger value="mes-a-mes">Visão mês a mês</TabsTrigger>
          <TabsTrigger value="metas">Metas</TabsTrigger>
        </TabsList>


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
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {unidadeSelecionada?.nome ?? "Selecione uma unidade"} — planilha "Contabilidade SSU e RBS"
            </p>
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
          </div>

          {loadingResumoMensal ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : resumoUnidade.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              Nenhum dado ainda pra essa unidade — clica em "Sincronizar" pra importar o histórico da planilha.
            </p>
          ) : (
            <>
              {/* Comparativo ano a ano — a oscilação mês a mês é grande demais
                  pra a leitura horizontal (mês anterior x mês seguinte) ser
                  relevante; o que importa é o mesmo mês em anos diferentes. */}
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                      Comparativo ano a ano
                    </CardTitle>
                    <CardDescription>Faturamento total por mês, um ano contra o outro — mesma época, anos diferentes.</CardDescription>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    {variacaoAnos && (
                      <Badge variant="secondary" className={variacaoAnos.pct >= 0 ? "text-emerald-700" : "text-destructive"}>
                        {variacaoAnos.pct >= 0 ? "+" : ""}{variacaoAnos.pct.toFixed(1)}% {variacaoAnos.anoComparado} vs {variacaoAnos.anoBase}
                      </Badge>
                    )}
                    <div className="flex items-center gap-3 flex-wrap">
                      {anosDisponiveis.map((ano) => (
                        <label key={ano} className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                          <Checkbox
                            checked={!anosDesativados.has(ano)}
                            onCheckedChange={(checked) => {
                              setAnosDesativados((atual) => {
                                const novo = new Set(atual);
                                if (checked) novo.delete(ano); else novo.add(ano);
                                return novo;
                              });
                            }}
                          />
                          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: corPorAno.get(ano) }} />
                          {ano}
                        </label>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={chartAnoAAno} margin={{ top: 10, right: 30, left: 30, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 70)" />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="oklch(0.55 0.01 60)" />
                      <YAxis tick={{ fontSize: 12 }} stroke="oklch(0.55 0.01 60)" tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(value: number, name: string) => [fmtCurrency(value), name.endsWith("_tendencia") ? `${name.replace("_tendencia", "")} (tendência)` : name]}
                        contentStyle={{ backgroundColor: "oklch(1 0 0)", border: "1px solid oklch(0.91 0.005 70)", borderRadius: "0.5rem", fontSize: "12px" }}
                      />
                      {anosVisiveis.map((ano) => (
                        <Line
                          key={ano}
                          type="monotone"
                          dataKey={ano}
                          name={ano}
                          stroke={corPorAno.get(ano)}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                          label={(props: any) => {
                            const primeiroPontoReal = chartAnoAAno.findIndex((l) => l[ano] !== undefined);
                            if (props.index !== primeiroPontoReal) return null;
                            return (
                              <text key={`${ano}-label`} x={props.x - 6} y={props.y} textAnchor="end" dominantBaseline="middle" fontSize={11} fontWeight={600} fill={corPorAno.get(ano)}>
                                {ano}
                              </text>
                            );
                          }}
                        />
                      ))}
                      {mostrarTendencia && anosVisiveis.map((ano) => (
                        <Line
                          key={`${ano}_tendencia`}
                          type="linear"
                          dataKey={`${ano}_tendencia`}
                          name={`${ano}_tendencia`}
                          stroke={corPorAno.get(ano)}
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          strokeOpacity={0.6}
                          dot={false}
                          legendType="none"
                          connectNulls
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                  <div className="mt-3 flex justify-center">
                    <Button size="sm" variant={mostrarTendencia ? "secondary" : "outline"} onClick={() => setMostrarTendencia((v) => !v)}>
                      <TrendingUp className="h-3.5 w-3.5 mr-2" />
                      Linha de tendência {mostrarTendencia ? "ativada" : "desativada"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* Composição do faturamento */}
                <Card className="border-border/50 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                      Composição do faturamento
                    </CardTitle>
                    <CardDescription>De onde vem o total: caixa, voucher e parceria (Gympass/Totalpass).</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={chartComposicao} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 70)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="oklch(0.55 0.01 60)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="oklch(0.55 0.01 60)" tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                        <Tooltip
                          formatter={(value: number) => fmtCurrency(value)}
                          contentStyle={{ backgroundColor: "oklch(1 0 0)", border: "1px solid oklch(0.91 0.005 70)", borderRadius: "0.5rem", fontSize: "12px" }}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <Bar dataKey="Caixa" stackId="fat" fill="oklch(0.50 0.12 30)" />
                        <Bar dataKey="Voucher" stackId="fat" fill="oklch(0.68 0.10 45)" />
                        <Bar dataKey="Parceria" stackId="fat" fill="oklch(0.82 0.06 60)" radius={[4, 4, 0, 0]} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Atendimentos */}
                <Card className="border-border/50 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                      Atendimentos
                    </CardTitle>
                    <CardDescription>Com plano x sem plano, por mês.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={chartAtendimentos} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 70)" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="oklch(0.55 0.01 60)" />
                        <YAxis tick={{ fontSize: 11 }} stroke="oklch(0.55 0.01 60)" allowDecimals={false} />
                        <Tooltip contentStyle={{ backgroundColor: "oklch(1 0 0)", border: "1px solid oklch(0.91 0.005 70)", borderRadius: "0.5rem", fontSize: "12px" }} />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <Bar dataKey="Com plano" stackId="atend" fill="oklch(0.50 0.12 30)" />
                        <Bar dataKey="Sem plano" stackId="atend" fill="oklch(0.75 0.08 50)" radius={[4, 4, 0, 0]} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* Detalhe mensal */}
              <Card className="border-border/50 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Detalhe mensal</CardTitle>
                  <CardDescription>Realizado x meta, mês a mês.</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mês</TableHead>
                        <TableHead className="text-right">Faturamento</TableHead>
                        <TableHead className="text-right">Meta</TableHead>
                        <TableHead className="text-right">% Meta</TableHead>
                        <TableHead className="text-right">Atendimentos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...resumoUnidade]
                        .filter((r) => mesesRecentes.includes(r.mesAno))
                        .sort((a, b) => b.mesAno.localeCompare(a.mesAno))
                        .map((r) => {
                          const faturamento = r.faturamentoTotal !== null ? Number(r.faturamentoTotal) : null;
                          const meta = r.metaFaturamento !== null ? Number(r.metaFaturamento) : null;
                          const pctMeta = faturamento !== null && meta ? (faturamento / meta) * 100 : null;
                          return (
                            <TableRow key={r.id}>
                              <TableCell className="font-mono text-xs">{fmtMesAno(r.mesAno)}</TableCell>
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
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
