import { useRef, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, DollarSign, TrendingUp, Target, Wallet, RefreshCw, Upload, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

// ===== Extratos: parser de CSV =====
// Formato esperado (com ou sem cabeçalho): data;descricao;tipo;valor
// data: AAAA-MM-DD ou DD/MM/AAAA — tipo: C (entrada) ou D (saída) — valor: sempre positivo, "," ou "." como decimal
interface LinhaCsv {
  data: string;
  descricao: string;
  tipo: "C" | "D";
  valor: number;
}

function parseDataCsv(raw: string, numeroLinha: number): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  throw new Error(`Linha ${numeroLinha}: data inválida "${raw}" (use AAAA-MM-DD ou DD/MM/AAAA)`);
}

function parseValorCsv(raw: string, numeroLinha: number): number {
  const limpo = raw.trim().replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(,|$))/g, "").replace(",", ".");
  const n = parseFloat(limpo);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Linha ${numeroLinha}: valor inválido "${raw}"`);
  return n;
}

function parseTipoCsv(raw: string, numeroLinha: number): "C" | "D" {
  const s = raw.trim().toUpperCase();
  if (s === "C" || s === "CREDITO" || s === "CRÉDITO" || s === "ENTRADA") return "C";
  if (s === "D" || s === "DEBITO" || s === "DÉBITO" || s === "SAIDA" || s === "SAÍDA") return "D";
  throw new Error(`Linha ${numeroLinha}: tipo inválido "${raw}" (use C ou D)`);
}

function parseCsvExtrato(texto: string): LinhaCsv[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length === 0) throw new Error("Arquivo vazio");

  const delimitador = linhas[0].includes(";") ? ";" : ",";
  const primeiraColuna = linhas[0].split(delimitador)[0]?.trim().toLowerCase();
  const temCabecalho = primeiraColuna === "data";
  const dados = temCabecalho ? linhas.slice(1) : linhas;

  return dados.map((linha, i) => {
    const numeroLinha = i + (temCabecalho ? 2 : 1);
    const campos = linha.split(delimitador);
    if (campos.length < 4) throw new Error(`Linha ${numeroLinha}: esperado 4 colunas (data;descricao;tipo;valor), encontrado ${campos.length}`);
    const [data, descricao, tipo, valor] = campos;
    return {
      data: parseDataCsv(data, numeroLinha),
      descricao: descricao.trim(),
      tipo: parseTipoCsv(tipo, numeroLinha),
      valor: parseValorCsv(valor, numeroLinha),
    };
  });
}

function fmtCurrencyExtrato(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function fmtDateExtrato(iso: string): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function toIsoExtrato(date: Date): string {
  return date.toISOString().split("T")[0];
}

function fileParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Financeiro() {
  const { unidadeSelecionada } = useUnidade();
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

  const fmtCurrency = (val: number) => val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const totalRecebimentos = recebimentos?.reduce((sum: number, r: any) => sum + (r.valor || 0), 0) ?? 0;
  const metaAtual = metas?.find((m: any) => m.mes === today.getMonth() + 1 && m.ano === today.getFullYear());

  // ===== Extratos (Banco Inter + importação CSV) =====
  const unidadeId = unidadeSelecionada?.id;
  const trintaDiasAtras = new Date(today);
  trintaDiasAtras.setDate(today.getDate() - 30);
  const [dataInicioExtrato, setDataInicioExtrato] = useState(toIsoExtrato(trintaDiasAtras));
  const [dataFimExtrato, setDataFimExtrato] = useState(toIsoExtrato(today));
  const [filtroTipoExtrato, setFiltroTipoExtrato] = useState<"todos" | "D" | "C">("todos");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filePdfInputRef = useRef<HTMLInputElement>(null);
  const fileOfxInputRef = useRef<HTMLInputElement>(null);
  const utilsExtrato = trpc.useUtils();

  const statusInterQuery = trpc.inter.status.useQuery(
    { unidadeId: unidadeId! },
    { enabled: !!unidadeId },
  );

  const saldoInterQuery = trpc.inter.saldo.useQuery(
    { unidadeId: unidadeId! },
    { enabled: !!unidadeId && statusInterQuery.data?.configurado === true, retry: false },
  );

  const extratosQuery = trpc.inter.extratos.useQuery(
    { unidadeId: unidadeId!, dataInicio: dataInicioExtrato, dataFim: dataFimExtrato },
    { enabled: !!unidadeId },
  );

  const sincronizarInterMutation = trpc.inter.sincronizar.useMutation({
    onSuccess: (data) => {
      toast.success(`Sincronização concluída: ${data.totalInseridos} nova(s) transação(ões).`);
      extratosQuery.refetch();
      saldoInterQuery.refetch();
    },
    onError: (err) => toast.error(`Erro na sincronização: ${err.message}`),
  });

  const importarCsvMutation = trpc.inter.importarCsv.useMutation({
    onSuccess: (data) => {
      toast.success(`CSV importado: ${data.totalInseridos} nova(s) transação(ões) de ${data.totalLinhas} linha(s).`);
      utilsExtrato.inter.extratos.invalidate();
    },
    onError: (err) => toast.error(`Erro ao importar CSV: ${err.message}`),
  });

  async function handleImportarCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !unidadeId) return;
    try {
      const texto = await file.text();
      const linhas = parseCsvExtrato(texto);
      importarCsvMutation.mutate({ unidadeId, linhas });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao ler o arquivo CSV");
    } finally {
      e.target.value = "";
    }
  }

  const importarPdfMutation = trpc.inter.importarPdf.useMutation({
    onSuccess: (data) => {
      toast.success(`PDF importado: ${data.totalInseridos} nova(s) transação(ões) de ${data.totalLinhas} encontrada(s).`);
      utilsExtrato.inter.extratos.invalidate();
    },
    onError: (err) => toast.error(`Erro ao importar PDF: ${err.message}`),
  });

  async function handleImportarPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !unidadeId) return;
    try {
      const pdfBase64 = await fileParaBase64(file);
      importarPdfMutation.mutate({ unidadeId, pdfBase64 });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao ler o arquivo PDF");
    } finally {
      e.target.value = "";
    }
  }

  const importarOfxMutation = trpc.inter.importarOfx.useMutation({
    onSuccess: (data) => {
      toast.success(`OFX importado: ${data.totalInseridos} nova(s) transação(ões) de ${data.totalLinhas} encontrada(s).`);
      utilsExtrato.inter.extratos.invalidate();
    },
    onError: (err) => toast.error(`Erro ao importar OFX: ${err.message}`),
  });

  async function handleImportarOfx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !unidadeId) return;
    try {
      const ofxTexto = await file.text();
      importarOfxMutation.mutate({ unidadeId, ofxTexto });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao ler o arquivo OFX");
    } finally {
      e.target.value = "";
    }
  }

  const transacoesExtrato = extratosQuery.data ?? [];
  const transacoesFiltradasExtrato = filtroTipoExtrato === "todos"
    ? transacoesExtrato
    : transacoesExtrato.filter((t) => t.tipoOperacao === filtroTipoExtrato);
  const totalCreditosExtrato = transacoesExtrato.filter((t) => t.tipoOperacao === "C").reduce((s, t) => s + parseFloat(t.valor ?? "0"), 0);
  const totalDebitosExtrato = transacoesExtrato.filter((t) => t.tipoOperacao === "D").reduce((s, t) => s + parseFloat(t.valor ?? "0"), 0);
  const saldoExtrato = totalCreditosExtrato - totalDebitosExtrato;

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
          <TabsTrigger value="extratos">Extratos</TabsTrigger>
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

        {/* Extratos */}
        <TabsContent value="extratos" className="space-y-4">
          {!unidadeId ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Selecione uma unidade para continuar.
            </div>
          ) : (
            <>
              {!statusInterQuery.data?.configurado && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-900">Banco Inter não configurado</p>
                        <p className="text-xs text-amber-700 mt-1">
                          Acesse <strong>Configurações → Banco Inter</strong> para sincronizar automaticamente,
                          ou importe um extrato manualmente em CSV abaixo.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 md:grid-cols-3">
                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                      <Wallet className="h-4 w-4" /> Saldo Disponível (Inter)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {saldoInterQuery.isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : saldoInterQuery.data ? (
                      <div className="text-2xl font-bold">{fmtCurrencyExtrato(saldoInterQuery.data.disponivel)}</div>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                      <TrendingUp className="h-4 w-4 text-green-600" /> Entradas no Período
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-700">{fmtCurrencyExtrato(totalCreditosExtrato)}</div>
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardDescription className="flex items-center gap-1.5">
                      <DollarSign className="h-4 w-4 text-red-500" /> Saídas no Período
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-600">{fmtCurrencyExtrato(totalDebitosExtrato)}</div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Extrato</CardTitle>
                  <CardDescription>Transações do Banco Inter e importadas manualmente</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Data início</Label>
                      <Input type="date" value={dataInicioExtrato} onChange={(e) => setDataInicioExtrato(e.target.value)} className="w-40 h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Data fim</Label>
                      <Input type="date" value={dataFimExtrato} onChange={(e) => setDataFimExtrato(e.target.value)} className="w-40 h-8 text-sm" />
                    </div>
                    <Button size="sm" variant="outline" onClick={() => extratosQuery.refetch()} disabled={extratosQuery.isFetching}>
                      {extratosQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                      Atualizar
                    </Button>
                    {statusInterQuery.data?.configurado && (
                      <Button
                        size="sm"
                        onClick={() => sincronizarInterMutation.mutate({ unidadeId, dataInicio: dataInicioExtrato, dataFim: dataFimExtrato })}
                        disabled={sincronizarInterMutation.isPending}
                      >
                        {sincronizarInterMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                        Sincronizar com Inter
                      </Button>
                    )}
                    <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportarCsv} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={importarCsvMutation.isPending}
                    >
                      {importarCsvMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                      Importar CSV
                    </Button>
                    <input ref={filePdfInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleImportarPdf} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => filePdfInputRef.current?.click()}
                      disabled={importarPdfMutation.isPending}
                    >
                      {importarPdfMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                      Importar PDF
                    </Button>
                    <input ref={fileOfxInputRef} type="file" accept=".ofx,application/x-ofx" className="hidden" onChange={handleImportarOfx} />
                    <Button
                      size="sm"
                      onClick={() => fileOfxInputRef.current?.click()}
                      disabled={importarOfxMutation.isPending}
                    >
                      {importarOfxMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                      Importar OFX
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <strong>OFX</strong> (recomendado — exportação padrão do banco, com ID de transação garantido)
                    ou <span className="font-mono">data;descricao;tipo;valor</span> em CSV (data AAAA-MM-DD ou DD/MM/AAAA,
                    tipo C/D, valor sempre positivo, cabeçalho opcional) ou o PDF do "Extrato completo" do Banco Inter.
                  </p>

                  <Tabs value={filtroTipoExtrato} onValueChange={(v) => setFiltroTipoExtrato(v as "todos" | "D" | "C")}>
                    <TabsList className="h-8">
                      <TabsTrigger value="todos" className="text-xs h-7">Todos ({transacoesExtrato.length})</TabsTrigger>
                      <TabsTrigger value="C" className="text-xs h-7">Entradas ({transacoesExtrato.filter((t) => t.tipoOperacao === "C").length})</TabsTrigger>
                      <TabsTrigger value="D" className="text-xs h-7">Saídas ({transacoesExtrato.filter((t) => t.tipoOperacao === "D").length})</TabsTrigger>
                    </TabsList>
                    <TabsContent value={filtroTipoExtrato} className="mt-3">
                      {extratosQuery.isLoading ? (
                        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                      ) : transacoesFiltradasExtrato.length === 0 ? (
                        <div className="text-center py-12 text-sm text-muted-foreground">
                          {transacoesExtrato.length === 0
                            ? 'Nenhuma transação neste período. Sincronize com o Inter ou importe um CSV.'
                            : "Nenhuma transação encontrada com o filtro selecionado."}
                        </div>
                      ) : (
                        <div className="rounded-md border border-border/50 overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/30">
                                <TableHead className="text-xs w-24">Data</TableHead>
                                <TableHead className="text-xs">Descrição</TableHead>
                                <TableHead className="text-xs w-20">Origem</TableHead>
                                <TableHead className="text-xs text-right w-32">Valor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {transacoesFiltradasExtrato.map((t) => (
                                <TableRow key={t.id} className="text-sm">
                                  <TableCell className="text-xs text-muted-foreground">{fmtDateExtrato(t.dataEntrada)}</TableCell>
                                  <TableCell>
                                    <div className="font-medium text-sm leading-tight">{t.titulo || t.tipoTransacao || "—"}</div>
                                    {t.descricao && <div className="text-xs text-muted-foreground truncate max-w-xs">{t.descricao}</div>}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-xs font-normal">
                                      {t.origem === "csv" ? "CSV" : t.origem === "pdf" ? "PDF" : t.origem === "ofx" ? "OFX" : "Inter"}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    <span className={t.tipoOperacao === "C" ? "text-green-700" : "text-red-600"}>
                                      {t.tipoOperacao === "C" ? "+" : "-"}{fmtCurrencyExtrato(t.valor)}
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

                  {transacoesFiltradasExtrato.length > 0 && (
                    <div className="flex justify-end gap-6 pt-2 border-t border-border/30 text-sm">
                      <span className="text-muted-foreground">{transacoesFiltradasExtrato.length} transação(ões)</span>
                      <span className="font-semibold">
                        Saldo do período: <span className={saldoExtrato >= 0 ? "text-green-700" : "text-red-600"}>{fmtCurrencyExtrato(saldoExtrato)}</span>
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
