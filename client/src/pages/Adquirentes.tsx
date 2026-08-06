import { useRef, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Loader2, RefreshCw, Upload, AlertCircle, CreditCard, Wallet, Percent, TrendingUp } from "lucide-react";
import { toast } from "sonner";

// ===== Períodos rápidos (mesmo padrão de Extratos.tsx) =====
type PeriodoRapido = "mes_vigente" | "15" | "30" | "60" | "mes_anterior" | "livre";

function toIsoAdquirente(date: Date): string {
  return date.toISOString().split("T")[0];
}

function calcularPeriodo(periodo: PeriodoRapido): { inicio: string; fim: string } {
  const hoje = new Date();
  if (periodo === "mes_anterior") {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { inicio: toIsoAdquirente(inicio), fim: toIsoAdquirente(fim) };
  }
  if (periodo === "15" || periodo === "30" || periodo === "60") {
    const dias = Number(periodo);
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - dias);
    return { inicio: toIsoAdquirente(inicio), fim: toIsoAdquirente(hoje) };
  }
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  return { inicio: toIsoAdquirente(inicio), fim: toIsoAdquirente(hoje) };
}

// ===== Parser do CSV do Portal Interpag (schedules) =====
// ID Transação;Data e Hora;Tipo;Status;Parcela;Bandeira;Valor bruto;Valor taxa;Valor antecipação;Valor líquido;Data pagamento
interface LinhaInterpag {
  idTransacaoExterno: string;
  dataHora: string;
  tipo?: string;
  status?: string;
  parcela?: string;
  bandeira?: string;
  valorBruto?: number;
  valorTaxa?: number;
  valorAntecipacao?: number;
  valorLiquido?: number;
  dataPagamento?: string;
}

function parseDataHoraInterpag(raw: string, numeroLinha: number): string {
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}:\d{2}:\d{2})$/);
  if (!m) throw new Error(`Linha ${numeroLinha}: data/hora inválida "${raw}"`);
  return `${m[3]}-${m[2]}-${m[1]} ${m[4]}`;
}

function parseDataInterpag(raw: string): string | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
}

function parseNumeroInterpag(raw: string): number | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function parseCsvInterpag(texto: string): LinhaInterpag[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length === 0) throw new Error("Arquivo vazio");
  const primeiraColuna = linhas[0].split(";")[0]?.trim().toLowerCase();
  const temCabecalho = primeiraColuna.includes("id transa");
  const dados = temCabecalho ? linhas.slice(1) : linhas;

  return dados.map((linha, i) => {
    const numeroLinha = i + (temCabecalho ? 2 : 1);
    const campos = linha.split(";");
    if (campos.length < 11) throw new Error(`Linha ${numeroLinha}: esperado 11 colunas, encontrado ${campos.length}`);
    const [idTransacao, dataHora, tipo, status, parcela, bandeira, valorBruto, valorTaxa, valorAntecipacao, valorLiquido, dataPagamento] = campos;
    return {
      idTransacaoExterno: idTransacao.trim(),
      dataHora: parseDataHoraInterpag(dataHora, numeroLinha),
      tipo: tipo.trim() || undefined,
      status: status.trim() || undefined,
      parcela: parcela.trim() || undefined,
      bandeira: bandeira.trim() || undefined,
      valorBruto: parseNumeroInterpag(valorBruto),
      valorTaxa: parseNumeroInterpag(valorTaxa),
      valorAntecipacao: parseNumeroInterpag(valorAntecipacao),
      valorLiquido: parseNumeroInterpag(valorLiquido),
      dataPagamento: parseDataInterpag(dataPagamento),
    };
  });
}

function fmtCurrencyAdq(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function fmtDataHoraAdq(raw: string | null): string {
  if (!raw) return "-";
  const [data, hora] = raw.split(" ");
  const [y, m, d] = (data ?? "").split("-");
  return y ? `${d}/${m}/${y}${hora ? " " + hora.slice(0, 5) : ""}` : raw;
}

function fmtDataAdq(iso: string | null | undefined): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return y ? `${d}/${m}/${y}` : iso;
}

export default function Adquirentes() {
  const { unidadeSelecionada } = useUnidade();
  const unidadeId = unidadeSelecionada?.id;
  const periodoInicial = calcularPeriodo("mes_vigente");

  const [abaAtiva, setAbaAtiva] = useState<"mercadopago" | "interpag">("mercadopago");
  const [dataInicio, setDataInicio] = useState(periodoInicial.inicio);
  const [dataFim, setDataFim] = useState(periodoInicial.fim);
  const [periodoAtivo, setPeriodoAtivo] = useState<PeriodoRapido>("mes_vigente");

  const fileInterpagRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  function selecionarPeriodo(periodo: PeriodoRapido) {
    setPeriodoAtivo(periodo);
    if (periodo === "livre") return;
    const { inicio, fim } = calcularPeriodo(periodo);
    setDataInicio(inicio);
    setDataFim(fim);
  }

  const statusQuery = trpc.adquirentes.status.useQuery(
    { unidadeId: unidadeId! },
    { enabled: !!unidadeId },
  );

  const vendasQuery = trpc.adquirentes.vendas.useQuery(
    { unidadeId: unidadeId!, dataInicio, dataFim, adquirente: abaAtiva },
    { enabled: !!unidadeId },
  );

  const sincronizarMpMutation = trpc.adquirentes.sincronizarMercadoPago.useMutation({
    onSuccess: (data) => {
      toast.success(`Sincronização concluída: ${data.totalInseridos} nova(s) venda(s) de ${data.totalNaApi} no período.`);
      utils.adquirentes.vendas.invalidate();
    },
    onError: (err) => toast.error(`Erro na sincronização: ${err.message}`),
  });

  const importarInterpagMutation = trpc.adquirentes.importarCsvInterpag.useMutation({
    onSuccess: (data) => {
      toast.success(`CSV importado: ${data.totalInseridos} nova(s) venda(s) de ${data.totalLinhas} linha(s).`);
      utils.adquirentes.vendas.invalidate();
    },
    onError: (err) => toast.error(`Erro ao importar CSV: ${err.message}`),
  });

  async function handleImportarInterpag(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !unidadeId) return;
    try {
      const texto = await file.text();
      const linhas = parseCsvInterpag(texto);
      importarInterpagMutation.mutate({ unidadeId, linhas });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao ler o arquivo CSV");
    } finally {
      e.target.value = "";
    }
  }

  const vendas = vendasQuery.data ?? [];
  const totalBruto = vendas.reduce((s, v) => s + parseFloat(v.valorBruto ?? "0"), 0);
  const totalTaxa = vendas.reduce((s, v) => s + parseFloat(v.valorTaxa ?? "0"), 0);
  const totalLiquido = vendas.reduce((s, v) => s + parseFloat(v.valorLiquido ?? "0"), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Adquirentes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vendas da maquininha, item a item — pra conferir contra as comandas da recepção
          </p>
        </div>
        <UnidadeSelector />
      </div>

      {!unidadeId ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          Selecione uma unidade para continuar.
        </div>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="border-border/50 shadow-sm py-2.5">
              <CardContent className="px-4">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <Wallet className="h-3.5 w-3.5" /> Valor bruto no período
                </CardDescription>
                <div className="text-base font-bold mt-0.5">{fmtCurrencyAdq(totalBruto)}</div>
              </CardContent>
            </Card>
            <Card className="border-border/50 shadow-sm py-2.5">
              <CardContent className="px-4">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <Percent className="h-3.5 w-3.5 text-red-500" /> Taxas no período
                </CardDescription>
                <div className="text-base font-bold text-red-600 mt-0.5">{fmtCurrencyAdq(totalTaxa)}</div>
              </CardContent>
            </Card>
            <Card className="border-border/50 shadow-sm py-2.5">
              <CardContent className="px-4">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <TrendingUp className="h-3.5 w-3.5 text-green-600" /> Valor líquido no período
                </CardDescription>
                <div className="text-base font-bold text-green-700 mt-0.5">{fmtCurrencyAdq(totalLiquido)}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                <CreditCard className="h-4 w-4" /> Vendas
              </CardTitle>
              <CardDescription>Uma linha por venda (ou por parcela) — não é o crédito agregado que cai na conta</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={abaAtiva} onValueChange={(v) => setAbaAtiva(v as "mercadopago" | "interpag")}>
                <TabsList className="h-9">
                  <TabsTrigger value="mercadopago" className="text-sm">Mercado Pago</TabsTrigger>
                  <TabsTrigger value="interpag" className="text-sm">Interpag</TabsTrigger>
                </TabsList>
              </Tabs>

              {abaAtiva === "mercadopago" && !statusQuery.data?.mercadoPagoConfigurado && (
                <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-900">Mercado Pago não configurado</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Acesse <strong>Configurações → Mercado Pago</strong> e cole o Access Token pra sincronizar.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Período</Label>
                  <div className="flex gap-1 flex-wrap">
                    {([
                      ["mes_vigente", "Mês vigente"],
                      ["15", "15 dias"],
                      ["30", "30 dias"],
                      ["60", "60 dias"],
                      ["mes_anterior", "Mês anterior"],
                    ] as [PeriodoRapido, string][]).map(([valor, label]) => (
                      <Button
                        key={valor}
                        size="sm"
                        variant={periodoAtivo === valor ? "default" : "outline"}
                        className="h-8 text-xs"
                        onClick={() => selecionarPeriodo(valor)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data início</Label>
                  <Input
                    type="date"
                    value={dataInicio}
                    onChange={(e) => { setDataInicio(e.target.value); setPeriodoAtivo("livre"); }}
                    className="w-40 h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data fim</Label>
                  <Input
                    type="date"
                    value={dataFim}
                    onChange={(e) => { setDataFim(e.target.value); setPeriodoAtivo("livre"); }}
                    className="w-40 h-8 text-sm"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={() => vendasQuery.refetch()} disabled={vendasQuery.isFetching}>
                  {vendasQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Atualizar
                </Button>

                {abaAtiva === "mercadopago" && statusQuery.data?.mercadoPagoConfigurado && (
                  <Button
                    size="sm"
                    onClick={() => sincronizarMpMutation.mutate({ unidadeId, dataInicio, dataFim })}
                    disabled={sincronizarMpMutation.isPending}
                  >
                    {sincronizarMpMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                    Sincronizar com Mercado Pago
                  </Button>
                )}

                {abaAtiva === "interpag" && (
                  <>
                    <input ref={fileInterpagRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportarInterpag} />
                    <Button
                      size="sm"
                      onClick={() => fileInterpagRef.current?.click()}
                      disabled={importarInterpagMutation.isPending}
                    >
                      {importarInterpagMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                      Importar CSV (Portal Interpag → Schedules)
                    </Button>
                  </>
                )}
              </div>

              {vendasQuery.isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : vendas.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  Nenhuma venda neste período.
                </div>
              ) : (
                <div className="rounded-md border border-border/50 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-xs w-32">Data/Hora</TableHead>
                        <TableHead className="text-xs w-56">Tipo</TableHead>
                        <TableHead className="text-xs w-24">Status</TableHead>
                        <TableHead className="text-xs w-14">Parc.</TableHead>
                        <TableHead className="text-xs w-24">Bandeira</TableHead>
                        <TableHead className="text-xs text-right w-24">Bruto</TableHead>
                        <TableHead className="text-xs text-right w-20">Taxa</TableHead>
                        <TableHead className="text-xs text-right w-24">Antecip.</TableHead>
                        <TableHead className="text-xs text-right w-24">Líquido</TableHead>
                        <TableHead className="text-xs w-24">Pagamento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vendas.map((v) => (
                        <TableRow key={v.id} className="text-sm">
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDataHoraAdq(v.dataHora)}</TableCell>
                          <TableCell className="text-xs max-w-56 truncate" title={v.tipo ?? undefined}>{v.tipo ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs font-normal whitespace-nowrap">{v.status ?? "—"}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{v.parcela ?? "—"}</TableCell>
                          <TableCell className="text-xs">{v.bandeira ?? "—"}</TableCell>
                          <TableCell className="text-right text-xs whitespace-nowrap">{fmtCurrencyAdq(v.valorBruto)}</TableCell>
                          <TableCell className="text-right text-xs text-red-600 whitespace-nowrap">{fmtCurrencyAdq(v.valorTaxa)}</TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap">{fmtCurrencyAdq(v.valorAntecipacao)}</TableCell>
                          <TableCell className="text-right text-xs font-medium text-green-700 whitespace-nowrap">{fmtCurrencyAdq(v.valorLiquido)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDataAdq(v.dataPagamento)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {vendas.length > 0 && (
                <div className="flex justify-end gap-6 pt-2 border-t border-border/30 text-sm">
                  <span className="text-muted-foreground">{vendas.length} venda(s)</span>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
