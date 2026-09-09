import { Fragment, useMemo, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { SeletorMes } from "@/components/SeletorMes";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, TrendingUp, TrendingDown, Scale } from "lucide-react";

function fmtCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}

// Mesmo catálogo/ordem de shared/dreCategorizacao (DreSecao) e da tela
// Parametros.tsx — "excluido" fica fora de propósito, o backend
// (listDreAgregado) já nunca devolve linha dessa seção.
const SECOES: { value: string; label: string }[] = [
  { value: "receitas", label: "Receitas" },
  { value: "impostos", label: "Impostos" },
  { value: "custos_diretos", label: "Custos Diretos" },
  { value: "despesas_pessoal", label: "Despesas com Pessoal" },
  { value: "marketing", label: "Marketing" },
  { value: "despesas_administrativas", label: "Despesas Administrativas" },
  { value: "despesas_financeiras", label: "Despesas Financeiras" },
  { value: "devolucoes", label: "Devoluções (abate Custos/Despesas)" },
];

export default function ReceitaDespesa() {
  const { unidadeId } = useUnidade();
  const [mesInicio, setMesInicio] = useState(mesAtual());
  const [mesFim, setMesFim] = useState(mesAtual());
  const [regime, setRegime] = useState<"caixa" | "competencia">("caixa");

  const query = trpc.receitaDespesa.agregado.useQuery(
    { unidadeId: unidadeId ?? 0, mesInicio, mesFim, regime },
    { enabled: !!unidadeId },
  );
  const linhas = query.data ?? [];

  // Agrupa por Categoria (soma as Descrições dela) — visão mais alta
  // que o DRE completo, que agrupa direto por Seção.
  const categorias = useMemo(() => {
    const porCategoria = new Map<number, { nome: string; secao: string; valor: number }>();
    for (const l of linhas) {
      const atual = porCategoria.get(l.dreCategoriaId) ?? { nome: l.dreCategoriaNome, secao: l.secao, valor: 0 };
      atual.valor += l.valor;
      porCategoria.set(l.dreCategoriaId, atual);
    }
    return Array.from(porCategoria.values());
  }, [linhas]);

  const receitasTotal = categorias.filter((c) => c.secao === "receitas").reduce((s, c) => s + c.valor, 0);
  const devolucoesTotal = categorias.filter((c) => c.secao === "devolucoes").reduce((s, c) => s + c.valor, 0);
  const despesasTotal = categorias
    .filter((c) => c.secao !== "receitas" && c.secao !== "devolucoes")
    .reduce((s, c) => s + c.valor, 0) - devolucoesTotal;
  const resultado = receitasTotal - despesasTotal;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Receita x Despesa
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Resumo por categoria do plano de contas, no período e regime escolhidos.
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

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-border/50 shadow-sm py-2.5">
          <CardContent className="px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs"><TrendingUp className="h-3.5 w-3.5" /> Receitas</CardDescription>
            <div className="text-lg font-bold mt-0.5 text-emerald-700">{fmtCurrency(receitasTotal)}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm py-2.5">
          <CardContent className="px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs"><TrendingDown className="h-3.5 w-3.5" /> Despesas</CardDescription>
            <div className="text-lg font-bold mt-0.5 text-rose-700">{fmtCurrency(despesasTotal)}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm py-2.5">
          <CardContent className="px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs"><Scale className="h-3.5 w-3.5" /> Resultado</CardDescription>
            <div className={`text-lg font-bold mt-0.5 ${resultado < 0 ? "text-rose-700" : "text-emerald-700"}`}>{fmtCurrency(resultado)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardContent>
          {query.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : categorias.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Nenhum lançamento categorizado no período.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Categoria</TableHead>
                  <TableHead className="text-xs text-right w-32">Valor</TableHead>
                  <TableHead className="text-xs text-right w-24">% Receitas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {SECOES.map((secao) => {
                  const itens = categorias.filter((c) => c.secao === secao.value).sort((a, b) => b.valor - a.valor);
                  if (itens.length === 0) return null;
                  return (
                    <Fragment key={secao.value}>
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={3} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-1.5">
                          {secao.label}
                        </TableCell>
                      </TableRow>
                      {itens.map((c) => (
                        <TableRow key={`${secao.value}-${c.nome}`} className="text-sm">
                          <TableCell className="pl-6">{c.nome}</TableCell>
                          <TableCell className="text-right font-medium">{fmtCurrency(c.valor)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {receitasTotal > 0 ? `${((c.valor / receitasTotal) * 100).toFixed(1)}%` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
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
