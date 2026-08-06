import { useState, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default function CaixaFisico() {
  const { user } = useAuth();
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  // Query de dados
  const { data, isLoading, refetch } = trpc.caixaFisico.listar.useQuery({
    unidadeId: 1, // será substituído pelo contexto de unidade
    dataInicio: dataInicio || undefined,
    dataFim: dataFim || undefined,
  });

  // Mutation de sincronização
  const sincronizarMutation = trpc.caixaFisico.sincronizar.useMutation({
    onSuccess: (res) => {
      toast.success(`Caixa Físico sincronizado! ${res.totalLidos} lançamentos lidos, ${res.totalInseridos} novos.`);
      refetch();
    },
    onError: (err) => {
      toast.error(`Erro na sincronização: ${err.message}`);
    },
  });

  // Calcular totais
  const totais = useMemo(() => {
    if (!data) return { entradas: 0, saidas: 0, saldo: 0 };
    let entradas = 0, saidas = 0;
    for (const l of data) {
      const valor = parseFloat(String(l.valor));
      if (l.tipoOperacao === "C") entradas += valor;
      else saidas += valor;
    }
    return { entradas, saidas, saldo: entradas - saidas };
  }, [data]);

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const fmtData = (d: string) => {
    const [a, m, dia] = d.split("-");
    return `${dia}/${m}/${a}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-foreground">Caixa Físico</h1>
          <p className="text-sm text-muted-foreground">
            Controle de pequeno caixa sincronizado do Google Sheets
          </p>
        </div>
        <Button
          onClick={() => sincronizarMutation.mutate({ unidadeId: 1 })}
          disabled={sincronizarMutation.isPending}
        >
          {sincronizarMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Sincronizar
        </Button>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Entradas</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-serif text-emerald-600">{fmt(totais.entradas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Saídas</CardTitle>
            <TrendingDown className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-serif text-rose-600">{fmt(totais.saidas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo</CardTitle>
            <Wallet className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-serif text-amber-600">{fmt(totais.saldo)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-4 items-end">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Data Início</label>
          <Input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="w-44"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Data Fim</label>
          <Input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="w-44"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setDataInicio(""); setDataFim(""); }}
        >
          Limpar filtros
        </Button>
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-32">Data</TableHead>
                <TableHead className="w-24">Tipo</TableHead>
                <TableHead>Ocorrência</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Conferido por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : !data || data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhum lançamento encontrado. Clique em "Sincronizar" para importar do Google Sheets.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono text-sm">{fmtData(l.data)}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        l.tipoOperacao === "C"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-700"
                      }`}>
                        {l.tipoOperacao === "C" ? "Entrada" : "Saída"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{l.ocorrencia}</TableCell>
                    <TableCell className={`text-right font-mono text-sm font-medium ${
                      l.tipoOperacao === "C" ? "text-emerald-600" : "text-rose-600"
                    }`}>
                      {l.tipoOperacao === "C" ? "+" : "-"}{fmt(parseFloat(String(l.valor)))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {l.saldo ? fmt(parseFloat(String(l.saldo))) : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{l.conferidoPor || "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
