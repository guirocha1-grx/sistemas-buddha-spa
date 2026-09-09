import { useMemo, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

function fmtCurrency(value: number) {
  const texto = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Math.abs(value));
  return value < 0 ? `(${texto})` : texto;
}

function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}

type LinhaCascata =
  | { tipo: "valor"; label: string; valor: number }
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
      { tipo: "valor", label: "Receita Bruta", valor: receitaBruta },
      { tipo: "valor", label: "(−) Impostos", valor: -impostos },
      { tipo: "subtotal", label: "= Receita Líquida", valor: receitaLiquida },
      { tipo: "valor", label: "(−) Custos Diretos", valor: -custosDiretos },
      { tipo: "valor", label: "(+) Devoluções (abate Custos/Despesas)", valor: devolucoes },
      { tipo: "subtotal", label: "= Lucro Bruto", valor: lucroBruto },
      { tipo: "valor", label: "(−) Despesas com Pessoal", valor: -despesasPessoal },
      { tipo: "valor", label: "(−) Marketing", valor: -marketing },
      { tipo: "valor", label: "(−) Despesas Administrativas", valor: -despesasAdministrativas },
      { tipo: "valor", label: "(−) Despesas Financeiras", valor: -despesasFinanceiras },
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
          <input type="month" className="flex h-9 w-36 rounded-md border border-input bg-background px-3 py-1 text-sm mt-1"
            value={mesInicio} onChange={(e) => setMesInicio(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Mês fim</label>
          <input type="month" className="flex h-9 w-36 rounded-md border border-input bg-background px-3 py-1 text-sm mt-1"
            value={mesFim} onChange={(e) => setMesFim(e.target.value)} />
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
                {cascata.map((linha) => (
                  <TableRow key={linha.label} className={linha.tipo === "subtotal" ? "bg-muted/40 border-t-2 border-t-foreground/20" : "text-sm"}>
                    <TableCell className={linha.tipo === "subtotal" ? "font-semibold" : ""}>{linha.label}</TableCell>
                    <TableCell className={`text-right ${linha.tipo === "subtotal" ? "font-bold" : "font-medium"} ${linha.valor < 0 ? "text-rose-700" : ""}`}>
                      {fmtCurrency(linha.valor)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {receitaBruta > 0 ? `${((linha.valor / receitaBruta) * 100).toFixed(1)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
