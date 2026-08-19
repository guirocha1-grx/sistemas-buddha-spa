import { useEffect, useMemo, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BookOpenCheck, Megaphone, Save, Search } from "lucide-react";
import { toast } from "sonner";

function moeda(valor: string | null) {
  if (valor === null) return "A confirmar";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Tabela() {
  const { unidadeSelecionada } = useUnidade();
  const [aba, setAba] = useState<"precos" | "campanha">("precos");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<"todas" | "Bem-Estar" | "Estética">("todas");
  const [textoCampanha, setTextoCampanha] = useState("");
  const filtro = useMemo(() => ({
    unidadeId: unidadeSelecionada?.id ?? 0,
    busca: busca.trim() || undefined,
    categoria: categoria === "todas" ? undefined : categoria,
  }), [busca, categoria, unidadeSelecionada?.id]);
  const tabela = trpc.tabelaPrecos.list.useQuery(filtro, { enabled: Boolean(unidadeSelecionada?.id) });
  const campanha = trpc.tabelaPrecos.campanhaMes.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0 },
    { enabled: Boolean(unidadeSelecionada?.id) },
  );
  const utils = trpc.useUtils();
  const salvarCampanha = trpc.tabelaPrecos.salvarCampanhaMes.useMutation({
    onSuccess: () => {
      toast.success("Campanha do Mês atualizada.");
      utils.tabelaPrecos.campanhaMes.invalidate({ unidadeId: unidadeSelecionada?.id ?? 0 });
    },
    onError: (erro) => toast.error(erro.message),
  });

  useEffect(() => {
    setTextoCampanha(campanha.data?.campanha?.conteudo ?? "");
  }, [campanha.data?.campanha?.id, campanha.data?.campanha?.conteudo, unidadeSelecionada?.id]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-[#8d6a2b]/30 bg-gradient-to-br from-[#4d1d26] via-[#622530] to-[#35131a] text-white shadow-lg">
        <div className="flex flex-col gap-5 p-6 md:flex-row md:items-end md:justify-between md:p-8">
          <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#ebcf88]"><BookOpenCheck className="h-4 w-4" /> Consulta comercial</div><h1 className="mt-2 text-3xl leading-none md:text-4xl" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Tabela de Preços</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/75">Valores oficiais para consulta manual da equipe.</p></div>
          <Badge className="w-fit border border-white/15 bg-white/10 text-white hover:bg-white/10">{unidadeSelecionada?.nome ?? "Selecione uma unidade"}</Badge>
        </div>
      </section>

      <Card className="border-[#d9c7a1]/70 shadow-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap gap-2 border-b border-[#eadfca] pb-3">
            <Button variant={aba === "precos" ? "default" : "outline"} size="sm" onClick={() => setAba("precos")}><BookOpenCheck className="mr-1.5 h-4 w-4" />Tabela de Preços</Button>
            <Button variant={aba === "campanha" ? "default" : "outline"} size="sm" onClick={() => setAba("campanha")}><Megaphone className="mr-1.5 h-4 w-4" />Campanha do Mês</Button>
          </div>
          {aba === "precos" && <div className="gap-4 md:flex md:items-end md:justify-between"><div><CardTitle className="text-xl" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Serviços e valores</CardTitle><CardDescription>{tabela.data?.length ?? 0} registro(s) encontrado(s)</CardDescription></div><div className="w-full md:max-w-md"><label className="relative block"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Pesquisar por serviço" /></label></div></div>}
          {aba === "campanha" && <div><CardTitle className="text-xl" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Campanha do Mês</CardTitle><CardDescription>Conteúdo comercial atual da {unidadeSelecionada?.nome ?? "unidade"}.</CardDescription></div>}
        </CardHeader>
        <CardContent className="space-y-4">
          {aba === "precos" && <>
            <div className="flex flex-wrap gap-2">{(["todas", "Bem-Estar", "Estética"] as const).map((item) => <button key={item} onClick={() => setCategoria(item)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${categoria === item ? "border-[#8a6227] bg-[#f7edd8] text-[#593514]" : "border-border bg-background text-muted-foreground hover:bg-muted"}`}>{item === "todas" ? "Todas as categorias" : item}</button>)}</div>
            {!unidadeSelecionada && <p className="py-8 text-center text-sm text-muted-foreground">Selecione uma unidade no topo da tela para consultar a tabela.</p>}
            {unidadeSelecionada && tabela.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Carregando tabela de preços...</p>}
            {unidadeSelecionada && !tabela.isLoading && (tabela.data?.length ?? 0) === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum preço ativo foi encontrado para este filtro.</p>}
            {(tabela.data?.length ?? 0) > 0 && <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow className="bg-[#fbf7ee]"><TableHead>Serviço</TableHead><TableHead>Categoria</TableHead><TableHead className="text-right">Duração</TableHead><TableHead className="text-right">Seg–Sáb</TableHead><TableHead className="text-right">Domingo</TableHead></TableRow></TableHeader><TableBody>{tabela.data?.map((item) => <TableRow key={item.id}><TableCell className="font-medium">{item.servico}</TableCell><TableCell><Badge variant="outline" className="text-[10px]">{item.categoria}</Badge></TableCell><TableCell className="text-right text-muted-foreground">{item.duracaoMinutos ? `${item.duracaoMinutos} min` : "—"}</TableCell><TableCell className="text-right font-medium">{moeda(item.precoSemana)}</TableCell><TableCell className="text-right font-medium">{moeda(item.precoDomingo)}</TableCell></TableRow>)}</TableBody></Table></div>}
          </>}
          {aba === "campanha" && <>
            {!unidadeSelecionada && <p className="py-8 text-center text-sm text-muted-foreground">Selecione uma unidade no topo da tela para consultar a campanha.</p>}
            {unidadeSelecionada && campanha.isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Carregando campanha...</p>}
            {unidadeSelecionada && !campanha.isLoading && <div className="space-y-4">
              <div className="rounded-lg border border-[#d9c7a1] bg-[#fffaf0] p-3 text-sm text-[#593514]"><span className="font-semibold">Variável para Fluxos:</span> <code className="rounded bg-white px-1.5 py-0.5">{'{{campanha_do_mes}}'}</code><span className="ml-2 text-muted-foreground">O fluxo sempre usa o conteúdo atual desta unidade no momento do envio.</span></div>
              {campanha.data?.podeEditar ? <>
                <Textarea value={textoCampanha} onChange={(event) => setTextoCampanha(event.target.value)} rows={12} maxLength={20000} placeholder="Escreva aqui a promoção, condição comercial ou campanha vigente da unidade..." />
                <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{textoCampanha.length}/20.000 caracteres</p><Button disabled={!textoCampanha.trim() || salvarCampanha.isPending} onClick={() => salvarCampanha.mutate({ unidadeId: unidadeSelecionada.id, conteudo: textoCampanha })}>{salvarCampanha.isPending ? "Salvando..." : <><Save className="mr-1.5 h-4 w-4" />Salvar Campanha do Mês</>}</Button></div>
              </> : <div className="rounded-lg border bg-muted/30 p-4"><p className="whitespace-pre-wrap text-sm leading-6">{campanha.data?.campanha?.conteudo || "Nenhuma campanha cadastrada para esta unidade."}</p><p className="mt-4 text-xs text-muted-foreground">Você pode consultar esta campanha e usá-la nos fluxos. A edição é restrita à permissão “Gerenciar Campanha do Mês”.</p></div>}
            </div>}
          </>}
        </CardContent>
      </Card>
    </div>
  );
}
