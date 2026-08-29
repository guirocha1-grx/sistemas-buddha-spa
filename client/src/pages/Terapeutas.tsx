import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CalendarX2,
  Clock3,
  Check,
  HeartHandshake,
  Loader2,
  RefreshCw,
  Search,
  Timer,
  UsersRound,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type AbaTerapeutas = "fidelizacao" | "liberacoes" | "preferenciais" | "fechamento" | "tempos";

const ROTAS_ABAS: Record<AbaTerapeutas, string> = {
  fidelizacao: "/terapeutas/fidelizacao",
  liberacoes: "/terapeutas/liberacoes",
  preferenciais: "/terapeutas/preferenciais",
  fechamento: "/terapeutas/fechamento",
  tempos: "/terapeutas/tempos",
};

function dataLocalParaInput(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function periodoMesVigente(): { inicio: string; fim: string } {
  const hoje = new Date();
  return {
    inicio: dataLocalParaInput(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
    fim: dataLocalParaInput(hoje),
  };
}

function formatarPercentual(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return `${valor.toFixed(1).replace(".", ",")}%`;
}

function formatarMinutos(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return "—";
  const minutos = Math.max(0, Math.round(valor));
  const horas = Math.floor(minutos / 60);
  const restantes = minutos % 60;
  return horas ? `${horas}h ${String(restantes).padStart(2, "0")}min` : `${minutos} min`;
}

function formatarDataHora(valor: Date | string | null | undefined): string {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatarNumero(valor: number): string {
  return new Intl.NumberFormat("pt-BR").format(valor);
}

function rotuloClassificacao(classificacao: string): string {
  switch (classificacao) {
    case "abaixo_do_tempo": return "Abaixo do tempo";
    case "dentro_do_tempo": return "Dentro do tempo";
    case "acima_do_tempo": return "Acima do tempo";
    case "muito_acima_do_tempo": return "Muito acima";
    default: return "Sem referência";
  }
}

function abaPelaRota(location: string): AbaTerapeutas {
  if (location === ROTAS_ABAS.liberacoes) return "liberacoes";
  if (location === ROTAS_ABAS.preferenciais) return "preferenciais";
  if (location === ROTAS_ABAS.fechamento) return "fechamento";
  if (location === ROTAS_ABAS.tempos) return "tempos";
  return "fidelizacao";
}

function EstadoErro({ mensagem }: { mensagem: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{mensagem}</span>
    </div>
  );
}

function EstadoCarregando({ texto = "Carregando..." }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      {texto}
    </div>
  );
}

function Indicador({ titulo, valor, detalhe, icon: Icon }: {
  titulo: string;
  valor: string;
  detalhe?: string;
  icon: typeof UsersRound;
}) {
  return (
    <Card className="border-border/50 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{titulo}</p>
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{valor}</p>
        {detalhe && <p className="mt-1 text-xs text-muted-foreground">{detalhe}</p>}
      </CardContent>
    </Card>
  );
}

export default function Terapeutas() {
  const { unidadeSelecionada } = useUnidade();
  const [location, setLocation] = useLocation();
  const unidadeId = unidadeSelecionada?.id;
  const permissoesQuery = trpc.permissoes.minhas.useQuery();
  const periodoInicial = useMemo(periodoMesVigente, []);
  const [dataInicio, setDataInicio] = useState(periodoInicial.inicio);
  const [dataFim, setDataFim] = useState(periodoInicial.fim);
  const [buscaTerapia, setBuscaTerapia] = useState("");
  const [liberacaoPendente, setLiberacaoPendente] = useState<string | null>(null);

  const subsecoesLiberadas = useMemo(() => {
    if (!permissoesQuery.data?.restrito) return [] as AbaTerapeutas[];
    return (permissoesQuery.data.subsecoes ?? [])
      .filter((chave) => chave.startsWith("terapeutas:"))
      .map((chave) => chave.slice("terapeutas:".length))
      .filter((chave): chave is AbaTerapeutas => chave in ROTAS_ABAS);
  }, [permissoesQuery.data]);
  const primeiraAbaLiberada = subsecoesLiberadas[0] ?? "fidelizacao";
  const abaAtiva = location === "/terapeutas" && subsecoesLiberadas.length > 0
    ? primeiraAbaLiberada
    : abaPelaRota(location);
  const periodoValido = Boolean(dataInicio && dataFim && dataInicio <= dataFim);

  useEffect(() => {
    if (location === "/terapeutas" && subsecoesLiberadas.length > 0) {
      setLocation(ROTAS_ABAS[primeiraAbaLiberada]);
    }
  }, [location, primeiraAbaLiberada, setLocation, subsecoesLiberadas.length]);
  const fidelizacaoInput = useMemo(() => ({
    unidadeId: unidadeId ?? 0,
    dataInicio,
    dataFim,
  }), [unidadeId, dataInicio, dataFim]);
  const unidadeInput = useMemo(() => ({ unidadeId: unidadeId ?? 0 }), [unidadeId]);

  const fidelizacaoQuery = trpc.terapeutasFidelizacao.listar.useQuery(
    fidelizacaoInput,
    { enabled: Boolean(unidadeId && periodoValido && abaAtiva === "fidelizacao") },
  );
  const liberacoesQuery = trpc.terapeutasLiberacoes.listar.useQuery(
    unidadeInput,
    { enabled: Boolean(unidadeId && abaAtiva === "liberacoes") },
  );
  const preferenciaisQuery = trpc.terapeutasPreferenciais.listar.useQuery(
    fidelizacaoInput,
    { enabled: Boolean(unidadeId && periodoValido && abaAtiva === "preferenciais") },
  );
  const fechamentoAgendaQuery = trpc.terapeutasFechamento.listar.useQuery(
    fidelizacaoInput,
    { enabled: Boolean(unidadeId && periodoValido && abaAtiva === "fechamento") },
  );
  const temposQuery = trpc.terapeutasTempos.listar.useQuery(
    fidelizacaoInput,
    { enabled: Boolean(unidadeId && periodoValido && abaAtiva === "tempos") },
  );
  const servicosQuery = trpc.servicos.list.useQuery(
    unidadeInput,
    { enabled: Boolean(unidadeId && abaAtiva === "liberacoes") },
  );
  const utils = trpc.useUtils();

  const salvarLiberacaoMutation = trpc.terapeutasLiberacoes.salvar.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(variables.liberada ? "Terapia liberada para o terapeuta." : "Liberação removida.");
      utils.terapeutasLiberacoes.listar.invalidate(unidadeInput);
    },
    onError: (error) => toast.error(`Não foi possível salvar a liberação: ${error.message}`),
    onSettled: () => setLiberacaoPendente(null),
  });

  const fidelizacao = fidelizacaoQuery.data ?? [];
  const totalAtendimentos = fidelizacao.reduce((total, linha) => total + linha.totalAtendimentos, 0);
  const totalFidelizados = fidelizacao.reduce((total, linha) => total + linha.atendimentosFidelizados, 0);
  const totalNaoFidelizados = fidelizacao.reduce((total, linha) => total + linha.atendimentosNaoFidelizados, 0);
  const percentualFidelizacao = totalAtendimentos ? (totalFidelizados / totalAtendimentos) * 100 : null;
  const percentualNaoFidelizacao = totalAtendimentos ? (totalNaoFidelizados / totalAtendimentos) * 100 : null;

  const liberacoes = useMemo(
    () => new Set((liberacoesQuery.data?.liberacoes ?? []).map((item) => `${item.terapeutaId}:${item.servicoCodigo}`)),
    [liberacoesQuery.data?.liberacoes],
  );
  const servicos = useMemo(() => {
    const busca = buscaTerapia.trim().toLocaleLowerCase("pt-BR");
    return (servicosQuery.data ?? [])
      .filter((servico) => !busca || servico.nome.toLocaleLowerCase("pt-BR").includes(busca))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [servicosQuery.data, buscaTerapia]);

  function mudarAba(aba: string) {
    if (aba in ROTAS_ABAS) setLocation(ROTAS_ABAS[aba as AbaTerapeutas]);
  }

  function alternarLiberacao(terapeutaId: number, servicoCodigo: number, servicoNome: string, liberada: boolean) {
    if (!unidadeId) return;
    const chave = `${terapeutaId}:${servicoCodigo}`;
    setLiberacaoPendente(chave);
    salvarLiberacaoMutation.mutate({ unidadeId, terapeutaId, servicoCodigo, servicoNome, liberada });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Terapeutas
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe fidelização, terapias liberadas e a procura por cada profissional.
          </p>
        </div>
        <UnidadeSelector />
      </div>

      {!unidadeId ? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Selecione uma unidade para continuar.
        </div>
      ) : (
        <>
          {(abaAtiva === "fidelizacao" || abaAtiva === "preferenciais" || abaAtiva === "fechamento" || abaAtiva === "tempos") && (
            <Card className="mb-4 border-border/50 shadow-sm">
              <CardContent className="flex flex-wrap items-end gap-3 p-4">
                <div className="space-y-1">
                  <Label htmlFor="terapeutas-data-inicio" className="text-xs">Data início</Label>
                  <Input
                    id="terapeutas-data-inicio"
                    type="date"
                    value={dataInicio}
                    onChange={(event) => setDataInicio(event.target.value)}
                    className="h-9 w-40 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="terapeutas-data-fim" className="text-xs">Data fim</Label>
                  <Input
                    id="terapeutas-data-fim"
                    type="date"
                    value={dataFim}
                    onChange={(event) => setDataFim(event.target.value)}
                    className="h-9 w-40 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (abaAtiva === "preferenciais") void preferenciaisQuery.refetch();
                    else if (abaAtiva === "fechamento") void fechamentoAgendaQuery.refetch();
                    else if (abaAtiva === "tempos") void temposQuery.refetch();
                    else void fidelizacaoQuery.refetch();
                  }}
                  disabled={!periodoValido || fidelizacaoQuery.isFetching || preferenciaisQuery.isFetching || fechamentoAgendaQuery.isFetching || temposQuery.isFetching}
                >
                  {(fidelizacaoQuery.isFetching || preferenciaisQuery.isFetching || fechamentoAgendaQuery.isFetching || temposQuery.isFetching) ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                  Atualizar
                </Button>
                {!periodoValido && <p className="text-xs text-red-600">Informe um período válido.</p>}
              </CardContent>
            </Card>
          )}
          <Tabs value={abaAtiva} onValueChange={mudarAba} className="space-y-4">
          <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="fidelizacao" className="border border-border/60 bg-card data-[state=active]:border-primary/40 data-[state=active]:bg-primary/10">
              Fidelização
            </TabsTrigger>
            <TabsTrigger value="liberacoes" className="border border-border/60 bg-card data-[state=active]:border-primary/40 data-[state=active]:bg-primary/10">
              Liberações de terapia
            </TabsTrigger>
            <TabsTrigger value="preferenciais" className="border border-border/60 bg-card data-[state=active]:border-primary/40 data-[state=active]:bg-primary/10">
              Preferenciais
            </TabsTrigger>
            <TabsTrigger value="fechamento" className="border border-border/60 bg-card data-[state=active]:border-primary/40 data-[state=active]:bg-primary/10">
              Fechamento de agenda
            </TabsTrigger>
            <TabsTrigger value="tempos" className="border border-border/60 bg-card data-[state=active]:border-primary/40 data-[state=active]:bg-primary/10">
              Tempo de atendimento
            </TabsTrigger>
          </TabsList>

          <TabsContent value="fidelizacao" className="space-y-4">
            {fidelizacaoQuery.isError && <EstadoErro mensagem={`Não foi possível carregar a fidelização: ${fidelizacaoQuery.error.message}`} />}
            {fidelizacaoQuery.isLoading ? <EstadoCarregando texto="Calculando fidelização..." /> : !fidelizacaoQuery.isError && (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <Indicador titulo="Terapias realizadas" valor={formatarNumero(totalAtendimentos)} detalhe="Atendimentos concluídos no período" icon={HeartHandshake} />
                  <Indicador titulo="Atendimentos fidelizados" valor={formatarNumero(totalFidelizados)} detalhe={formatarPercentual(percentualFidelizacao)} icon={Check} />
                  <Indicador titulo="Atendimentos não fidelizados" valor={formatarNumero(totalNaoFidelizados)} detalhe={formatarPercentual(percentualNaoFidelizacao)} icon={UsersRound} />
                </div>

                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Fidelização por terapeuta</CardTitle>
                    <CardDescription>
                      Considera atendimentos com status Atendido no período. O indicador Fidelizado usa o campo de preferência do relatório Belle.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Terapeuta</TableHead>
                            <TableHead className="text-right">Total de atendimentos</TableHead>
                            <TableHead className="text-right">Fidelizados</TableHead>
                            <TableHead className="text-right">% fidelização</TableHead>
                            <TableHead className="text-right">Não fidelizados</TableHead>
                            <TableHead className="text-right">% não fidelização</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fidelizacao.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Nenhum terapeuta ativo cadastrado nesta unidade.</TableCell></TableRow>
                          ) : fidelizacao.map((linha) => (
                            <TableRow key={linha.terapeutaId}>
                              <TableCell className="font-medium">{linha.terapeutaNome}</TableCell>
                              <TableCell className="text-right">{formatarNumero(linha.totalAtendimentos)}</TableCell>
                              <TableCell className="text-right">{formatarNumero(linha.atendimentosFidelizados)}</TableCell>
                              <TableCell className="text-right font-medium text-emerald-700">{formatarPercentual(linha.percentualFidelizacao)}</TableCell>
                              <TableCell className="text-right">{formatarNumero(linha.atendimentosNaoFidelizados)}</TableCell>
                              <TableCell className="text-right text-muted-foreground">{formatarPercentual(linha.percentualNaoFidelizacao)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {totalAtendimentos === 0 && fidelizacao.length > 0 && (
                      <p className="border-t px-4 py-3 text-xs text-muted-foreground">Não há atendimentos concluídos no período selecionado.</p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="liberacoes" className="space-y-4">
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Liberações de terapia</CardTitle>
                <CardDescription>
                  Marque as terapias que cada terapeuta está liberado para realizar nesta unidade. O catálogo é consultado no Belle e as escolhas ficam salvas no CRM.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input value={buscaTerapia} onChange={(event) => setBuscaTerapia(event.target.value)} placeholder="Buscar terapia..." className="pl-9" />
                </div>
                {liberacoesQuery.isError && <EstadoErro mensagem={`Não foi possível carregar as liberações: ${liberacoesQuery.error.message}`} />}
                {servicosQuery.isError && <EstadoErro mensagem={`Não foi possível carregar as terapias do Belle: ${servicosQuery.error.message}`} />}
                {(liberacoesQuery.isLoading || servicosQuery.isLoading) ? <EstadoCarregando texto="Carregando terapeutas e terapias..." /> : !liberacoesQuery.isError && !servicosQuery.isError && (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="sticky left-0 min-w-52 bg-card">Terapeuta</TableHead>
                          {servicos.map((servico) => <TableHead key={servico.codigo} className="min-w-44 text-center align-bottom"><span className="line-clamp-2">{servico.nome}</span></TableHead>)}
                          {servicos.length === 0 && <TableHead className="text-center">Terapias</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(liberacoesQuery.data?.terapeutas ?? []).length === 0 ? (
                          <TableRow><TableCell colSpan={Math.max(servicos.length + 1, 2)} className="py-10 text-center text-sm text-muted-foreground">Nenhum terapeuta ativo cadastrado nesta unidade.</TableCell></TableRow>
                        ) : servicos.length === 0 ? (
                          <TableRow><TableCell colSpan={2} className="py-10 text-center text-sm text-muted-foreground">Nenhuma terapia encontrada para este filtro.</TableCell></TableRow>
                        ) : (liberacoesQuery.data?.terapeutas ?? []).map((terapeuta) => (
                          <TableRow key={terapeuta.id}>
                            <TableCell className="sticky left-0 bg-card font-medium">{terapeuta.nomeAbreviado || terapeuta.nomeCompleto}</TableCell>
                            {servicos.map((servico) => {
                              const chave = `${terapeuta.id}:${servico.codigo}`;
                              const checked = liberacoes.has(chave);
                              return (
                                <TableCell key={servico.codigo} className="text-center">
                                  <Checkbox
                                    checked={checked}
                                    disabled={liberacaoPendente === chave || salvarLiberacaoMutation.isPending}
                                    aria-label={`${checked ? "Remover" : "Liberar"} ${servico.nome} para ${terapeuta.nomeAbreviado || terapeuta.nomeCompleto}`}
                                    onCheckedChange={(valor) => alternarLiberacao(terapeuta.id, servico.codigo, servico.nome, valor === true)}
                                  />
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Cada alteração é salva individualmente. A liberação é específica da unidade selecionada.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fechamento" className="space-y-4">
            {fechamentoAgendaQuery.isError && <EstadoErro mensagem={`Não foi possível carregar o fechamento de agenda: ${fechamentoAgendaQuery.error.message}`} />}
            {fechamentoAgendaQuery.isLoading ? <EstadoCarregando texto="Calculando dias sem atendimento..." /> : !fechamentoAgendaQuery.isError && fechamentoAgendaQuery.data && (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <Indicador titulo="Fechamentos de profissionais" valor={formatarNumero(fechamentoAgendaQuery.data.totalFechamentos)} detalhe="Dias sem atendimento registrado" icon={CalendarX2} />
                  <Indicador
                    titulo="Dia com mais fechamentos"
                    valor={fechamentoAgendaQuery.data.resumoSemanal.reduce((maior, dia) => dia.fechamentosProfissionais > maior.fechamentosProfissionais ? dia : maior, fechamentoAgendaQuery.data.resumoSemanal[0]).nomeDia}
                    detalhe={`${formatarNumero(fechamentoAgendaQuery.data.resumoSemanal.reduce((maior, dia) => dia.fechamentosProfissionais > maior.fechamentosProfissionais ? dia : maior, fechamentoAgendaQuery.data.resumoSemanal[0]).fechamentosProfissionais)} ocorrências profissionais`}
                    icon={CalendarDays}
                  />
                  <Indicador
                    titulo="Dia de maior movimento"
                    valor={fechamentoAgendaQuery.data.resumoSemanal.reduce((maior, dia) => dia.atendimentos > maior.atendimentos ? dia : maior, fechamentoAgendaQuery.data.resumoSemanal[0]).nomeDia}
                    detalhe={`${formatarNumero(fechamentoAgendaQuery.data.resumoSemanal.reduce((maior, dia) => dia.atendimentos > maior.atendimentos ? dia : maior, fechamentoAgendaQuery.data.resumoSemanal[0]).atendimentos)} atendimentos realizados`}
                    icon={BarChart3}
                  />
                </div>

                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Dias sem atendimento por profissional</CardTitle>
                    <CardDescription>
                      Ranking dos profissionais com mais dias sem atendimento no período. As colunas mostram em qual dia da semana esses registros se concentram.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16 text-center">#</TableHead>
                            <TableHead>Terapeuta</TableHead>
                            <TableHead className="text-right">Dias sem atendimento</TableHead>
                            <TableHead className="text-right">Proporção do período</TableHead>
                            {fechamentoAgendaQuery.data.resumoSemanal.map((dia) => <TableHead key={dia.diaSemana} className="min-w-24 text-right">{dia.nomeDia.replace("-feira", "")}</TableHead>)}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {fechamentoAgendaQuery.data.terapeutas.length === 0 ? (
                            <TableRow><TableCell colSpan={4 + fechamentoAgendaQuery.data.resumoSemanal.length} className="py-10 text-center text-sm text-muted-foreground">Nenhum terapeuta ativo cadastrado nesta unidade.</TableCell></TableRow>
                          ) : fechamentoAgendaQuery.data.terapeutas.map((linha, index) => (
                            <TableRow key={linha.terapeutaId}>
                              <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                              <TableCell className="font-medium">{linha.terapeutaNome}</TableCell>
                              <TableCell className="text-right font-semibold">{formatarNumero(linha.diasSemAtendimento)}</TableCell>
                              <TableCell className="text-right">{formatarPercentual(linha.percentualDiasSemAtendimento)}</TableCell>
                              {fechamentoAgendaQuery.data.resumoSemanal.map((dia) => {
                                const contagem = linha.diasSemAtendimentoPorDiaSemana[String(dia.diaSemana)] ?? 0;
                                const percentual = dia.diasAnalisados ? (contagem / dia.diasAnalisados) * 100 : 0;
                                return (
                                  <TableCell key={dia.diaSemana} className="text-right">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="cursor-default underline decoration-dotted underline-offset-4">
                                          {formatarNumero(contagem)}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        {formatarNumero(contagem)} de {formatarNumero(dia.diasAnalisados)} {dia.nomeDia} sem atendimento — {formatarPercentual(percentual)}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="border-t px-4 py-3 text-xs text-muted-foreground">Este é um indicador gerencial derivado de dias sem atendimento registrado. Ele não confirma sozinho que a agenda foi oficialmente fechada, pois ausência de atendimento também pode ter outras causas.</p>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="tempos" className="space-y-4">
            {temposQuery.isError && <EstadoErro mensagem={`Não foi possível carregar os tempos de atendimento: ${temposQuery.error.message}`} />}
            {temposQuery.isLoading ? <EstadoCarregando texto="Calculando tempos de atendimento..." /> : !temposQuery.isError && temposQuery.data && (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <Indicador titulo="Chamados no período" valor={formatarNumero(temposQuery.data.totalChamados)} detalhe={`${formatarNumero(temposQuery.data.atendimentosComInicio)} com início registrado`} icon={Timer} />
                  <Indicador titulo="Espera média" valor={formatarMinutos(temposQuery.data.esperaMediaMinutos)} detalhe="Entre o chamado e o início" icon={Clock3} />
                  <Indicador titulo="Maior espera" valor={formatarMinutos(temposQuery.data.esperaMaximaMinutos)} detalhe="Maior tempo observado" icon={Clock3} />
                  <Indicador titulo="Muito acima do tempo" valor={formatarNumero(temposQuery.data.muitoAcimaDoTempo)} detalhe="Acima de 25% da referência Belle" icon={AlertTriangle} />
                </div>

                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Resumo por terapeuta</CardTitle>
                    <CardDescription>O resumo mostra a espera até o início e o desvio da duração realizada em relação à duração de referência do Belle.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Terapeuta</TableHead>
                            <TableHead className="text-right">Chamados</TableHead>
                            <TableHead className="text-right">Com início</TableHead>
                            <TableHead className="text-right">Com fim</TableHead>
                            <TableHead className="text-right">Espera média</TableHead>
                            <TableHead className="text-right">Duração média</TableHead>
                            <TableHead className="text-right">Abaixo</TableHead>
                            <TableHead className="text-right">Dentro</TableHead>
                            <TableHead className="text-right">Acima</TableHead>
                            <TableHead className="text-right">Muito acima</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {temposQuery.data.terapeutas.length === 0 ? (
                            <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">Nenhum chamado registrado no período selecionado.</TableCell></TableRow>
                          ) : temposQuery.data.terapeutas.map((linha) => (
                            <TableRow key={linha.terapeutaNome}>
                              <TableCell className="font-medium">{linha.terapeutaNome}</TableCell>
                              <TableCell className="text-right">{formatarNumero(linha.totalChamados)}</TableCell>
                              <TableCell className="text-right">{formatarNumero(linha.atendimentosComInicio)}</TableCell>
                              <TableCell className="text-right">{formatarNumero(linha.atendimentosComFim)}</TableCell>
                              <TableCell className="text-right">{formatarMinutos(linha.esperaMediaMinutos)}</TableCell>
                              <TableCell className="text-right">{formatarMinutos(linha.duracaoMediaMinutos)}</TableCell>
                              <TableCell className="text-right">{formatarNumero(linha.abaixoDoTempo)}</TableCell>
                              <TableCell className="text-right">{formatarNumero(linha.dentroDoTempo)}</TableCell>
                              <TableCell className="text-right">{formatarNumero(linha.acimaDoTempo)}</TableCell>
                              <TableCell className="text-right font-semibold text-red-700">{formatarNumero(linha.muitoAcimaDoTempo)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Detalhamento dos chamados</CardTitle>
                    <CardDescription>Os registros são ordenados pela maior espera. Início e fim permanecem pendentes quando ainda não há mensagem operacional pareada.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Terapeuta</TableHead>
                            <TableHead>Terapia</TableHead>
                            <TableHead>Chamado</TableHead>
                            <TableHead>Início</TableHead>
                            <TableHead>Fim</TableHead>
                            <TableHead className="text-right">Espera</TableHead>
                            <TableHead className="text-right">Duração</TableHead>
                            <TableHead>Classificação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {temposQuery.data.linhas.length === 0 ? (
                            <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">Nenhum chamado com registro de tempo no período.</TableCell></TableRow>
                          ) : temposQuery.data.linhas.map((linha) => (
                            <TableRow key={linha.atendimentoId}>
                              <TableCell className="whitespace-nowrap">{linha.dataAtendimento}</TableCell>
                              <TableCell className="max-w-48 truncate font-medium" title={linha.clienteNome}>{linha.clienteNome}</TableCell>
                              <TableCell className="whitespace-nowrap">{linha.terapeutaNome}</TableCell>
                              <TableCell className="max-w-48 truncate" title={linha.servicoNome ?? ""}>{linha.servicoNome || "—"}</TableCell>
                              <TableCell className="whitespace-nowrap text-xs">{formatarDataHora(linha.chamadoEm)}</TableCell>
                              <TableCell className="whitespace-nowrap text-xs">{formatarDataHora(linha.inicioEm)}</TableCell>
                              <TableCell className="whitespace-nowrap text-xs">{formatarDataHora(linha.fimEm)}</TableCell>
                              <TableCell className="text-right font-medium">{formatarMinutos(linha.esperaMinutos)}</TableCell>
                              <TableCell className="text-right">{formatarMinutos(linha.duracaoSalaMinutos)}</TableCell>
                              <TableCell><Badge variant={linha.classificacao === "muito_acima_do_tempo" ? "destructive" : linha.classificacao === "acima_do_tempo" ? "secondary" : "outline"}>{rotuloClassificacao(linha.classificacao)}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="border-t px-4 py-3 text-xs text-muted-foreground">A duração de referência vem do campo Tempo do atendimento Belle. A classificação considera abaixo de 90%, dentro de ±10%, acima de 10% e muito acima de 25% da referência. O início e o fim são eventos operacionais registrados no Grupo Geral.</p>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="preferenciais" className="space-y-4">
            {preferenciaisQuery.isError && <EstadoErro mensagem={`Não foi possível carregar os preferenciais: ${preferenciaisQuery.error.message}`} />}
            {preferenciaisQuery.isLoading ? <EstadoCarregando texto="Calculando clientes preferenciais..." /> : !preferenciaisQuery.isError && (
              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Clientes com terapeuta preferencial</CardTitle>
                      <CardDescription>
                        Contagem de clientes distintos com preferência atendidos no período selecionado. Passe o mouse sobre o número para ver o detalhamento.
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="shrink-0">{formatarNumero((preferenciaisQuery.data ?? []).reduce((total, linha) => total + linha.clientesPreferenciais, 0))} registros</Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-16 text-center">#</TableHead>
                          <TableHead>Terapeuta</TableHead>
                          <TableHead className="text-right">Clientes atendidos no período</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(preferenciaisQuery.data ?? []).length === 0 ? (
                          <TableRow><TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">Nenhum terapeuta ativo cadastrado nesta unidade.</TableCell></TableRow>
                        ) : (preferenciaisQuery.data ?? []).map((linha, index) => (
                          <TableRow key={linha.terapeutaId}>
                            <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                            <TableCell className="font-medium">{linha.terapeutaNome}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {linha.clientes.length > 0 ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      className="rounded px-2 py-1 text-primary underline decoration-dotted underline-offset-4 transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                      aria-label={`Ver clientes preferenciais de ${linha.terapeutaNome}`}
                                    >
                                      {formatarNumero(linha.clientesPreferenciais)}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
                                    <div className="border-b px-3 py-2">
                                      <p className="font-semibold">{linha.terapeutaNome}</p>
                                      <p className="text-xs text-muted-foreground">Clientes preferenciais atendidos no período</p>
                                    </div>
                                    <div className="max-h-72 overflow-y-auto px-3 py-2">
                                      {linha.clientes.map((cliente) => (
                                        <div key={`${cliente.clienteId ?? "nome"}-${cliente.clienteNome}`} className="flex items-center justify-between gap-3 border-b py-2 last:border-b-0">
                                          <span className="min-w-0 truncate text-sm">{cliente.clienteNome}</span>
                                          <span className="shrink-0 text-xs font-medium text-muted-foreground">
                                            {formatarNumero(cliente.atendimentos)} {cliente.atendimentos === 1 ? "atendimento" : "atendimentos"}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {preferenciaisQuery.data?.length ? <p className="border-t px-4 py-3 text-xs text-muted-foreground">O número representa clientes distintos atendidos com preferência no período. Passe o mouse sobre ele para ver a ordem por quantidade de atendimentos.</p> : null}
                </CardContent>
              </Card>
            )}
          </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
