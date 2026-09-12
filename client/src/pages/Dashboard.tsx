import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import {
  EvolucaoMensalReativacaoCard,
  ResumoMensalReativacaoCard,
  AcoesConversaoReativacaoCard,
} from "@/components/DesempenhoReativacaoCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, Calendar, Users, Wallet, Loader2 } from "lucide-react";
import { useState } from "react";

function dataLocalParaInput(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

type PeriodoRapido = "mes_atual" | "mes_anterior" | "livre";

function calcularPeriodo(periodo: PeriodoRapido): { inicio: string; fim: string } {
  const hoje = new Date();
  if (periodo === "mes_anterior") {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { inicio: dataLocalParaInput(inicio), fim: dataLocalParaInput(fim) };
  }
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  return { inicio: dataLocalParaInput(inicio), fim: dataLocalParaInput(hoje) };
}

const PERIODO_INICIAL = calcularPeriodo("mes_atual");

/**
 * Dashboard por unidade (reorganizado em 2026-09-12 a pedido do
 * usuário): seletor de período primeiro, depois a evolução do mês
 * (gráfico + quadro-resumo lado a lado), depois os números de HOJE
 * (independentes do período escolhido), depois as ações de conversão da
 * Reativação (dia e mês), e por fim um único número financeiro pro
 * período escolhido — o que de fato entrou nas contas (recebimentos),
 * não o faturado (que pode não ter sido recebido ainda).
 */
export default function Dashboard() {
  const { unidadeSelecionada } = useUnidade();

  const [dataInicio, setDataInicio] = useState(PERIODO_INICIAL.inicio);
  const [dataFim, setDataFim] = useState(PERIODO_INICIAL.fim);
  const [periodoAtivo, setPeriodoAtivo] = useState<PeriodoRapido>("mes_atual");

  const selecionarPeriodo = (periodo: PeriodoRapido) => {
    const range = calcularPeriodo(periodo);
    setDataInicio(range.inicio);
    setDataFim(range.fim);
    setPeriodoAtivo(periodo);
  };
  const periodoValido = Boolean(dataInicio && dataFim && dataInicio <= dataFim);
  const periodoEhMesAtual = periodoAtivo === "mes_atual";

  const { data: dashboardData, isLoading } = trpc.financeiro.dashboard.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0, dataInicio, dataFim },
    { enabled: !!unidadeSelecionada && periodoValido }
  );

  const { data: kanbanData } = trpc.kanban.list.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0 },
    { enabled: !!unidadeSelecionada }
  );

  const fmtCurrency = (val: number) =>
    val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const fmtDataBr = (iso: string) => {
    const [ano, mes, dia] = iso.split("-");
    return `${dia}/${mes}/${ano}`;
  };

  const totalRecebimentos = dashboardData?.recebimentosMes ?? 0;
  const faturamentoHoje = dashboardData?.faturamentoHoje ?? 0;
  const totalAgendamentosHoje = dashboardData?.agendamentosHoje ?? 0;
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
            {unidadeSelecionada ? `${unidadeSelecionada.nome} — Buddha Spa` : "Selecione uma unidade — Buddha Spa"}
          </p>
        </div>
        <UnidadeSelector />
      </div>

      {/* 1. Seletor de Período */}
      <Card className="border-border/50 shadow-sm">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Período</Label>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant={periodoAtivo === "mes_atual" ? "default" : "outline"} className="h-8 text-xs" onClick={() => selecionarPeriodo("mes_atual")}>
                Mês atual
              </Button>
              <Button size="sm" variant={periodoAtivo === "mes_anterior" ? "default" : "outline"} className="h-8 text-xs" onClick={() => selecionarPeriodo("mes_anterior")}>
                Mês anterior
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dashboard-data-inicio" className="text-xs text-muted-foreground">Data início</Label>
            <Input id="dashboard-data-inicio" type="date" value={dataInicio} className="h-8 w-40 text-sm"
              onChange={(e) => { setDataInicio(e.target.value); setPeriodoAtivo("livre"); }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dashboard-data-fim" className="text-xs text-muted-foreground">Data fim</Label>
            <Input id="dashboard-data-fim" type="date" value={dataFim} className="h-8 w-40 text-sm"
              onChange={(e) => { setDataFim(e.target.value); setPeriodoAtivo("livre"); }} />
          </div>
          {!periodoValido && <p className="text-xs text-red-600">Informe um período válido.</p>}
        </CardContent>
      </Card>

      {/* 2. Evolução do mês (gráfico) + quadro-resumo lado a lado — sempre
          a unidade selecionada, sempre mês atual, independente do
          período escolhido acima. */}
      {unidadeSelecionada && (
        <div className="grid gap-4 lg:grid-cols-2">
          <EvolucaoMensalReativacaoCard unidadeId={unidadeSelecionada.id} />
          <ResumoMensalReativacaoCard unidadeId={unidadeSelecionada.id} />
        </div>
      )}

      {/* 3. Hoje — sempre o dia de hoje, independente do período escolhido acima */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-2">Hoje</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Agendamentos Hoje</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{totalAgendamentosHoje}</div>
                  <p className="text-xs text-muted-foreground mt-1">{unidadeSelecionada?.nome ?? "Unidade"}</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Faturamento Hoje</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{fmtCurrency(faturamentoHoje)}</div>
                  <p className="text-xs text-muted-foreground mt-1">{unidadeSelecionada?.nome ?? "Unidade"}</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Clientes Ativos</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalClientes}</div>
              <div className="flex gap-3 mt-1">
                <span className="text-xs text-orange-600">{kanbanData?.quente?.length ?? 0} quentes</span>
                <span className="text-xs text-yellow-600">{kanbanData?.morno?.length ?? 0} mornos</span>
                <span className="text-xs text-blue-600">{kanbanData?.frio?.length ?? 0} frios</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 4. Ações de conversão — dia e mês */}
      {unidadeSelecionada && <AcoesConversaoReativacaoCard unidadeId={unidadeSelecionada.id} />}

      {/* 5. Um único número financeiro pro período escolhido — o que
          realmente entrou nas contas (recebimentos), não o faturado. */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {periodoEhMesAtual ? "Recebido no Mês" : "Recebido no Período"}
          </CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          ) : (
            <>
              <div className="text-2xl font-bold">{fmtCurrency(totalRecebimentos)}</div>
              <p className="text-xs text-muted-foreground mt-1">
                O que realmente entrou nas contas{!periodoEhMesAtual && ` · ${fmtDataBr(dataInicio)} a ${fmtDataBr(dataFim)}`}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
