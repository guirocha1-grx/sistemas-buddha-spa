import { Fragment, useMemo, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { SeletorMes } from "@/components/SeletorMes";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ChevronRight } from "lucide-react";

function fmtCurrency(value: number) {
  const texto = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(value));
  return value < 0 ? `(${texto})` : texto;
}

function mesAtual() {
  return new Date().toISOString().slice(0, 7);
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
    const porSecao = new Map<string, Map<number, { nome: string; valor: number }>>();
    for (const l of linhas) {
      if (!porSecao.has(l.secao)) porSecao.set(l.secao, new Map());
      const porCategoria = porSecao.get(l.secao)!;
      const atual = porCategoria.get(l.dreCategoriaId) ?? { nome: l.dreCategoriaNome, valor: 0 };
      atual.valor += l.valor;
      porCategoria.set(l.dreCategoriaId, atual);
    }
    const resultado: Record<string, { nome: string; valor: number }[]> = {};
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
                        const valorExibido = c.valor * (linha.tipo === "valor" ? linha.sinal ?? 1 : 1);
                        return (
                          <TableRow key={`${linha.label}-${c.nome}`} className="text-xs">
                            <TableCell className="pl-9 text-muted-foreground">{c.nome}</TableCell>
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
