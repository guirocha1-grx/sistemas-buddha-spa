import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useUnidade } from "@/contexts/UnidadeContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, RefreshCw, TrendingUp, TrendingDown, Wallet, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

// ===== Helpers =====

function fmtCurrency(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function fmtDate(iso: string): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function toIso(date: Date): string {
  return date.toISOString().split("T")[0];
}

// ===== Componente principal =====

export default function BancoInter() {
  const { unidadeId } = useUnidade();

  // Período padrão: últimos 30 dias
  const hoje = new Date();
  const trintaDiasAtras = new Date(hoje);
  trintaDiasAtras.setDate(hoje.getDate() - 30);

  const [dataInicio, setDataInicio] = useState(toIso(trintaDiasAtras));
  const [dataFim, setDataFim] = useState(toIso(hoje));
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "D" | "C">("todos");

  // ===== Queries =====
  const statusQuery = trpc.inter.status.useQuery(
    { unidadeId: unidadeId! },
    { enabled: !!unidadeId },
  );

  const saldoQuery = trpc.inter.saldo.useQuery(
    { unidadeId: unidadeId! },
    {
      enabled: !!unidadeId && statusQuery.data?.configurado === true,
      retry: false,
    },
  );

  const extratosQuery = trpc.inter.extratos.useQuery(
    { unidadeId: unidadeId!, dataInicio, dataFim },
    { enabled: !!unidadeId },
  );

  // ===== Mutations =====
  const sincronizarMutation = trpc.inter.sincronizar.useMutation({
    onSuccess: (data) => {
      toast.success(
        `Sincronização concluída: ${data.totalInseridos} nova(s) transação(ões) importada(s).`,
      );
      extratosQuery.refetch();
      saldoQuery.refetch();
    },
    onError: (err) => {
      toast.error(`Erro na sincronização: ${err.message}`);
    },
  });

  // ===== Dados derivados =====
  const transacoes = extratosQuery.data ?? [];
  const transacoesFiltradas = filtroTipo === "todos"
    ? transacoes
    : transacoes.filter((t) => t.tipoOperacao === filtroTipo);

  const totalCreditos = transacoes
    .filter((t) => t.tipoOperacao === "C")
    .reduce((sum, t) => sum + parseFloat(t.valor ?? "0"), 0);

  const totalDebitos = transacoes
    .filter((t) => t.tipoOperacao === "D")
    .reduce((sum, t) => sum + parseFloat(t.valor ?? "0"), 0);

  const saldo = totalCreditos - totalDebitos;

  // ===== Render =====

  if (!unidadeId) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Selecione uma unidade para continuar.
      </div>
    );
  }

  if (statusQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!statusQuery.data?.configurado) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
        <h2
          className="text-xl font-semibold"
          style={{ fontFamily: "'Cormorant Garamond', serif" }}
        >
          Banco Inter não configurado
        </h2>
        <p className="text-sm text-muted-foreground">
          Acesse <strong>Configurações → Banco Inter</strong> e insira o{" "}
          <em>Client ID</em> e o <em>Client Secret</em> da sua aplicação no
          portal do Banco Inter para ativar a integração.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Banco Inter
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Extrato e movimentações da conta corrente
          </p>
        </div>
        <Badge
          className={
            statusQuery.data?.tokenValido
              ? "bg-green-100 text-green-700"
              : "bg-yellow-100 text-yellow-700"
          }
        >
          {statusQuery.data?.tokenValido ? (
            <>
              <CheckCircle className="h-3 w-3 mr-1" /> Autenticado
            </>
          ) : (
            "Token expirado"
          )}
        </Badge>
      </div>

      {/* Cards de resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Saldo disponível */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Wallet className="h-4 w-4" /> Saldo Disponível
            </CardDescription>
          </CardHeader>
          <CardContent>
            {saldoQuery.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : saldoQuery.data ? (
              <div className="text-2xl font-bold">
                {fmtCurrency(saldoQuery.data.disponivel)}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">—</span>
            )}
          </CardContent>
        </Card>

        {/* Total créditos no período */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-green-600" /> Entradas no Período
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">
              {fmtCurrency(totalCreditos)}
            </div>
          </CardContent>
        </Card>

        {/* Total débitos no período */}
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-red-500" /> Saídas no Período
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {fmtCurrency(totalDebitos)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros e sincronização */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle
            className="text-base"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Extrato
          </CardTitle>
          <CardDescription>
            Transações sincronizadas do Banco Inter
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Linha de filtros */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Data início</Label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-40 h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data fim</Label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-40 h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => extratosQuery.refetch()}
              disabled={extratosQuery.isFetching}
            >
              {extratosQuery.isFetching ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Atualizar
            </Button>
            <Button
              size="sm"
              onClick={() =>
                sincronizarMutation.mutate({ unidadeId: unidadeId!, dataInicio, dataFim })
              }
              disabled={sincronizarMutation.isPending}
            >
              {sincronizarMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Sincronizar com Inter
            </Button>
          </div>

          {/* Abas de filtro por tipo */}
          <Tabs
            value={filtroTipo}
            onValueChange={(v) => setFiltroTipo(v as "todos" | "D" | "C")}
          >
            <TabsList className="h-8">
              <TabsTrigger value="todos" className="text-xs h-7">
                Todos ({transacoes.length})
              </TabsTrigger>
              <TabsTrigger value="C" className="text-xs h-7">
                Entradas ({transacoes.filter((t) => t.tipoOperacao === "C").length})
              </TabsTrigger>
              <TabsTrigger value="D" className="text-xs h-7">
                Saídas ({transacoes.filter((t) => t.tipoOperacao === "D").length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={filtroTipo} className="mt-3">
              {extratosQuery.isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : transacoesFiltradas.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  {transacoes.length === 0
                    ? "Nenhuma transação sincronizada para este período. Clique em \"Sincronizar com Inter\" para importar."
                    : "Nenhuma transação encontrada com o filtro selecionado."}
                </div>
              ) : (
                <div className="rounded-md border border-border/50 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs w-24">Data</TableHead>
                        <TableHead className="text-xs">Descrição</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs">Origem / Destino</TableHead>
                        <TableHead className="text-xs text-right w-32">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transacoesFiltradas.map((t) => (
                        <TableRow key={t.id} className="text-sm">
                          <TableCell className="text-xs text-muted-foreground">
                            {fmtDate(t.dataEntrada)}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-sm leading-tight">
                              {t.titulo || t.tipoTransacao || "—"}
                            </div>
                            {t.descricao && (
                              <div className="text-xs text-muted-foreground truncate max-w-xs">
                                {t.descricao}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className="text-xs font-normal"
                            >
                              {t.tipoTransacao || "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {t.tipoOperacao === "C"
                              ? t.nomeOrigem || "—"
                              : t.nomeDestino || "—"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            <span
                              className={
                                t.tipoOperacao === "C"
                                  ? "text-green-700"
                                  : "text-red-600"
                              }
                            >
                              {t.tipoOperacao === "C" ? "+" : "-"}
                              {fmtCurrency(t.valor)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Totalizador do período filtrado */}
          {transacoesFiltradas.length > 0 && (
            <div className="flex justify-end gap-6 pt-2 border-t border-border/30 text-sm">
              <span className="text-muted-foreground">
                {transacoesFiltradas.length} transação(ões)
              </span>
              <span className="font-semibold">
                Saldo do período:{" "}
                <span className={saldo >= 0 ? "text-green-700" : "text-red-600"}>
                  {fmtCurrency(saldo)}
                </span>
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
