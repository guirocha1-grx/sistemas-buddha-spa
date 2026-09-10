import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { SeletorMes } from "@/components/SeletorMes";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DescricaoCombobox } from "@/components/DescricaoCombobox";
import { Loader2, ChevronRight, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

function fmtCurrency(value: number) {
  const texto = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(value));
  return value < 0 ? `(${texto})` : texto;
}

function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}

// Ordem de exibição dos grupos de "Receitas de Vendas" — o resto (ex.:
// categorias de despesa, sem forma de pagamento) cai no fallback do
// nome da Descrição e aparece depois, em ordem alfabética.
const ORDEM_FORMAS = ["Espécie", "Pix", "Débito", "Crédito à vista", "Crédito parcelado"];

/**
 * "Forma de pagamento" pro agrupamento do hover — só as 4 Descrições de
 * receita têm uma forma reconhecida (chave estável, não muda se o
 * usuário renomear a Descrição); crédito ainda se divide em à vista/
 * parcelado pela `parcela` ("N/M", M=1 é à vista). Categoria de
 * despesa (sem chave de receita) cai no nome da Descrição mesmo,
 * agrupamento não faz sentido pra ela.
 */
function formaDoLancamento(chave: string | null, parcela: string | null, nomeFallback: string): string {
  if (chave === "receita_especie") return "Espécie";
  if (chave === "receita_pix") return "Pix";
  if (chave === "receita_c_debito") return "Débito";
  if (chave === "receita_c_credito") {
    const totalParcelas = Number(parcela?.split("/")[1] ?? 1);
    return totalParcelas > 1 ? "Crédito parcelado" : "Crédito à vista";
  }
  return nomeFallback;
}

/**
 * Categoria como trigger de hover: busca (lazy, só quando aberto) os
 * lançamentos individuais que compõem essa Categoria no período/regime
 * atual — drill-down pedido pelo usuário 2026-09-09, pra não precisar
 * sair do DRE pra saber o que tem dentro de um número. Agrupado por
 * forma de pagamento (2026-09-10) — bem mais fácil de ler que uma
 * lista corrida quando a Categoria é "Receitas de Vendas".
 */
function DetalheCategoriaHover({
  unidadeId,
  mesInicio,
  mesFim,
  regime,
  dreCategoriaId,
  sinal,
  children,
}: {
  unidadeId: number;
  mesInicio: string;
  mesFim: string;
  regime: "caixa" | "competencia";
  dreCategoriaId: number;
  sinal: number;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const query = trpc.dre.lancamentosPorCategoria.useQuery(
    { unidadeId, mesInicio, mesFim, regime, dreCategoriaId },
    { enabled: aberto },
  );

  const grupos = useMemo(() => {
    const porForma = new Map<string, { itens: NonNullable<typeof query.data>; total: number }>();
    for (const l of query.data ?? []) {
      const forma = formaDoLancamento(l.dreDescricaoChave, l.parcela, l.dreDescricaoNome);
      const atual = porForma.get(forma) ?? { itens: [], total: 0 };
      atual.itens.push(l);
      atual.total += l.valor;
      porForma.set(forma, atual);
    }
    return Array.from(porForma.entries()).sort(([a], [b]) => {
      const idxA = ORDEM_FORMAS.indexOf(a);
      const idxB = ORDEM_FORMAS.indexOf(b);
      if (idxA === -1 && idxB === -1) return a.localeCompare(b);
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [query.data]);

  return (
    <HoverCard open={aberto} onOpenChange={setAberto} openDelay={150}>
      <HoverCardTrigger asChild>
        <span className="cursor-default border-b border-dotted border-muted-foreground/40">{children}</span>
      </HoverCardTrigger>
      <HoverCardContent className="w-96 max-h-80 overflow-y-auto p-2" align="start">
        {query.isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : grupos.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">Nenhum lançamento encontrado.</p>
        ) : (
          <div className="space-y-0.5">
            {grupos.map(([forma, { itens, total }]) => (
              <div key={forma} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                <span className="font-medium">{forma}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground text-[10px]">{itens.length} venda{itens.length === 1 ? "" : "s"}</span>
                  <span className={`font-medium ${sinal < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                    {fmtCurrency(total * sinal)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}

function fmtMesAno(mesAno: string) {
  const [ano, mes] = mesAno.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(mes) - 1]}/${ano.slice(2)}`;
}

/**
 * Lançamento manual no DRE — valor que afeta o resultado sem transação
 * bancária por trás (ex.: encontro de contas com franqueador, royalties
 * abatidos contra vouchers a receber). Só conta no regime Competência
 * (decisão do usuário 2026-09-10 — caixa é dinheiro que realmente
 * circulou, aqui não circulou nenhum). Botão + diálogo de criação, com
 * a lista dos já lançados no período visível logo abaixo (com opção de
 * excluir) — mantido separado do hover de detalhe (que só mostra total
 * por forma de pagamento, sem lançamento a lançamento).
 */
function LancamentoManualDialog({
  unidadeId,
  mesInicio,
  mesFim,
}: {
  unidadeId: number;
  mesInicio: string;
  mesFim: string;
}) {
  const [open, setOpen] = useState(false);
  const [descricaoId, setDescricaoId] = useState<number | null>(null);
  const [mesReferencia, setMesReferencia] = useState(mesFim);
  const [valor, setValor] = useState("");
  const [observacao, setObservacao] = useState("");
  const utils = trpc.useUtils();

  const descricoesQuery = trpc.dreDescricoes.list.useQuery();
  const categoriasQuery = trpc.dreCategorias.list.useQuery();
  const descricoes = descricoesQuery.data ?? [];
  const categorias = categoriasQuery.data ?? [];

  const listQuery = trpc.dre.lancamentosManuais.list.useQuery(
    { unidadeId, mesInicio, mesFim },
    { enabled: open },
  );

  function parseValor(raw: string): number {
    const n = parseFloat(raw.replace(",", "."));
    return Number.isNaN(n) ? 0 : n;
  }

  function limpar() {
    setDescricaoId(null);
    setMesReferencia(mesFim);
    setValor("");
    setObservacao("");
  }

  const criarMutation = trpc.dre.lancamentosManuais.criar.useMutation({
    onSuccess: () => {
      toast.success("Lançamento manual criado.");
      utils.dre.agregado.invalidate();
      utils.dre.lancamentosPorCategoria.invalidate();
      utils.dre.lancamentosManuais.list.invalidate();
      limpar();
    },
    onError: (err) => toast.error(err.message),
  });

  const excluirMutation = trpc.dre.lancamentosManuais.excluir.useMutation({
    onSuccess: () => {
      toast.success("Lançamento manual removido.");
      utils.dre.agregado.invalidate();
      utils.dre.lancamentosPorCategoria.invalidate();
      utils.dre.lancamentosManuais.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const podeSalvar = descricaoId !== null && /^\d{4}-\d{2}$/.test(mesReferencia) && parseValor(valor) > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Lançamento manual
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Lançamento manual</DialogTitle>
          <DialogDescription>
            Pra valor que afeta o resultado sem transação bancária por trás — ex.: encontro de contas com o
            franqueador (royalties abatidos contra vouchers a receber). Só conta no regime Competência.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição</Label>
            <DescricaoCombobox
              descricoes={descricoes}
              categorias={categorias}
              value={descricaoId}
              onChange={setDescricaoId}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Mês de competência</Label>
              <SeletorMes value={mesReferencia} onChange={setMesReferencia} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Valor</Label>
              <Input placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Observação</Label>
            <Textarea
              placeholder='Ex.: "Encontro de contas com franqueador — royalties x vouchers, agosto/2026"'
              rows={2}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            onClick={() => criarMutation.mutate({ unidadeId, dreDescricaoId: descricaoId!, mesReferencia, valor: parseValor(valor), observacao: observacao.trim() || undefined })}
            disabled={!podeSalvar || criarMutation.isPending}
          >
            {criarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            Lançar
          </Button>
        </div>

        <div className="border-t pt-3 space-y-1.5">
          <Label className="text-xs text-muted-foreground">Lançados no período visível ({fmtMesAno(mesInicio)} – {fmtMesAno(mesFim)})</Label>
          {listQuery.isLoading ? (
            <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : !listQuery.data || listQuery.data.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">Nenhum lançamento manual nesse período.</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {listQuery.data.map((l) => (
                <div key={l.id} className="flex items-start justify-between gap-2 text-xs py-1 border-b border-border/30 last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium">{l.dreDescricaoNome} · {fmtMesAno(l.mesReferencia)}</div>
                    {l.observacao && <div className="text-muted-foreground truncate">{l.observacao}</div>}
                    {l.criadoPor && <div className="text-muted-foreground text-[10px]">por {l.criadoPor}</div>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-medium">{fmtCurrency(parseFloat(l.valor))}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => excluirMutation.mutate({ id: l.id })}
                      disabled={excluirMutation.isPending}
                      title="Excluir"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type LinhaCascata =
  // `secao` só nas linhas de valor com detalhe por Categoria disponível
  // (sinal indica se a Categoria detalhada deve aparecer com o mesmo
  // sinal da linha — despesa é sempre negativo aqui, mesmo a soma bruta
  // por Categoria vindo positiva do backend).
  | { tipo: "valor"; label: string; valor: number; secao?: string; sinal?: 1 | -1 }
  | { tipo: "subtotal"; label: string; valor: number };

export default function Dre() {
  const { unidadeId } = useUnidade();
  const [mesInicio, setMesInicio] = useState(mesAtual());
  const [mesFim, setMesFim] = useState(mesAtual());
  const [regime, setRegime] = useState<"caixa" | "competencia">("caixa");

  const query = trpc.dre.agregado.useQuery(
    { unidadeId: unidadeId ?? 0, mesInicio, mesFim, regime },
    { enabled: !!unidadeId },
  );
  const linhas = query.data ?? [];

  const somaPorSecao = useMemo(() => {
    const somas: Record<string, number> = {};
    for (const l of linhas) somas[l.secao] = (somas[l.secao] ?? 0) + l.valor;
    return somas;
  }, [linhas]);

  // Detalhe por Categoria (soma as Descrições dela) dentro de cada
  // Seção — alimenta a setinha "detalhar" de cada linha da cascata.
  const categoriasPorSecao = useMemo(() => {
    const porSecao = new Map<string, Map<number, { id: number; nome: string; valor: number }>>();
    for (const l of linhas) {
      if (!porSecao.has(l.secao)) porSecao.set(l.secao, new Map());
      const porCategoria = porSecao.get(l.secao)!;
      const atual = porCategoria.get(l.dreCategoriaId) ?? { id: l.dreCategoriaId, nome: l.dreCategoriaNome, valor: 0 };
      atual.valor += l.valor;
      porCategoria.set(l.dreCategoriaId, atual);
    }
    const resultado: Record<string, { id: number; nome: string; valor: number }[]> = {};
    for (const [secao, porCategoria] of porSecao) {
      resultado[secao] = Array.from(porCategoria.values()).sort((a, b) => b.valor - a.valor);
    }
    return resultado;
  }, [linhas]);

  const [secoesExpandidas, setSecoesExpandidas] = useState<Set<string>>(new Set());
  function alternarSecao(secao: string) {
    setSecoesExpandidas((atual) => {
      const novo = new Set(atual);
      if (novo.has(secao)) novo.delete(secao); else novo.add(secao);
      return novo;
    });
  }

  const cascata = useMemo((): LinhaCascata[] => {
    const s = (secao: string) => somaPorSecao[secao] ?? 0;
    const receitaBruta = s("receitas");
    const impostos = s("impostos");
    const receitaLiquida = receitaBruta - impostos;
    const custosDiretos = s("custos_diretos");
    // Devoluções são reembolso de compra a fornecedor — abatem
    // Custos/Despesas, não a Receita (decisão do usuário 2026-09-08).
    const devolucoes = s("devolucoes");
    const lucroBruto = receitaLiquida - custosDiretos + devolucoes;
    const despesasPessoal = s("despesas_pessoal");
    const marketing = s("marketing");
    const despesasAdministrativas = s("despesas_administrativas");
    const despesasFinanceiras = s("despesas_financeiras");
    const resultado = lucroBruto - despesasPessoal - marketing - despesasAdministrativas - despesasFinanceiras;

    return [
      { tipo: "valor", label: "Receita Bruta", valor: receitaBruta, secao: "receitas", sinal: 1 },
      { tipo: "valor", label: "(−) Impostos", valor: -impostos, secao: "impostos", sinal: -1 },
      { tipo: "subtotal", label: "= Receita Líquida", valor: receitaLiquida },
      { tipo: "valor", label: "(−) Custos Diretos", valor: -custosDiretos, secao: "custos_diretos", sinal: -1 },
      { tipo: "valor", label: "(+) Devoluções (abate Custos/Despesas)", valor: devolucoes, secao: "devolucoes", sinal: 1 },
      { tipo: "subtotal", label: "= Lucro Bruto", valor: lucroBruto },
      { tipo: "valor", label: "(−) Despesas com Pessoal", valor: -despesasPessoal, secao: "despesas_pessoal", sinal: -1 },
      { tipo: "valor", label: "(−) Marketing", valor: -marketing, secao: "marketing", sinal: -1 },
      { tipo: "valor", label: "(−) Despesas Administrativas", valor: -despesasAdministrativas, secao: "despesas_administrativas", sinal: -1 },
      { tipo: "valor", label: "(−) Despesas Financeiras", valor: -despesasFinanceiras, secao: "despesas_financeiras", sinal: -1 },
      { tipo: "subtotal", label: "= Resultado do Período", valor: resultado },
    ];
  }, [somaPorSecao]);

  const receitaBruta = somaPorSecao["receitas"] ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            DRE
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Demonstrativo de Resultado do Exercício, no período e regime escolhidos.
          </p>
        </div>
        <UnidadeSelector />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Mês início</label>
          <div className="mt-1"><SeletorMes value={mesInicio} onChange={setMesInicio} /></div>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Mês fim</label>
          <div className="mt-1"><SeletorMes value={mesFim} onChange={setMesFim} /></div>
        </div>
        <Tabs value={regime} onValueChange={(v) => setRegime(v as "caixa" | "competencia")}>
          <TabsList>
            <TabsTrigger value="caixa">Caixa</TabsTrigger>
            <TabsTrigger value="competencia">Competência</TabsTrigger>
          </TabsList>
        </Tabs>
        {unidadeId && <LancamentoManualDialog unidadeId={unidadeId} mesInicio={mesInicio} mesFim={mesFim} />}
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardContent>
          {query.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : linhas.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Nenhum lançamento categorizado no período.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Linha</TableHead>
                  <TableHead className="text-xs text-right w-36">Valor</TableHead>
                  <TableHead className="text-xs text-right w-20">%AV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cascata.map((linha) => {
                  const categorias = linha.tipo === "valor" && linha.secao ? categoriasPorSecao[linha.secao] : undefined;
                  const expandida = linha.tipo === "valor" && linha.secao ? secoesExpandidas.has(linha.secao) : false;
                  return (
                    <Fragment key={linha.label}>
                      <TableRow className={linha.tipo === "subtotal" ? "bg-muted/40 border-t-2 border-t-foreground/20" : "text-sm"}>
                        <TableCell className={linha.tipo === "subtotal" ? "font-semibold" : ""}>
                          <div className="flex items-center gap-1">
                            {categorias && categorias.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => alternarSecao(linha.secao!)}
                                className="shrink-0 -ml-1 p-0.5 rounded hover:bg-muted text-muted-foreground"
                                aria-label={expandida ? "Recolher detalhe" : "Detalhar por categoria"}
                              >
                                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expandida ? "rotate-90" : ""}`} />
                              </button>
                            ) : (
                              <span className="w-[18px] shrink-0" />
                            )}
                            {linha.label}
                          </div>
                        </TableCell>
                        <TableCell className={`text-right ${linha.tipo === "subtotal" ? "font-bold" : "font-medium"} ${linha.valor < 0 ? "text-rose-700" : ""}`}>
                          {fmtCurrency(linha.valor)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-xs">
                          {receitaBruta > 0 ? `${((linha.valor / receitaBruta) * 100).toFixed(1)}%` : "—"}
                        </TableCell>
                      </TableRow>
                      {expandida && categorias?.map((c) => {
                        const sinal = linha.tipo === "valor" ? linha.sinal ?? 1 : 1;
                        const valorExibido = c.valor * sinal;
                        return (
                          <TableRow key={`${linha.label}-${c.nome}`} className="text-xs">
                            <TableCell className="pl-9 text-muted-foreground">
                              <DetalheCategoriaHover
                                unidadeId={unidadeId!}
                                mesInicio={mesInicio}
                                mesFim={mesFim}
                                regime={regime}
                                dreCategoriaId={c.id}
                                sinal={sinal}
                              >
                                {c.nome}
                              </DetalheCategoriaHover>
                            </TableCell>
                            <TableCell className={`text-right text-muted-foreground ${valorExibido < 0 ? "text-rose-700/70" : ""}`}>
                              {fmtCurrency(valorExibido)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {receitaBruta > 0 ? `${((valorExibido / receitaBruta) * 100).toFixed(1)}%` : "—"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
