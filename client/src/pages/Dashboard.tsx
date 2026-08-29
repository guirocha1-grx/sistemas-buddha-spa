import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DollarSign, Calendar, Users, TrendingUp, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function Dashboard() {
  const { unidadeSelecionada, unidades } = useUnidade();

  const { data: dashboardData, isLoading } = trpc.financeiro.dashboard.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0 },
    { enabled: !!unidadeSelecionada }
  );

  const { data: kanbanData } = trpc.kanban.list.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0 },
    { enabled: !!unidadeSelecionada }
  );

  const { data: consolidado } = trpc.financeiro.dashboardConsolidado.useQuery();

  const fmtCurrency = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const chartData = (consolidado || []).map((u: any) => ({
    nome: u.nome?.replace("Shopping ", "") || `Unid ${u.unidadeId}`,
    Faturamento: u.faturamentoMes ?? 0,
    Recebimentos: u.recebimentosMes ?? 0,
  }));

  const totalFaturamento = (consolidado || []).reduce((sum: number, u: any) => sum + (u.faturamentoMes ?? 0), 0);
  const totalRecebimentos = (consolidado || []).reduce((sum: number, u: any) => sum + (u.recebimentosMes ?? 0), 0);
  const totalAgendamentosHoje = (consolidado || []).reduce((sum: number, u: any) => sum + (u.agendamentosHoje ?? 0), 0);
  const totalClientes = kanbanData?.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão consolidada das operações — Buddha Spa
          </p>
        </div>
        <UnidadeSelector />
      </div>

      {/* KPI Cards Consolidados */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Faturamento Total do Mês
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold">{fmtCurrency(totalFaturamento)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Soma das {unidades.length} unidades
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recebimentos Totais
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold">{fmtCurrency(totalRecebimentos)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total recebido no mês
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Agendamentos Hoje
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalAgendamentosHoje}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total nas {unidades.length} unidades
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clientes Ativos
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalClientes}</div>
                <div className="flex gap-3 mt-1">
                  <span className="text-xs text-orange-600">
                    {kanbanData?.quente?.length ?? 0} quentes
                  </span>
                  <span className="text-xs text-yellow-600">
                    {kanbanData?.morno?.length ?? 0} mornos
                  </span>
                  <span className="text-xs text-blue-600">
                    {kanbanData?.frio?.length ?? 0} frios
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Comparativo */}
      {chartData.length > 0 && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Comparativo de Faturamento por Unidade
            </CardTitle>
            <CardDescription>
              Faturamento e recebimentos do mês atual lado a lado
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 70)" />
                <XAxis dataKey="nome" tick={{ fontSize: 12 }} stroke="oklch(0.55 0.01 60)" />
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
                <Bar dataKey="Faturamento" fill="oklch(0.50 0.12 30)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Recebimentos" fill="oklch(0.65 0.10 40)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Comparativo Detalhado por Unidade */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Comparativo de Unidades
          </CardTitle>
          <CardDescription>
            Métricas detalhadas de cada unidade
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {(consolidado || unidades).map((unidade: any) => (
              <div
                key={unidade.unidadeId || unidade.id}
                className="rounded-lg border border-border/50 p-4 space-y-3"
                style={{
                  borderColor: unidade.corTema ? `${unidade.corTema}30` : undefined,
                }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: unidade.corTema || "#B8935A" }}
                  />
                  <span className="font-medium">{unidade.nome}</span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Faturamento:</span>
                    <span className="font-medium">{fmtCurrency(unidade.faturamentoMes ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Recebimentos:</span>
                    <span className="font-medium">{fmtCurrency(unidade.recebimentosMes ?? 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Vendas no mês:</span>
                    <span className="font-medium">{unidade.totalVendasMes ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Agendamentos hoje:</span>
                    <span className="font-medium">{unidade.agendamentosHoje ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total agendamentos:</span>
                    <span className="font-medium">{unidade.totalAgendamentos ?? 0}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
