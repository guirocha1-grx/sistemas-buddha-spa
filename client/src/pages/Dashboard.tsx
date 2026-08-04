import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DollarSign, Calendar, Users, TrendingUp, Loader2, Sparkles } from "lucide-react";

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

  const fmtCurrency = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visão consolidada das operações
          </p>
        </div>
        <UnidadeSelector />
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Faturamento do Mês
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {fmtCurrency(dashboardData?.faturamentoMes ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {dashboardData?.totalVendasMes ?? 0} vendas no período
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recebimentos
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {fmtCurrency(dashboardData?.recebimentosMes ?? 0)}
                </div>
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
                <div className="text-2xl font-bold">
                  {dashboardData?.agendamentosHoje ?? 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {dashboardData?.totalAgendamentos ?? 0} total no período
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
                <div className="text-2xl font-bold">
                  {kanbanData?.total ?? 0}
                </div>
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

      {/* Comparativo entre unidades */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Comparativo de Unidades
          </CardTitle>
          <CardDescription>
            Visão geral das duas unidades do Buddha Spa
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {unidades.map((unidade) => (
              <div
                key={unidade.id}
                className="rounded-lg border border-border/50 p-4 space-y-2"
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
                <div className="text-sm text-muted-foreground">
                  Código Belle: {unidade.codEstab}
                </div>
                {unidadeSelecionada?.id === unidade.id && dashboardData && (
                  <div className="space-y-1 mt-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Faturamento:</span>
                      <span className="font-medium">{fmtCurrency(dashboardData.faturamentoMes)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Recebimentos:</span>
                      <span className="font-medium">{fmtCurrency(dashboardData.recebimentosMes)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Agendamentos hoje:</span>
                      <span className="font-medium">{dashboardData.agendamentosHoje}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Aviso de integração */}
      {!unidadeSelecionada && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-amber-600" />
              <div>
                <p className="text-sm font-medium text-amber-900">
                  Configure o token do Belle Software
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  Acesse Configurações para inserir o token de integração de cada unidade.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
