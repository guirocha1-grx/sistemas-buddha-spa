import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { SeletorMes } from "@/components/SeletorMes";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Loader2, ChevronRight } from "lucide-react";

function fmtCurrency(value: number) {
  const texto = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(value));
  return value < 0 ? `(${texto})` : texto;
}

function fmtDataCurta(data: string) {
  const [, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
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
          <div className="space-y-2">
            {grupos.map(([forma, { itens, total }]) => (
              <div key={forma}>
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pb-0.5 border-b border-border/50">
                  <span>{forma}</span>
                  <span>{fmtCurrency(total * sinal)}</span>
                </div>
                <div className="space-y-0.5 mt-0.5">
                  {itens.map((l, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 text-xs py-0.5">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{l.titulo}</div>
                        <div className="text-muted-foreground text-[10px]">{fmtDataCurta(l.data)}</div>
                      </div>
                      <span className={`shrink-0 ${sinal < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                        {fmtCurrency(l.valor * sinal)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
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
