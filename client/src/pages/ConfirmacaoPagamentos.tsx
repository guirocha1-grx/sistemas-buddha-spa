import UnidadeSelector from "@/components/UnidadeSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, CreditCard, Landmark, Loader2, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type PixResultado = {
  dataInicio: string;
  dataFim: string;
  consultaEm: string;
  totalConsultado: number;
  pagamentos: Array<{ idTransacao: string; dataHora: string; valor: string; pagador: string | null; cpfCnpjPagador: string | null; descricao: string | null; endToEndId: string | null }>;
};

type LinkResultado = {
  dataInicio: string;
  dataFim: string;
  consultaEm: string;
  totalConsultado: number;
  novasVendas: number;
  pagamentos: Array<{ idPagamento: string; dataHora: string; valorBruto: string | null; valorLiquido: string | null; parcelas: number | null; formaPagamento: string | null; pagador: string | null; identificacaoPagador: string | null; descricao: string | null }>;
};

function moeda(valor: string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(valor ?? 0));
}

function dataHora(valor: string | null | undefined) {
  if (!valor) return "—";
  const data = new Date(valor);
  if (!Number.isNaN(data.getTime())) return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  return valor.replace("T", " ").slice(0, 16);
}

function mascaraDocumento(valor: string | null) {
  if (!valor) return "—";
  return valor.length > 4 ? `••••${valor.slice(-4)}` : valor;
}

export default function ConfirmacaoPagamentos() {
  const { unidadeSelecionada } = useUnidade();
  const unidadeId = unidadeSelecionada?.id;
  const [pixResultado, setPixResultado] = useState<PixResultado | null>(null);
  const [linksResultado, setLinksResultado] = useState<LinkResultado | null>(null);
  const [buscaPix, setBuscaPix] = useState("");
  const [buscaLinks, setBuscaLinks] = useState("");

  const sincronizarPix = trpc.confirmacaoPagamentos.sincronizarPixInter.useMutation({
    onSuccess: (resultado) => {
      setPixResultado(resultado);
      toast.success(`${resultado.pagamentos.length} Pix recebido(s) encontrado(s) nas últimas 48 horas.`);
    },
    onError: (erro) => toast.error(`Não foi possível consultar o Banco Inter: ${erro.message}`),
  });
  const sincronizarLinks = trpc.confirmacaoPagamentos.sincronizarLinksMercadoPago.useMutation({
    onSuccess: (resultado) => {
      setLinksResultado(resultado);
      toast.success(`${resultado.pagamentos.length} pagamento(s) por Link encontrado(s) nas últimas 48 horas.`);
    },
    onError: (erro) => toast.error(`Não foi possível consultar os Links Mercado Pago: ${erro.message}`),
  });

  const pixFiltrados = useMemo(() => {
    const termo = buscaPix.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return pixResultado?.pagamentos ?? [];
    return (pixResultado?.pagamentos ?? []).filter((pagamento) =>
      [pagamento.pagador, pagamento.cpfCnpjPagador, pagamento.valor, pagamento.descricao]
        .filter(Boolean).some((valor) => valor!.toLocaleLowerCase("pt-BR").includes(termo)),
    );
  }, [buscaPix, pixResultado]);
  const linksFiltrados = useMemo(() => {
    const termo = buscaLinks.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return linksResultado?.pagamentos ?? [];
    return (linksResultado?.pagamentos ?? []).filter((pagamento) =>
      [pagamento.pagador, pagamento.identificacaoPagador, pagamento.valorBruto, pagamento.formaPagamento, pagamento.descricao, pagamento.idPagamento]
        .filter(Boolean).some((valor) => valor!.toLocaleLowerCase("pt-BR").includes(termo)),
    );
  }, [buscaLinks, linksResultado]);

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-primary"><ShieldCheck className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-[0.16em]">Recepção</span></div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Confirmação de Pagamento</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">Consulte no momento do atendimento os pagamentos confirmados nas últimas 48 horas. Maquininha não aparece aqui porque o comprovante é emitido diretamente na loja.</p>
      </div>
      <UnidadeSelector />
    </header>

    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="overflow-hidden border-primary/15 shadow-sm">
        <CardHeader className="border-b bg-primary/[0.035] pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"><div><div className="mb-2 flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Landmark className="h-4 w-4" /></span><Badge variant="outline" className="border-primary/25 text-primary">Banco Inter</Badge></div><CardTitle className="font-serif text-2xl">Pix recebidos</CardTitle><CardDescription className="mt-1">Créditos Pix identificados na conta da unidade.</CardDescription></div><Button onClick={() => unidadeId && sincronizarPix.mutate({ unidadeId })} disabled={!unidadeId || sincronizarPix.isPending} className="w-full sm:w-auto sm:shrink-0"><RefreshCw className={`mr-2 h-4 w-4 ${sincronizarPix.isPending ? "animate-spin" : ""}`} />Sincronizar Pix</Button></div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          {pixResultado ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><span><strong className="text-foreground">{pixResultado.pagamentos.length}</strong> confirmação(ões)</span><span>Consulta: {dataHora(pixResultado.consultaEm)}</span><span>Janela: {pixResultado.dataInicio} a {pixResultado.dataFim}</span></div> : <p className="text-sm text-muted-foreground">Sincronize para consultar pagamentos Pix recentes desta unidade.</p>}
          {pixResultado && <><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={buscaPix} onChange={(event) => setBuscaPix(event.target.value)} className="pl-9" placeholder="Buscar por nome, CPF ou valor" /></div><div className="max-h-[420px] overflow-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Recebido em</TableHead><TableHead>Pagador</TableHead><TableHead>Valor</TableHead></TableRow></TableHeader><TableBody>{pixFiltrados.length ? pixFiltrados.map((pagamento) => <TableRow key={pagamento.idTransacao}><TableCell className="whitespace-nowrap text-xs">{dataHora(pagamento.dataHora)}</TableCell><TableCell><p className="font-medium">{pagamento.pagador ?? "Não informado"}</p><p className="text-xs text-muted-foreground">CPF/CNPJ {mascaraDocumento(pagamento.cpfCnpjPagador)}</p></TableCell><TableCell className="whitespace-nowrap font-semibold text-emerald-700">{moeda(pagamento.valor)}</TableCell></TableRow>) : <TableRow><TableCell colSpan={3} className="h-24 text-center text-sm text-muted-foreground">Nenhum Pix encontrado para a busca informada.</TableCell></TableRow>}</TableBody></Table></div></>}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-primary/15 shadow-sm">
        <CardHeader className="border-b bg-primary/[0.035] pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"><div><div className="mb-2 flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><CreditCard className="h-4 w-4" /></span><Badge variant="outline" className="border-primary/25 text-primary">Mercado Pago</Badge></div><CardTitle className="font-serif text-2xl">Links de pagamento</CardTitle><CardDescription className="mt-1">Somente pagamentos aprovados por Link, sem vendas de maquininha.</CardDescription></div><Button onClick={() => unidadeId && sincronizarLinks.mutate({ unidadeId })} disabled={!unidadeId || sincronizarLinks.isPending} className="w-full sm:w-auto sm:shrink-0"><RefreshCw className={`mr-2 h-4 w-4 ${sincronizarLinks.isPending ? "animate-spin" : ""}`} />Sincronizar Links</Button></div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          {linksResultado ? <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"><span><strong className="text-foreground">{linksResultado.pagamentos.length}</strong> confirmação(ões)</span><span>Consulta: {dataHora(linksResultado.consultaEm)}</span><span>{linksResultado.novasVendas} novo(s) registro(s) no CRM</span></div> : <p className="text-sm text-muted-foreground">Sincronize para consultar pagamentos por Link recentes desta unidade.</p>}
          {linksResultado && <><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={buscaLinks} onChange={(event) => setBuscaLinks(event.target.value)} className="pl-9" placeholder="Buscar por cliente, CPF, valor, forma ou ID" /></div><div className="max-h-[420px] overflow-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Aprovado em</TableHead><TableHead>Pagador</TableHead><TableHead>Valor</TableHead><TableHead>Forma</TableHead></TableRow></TableHeader><TableBody>{linksFiltrados.length ? linksFiltrados.map((pagamento) => <TableRow key={pagamento.idPagamento}><TableCell className="whitespace-nowrap text-xs">{dataHora(pagamento.dataHora)}</TableCell><TableCell><p className="font-medium">{pagamento.pagador ?? "Não informado"}</p><p className="text-xs text-muted-foreground">CPF/CNPJ {mascaraDocumento(pagamento.identificacaoPagador)}</p></TableCell><TableCell className="whitespace-nowrap font-semibold text-emerald-700">{moeda(pagamento.valorBruto)}</TableCell><TableCell><p className="capitalize">{pagamento.formaPagamento?.replaceAll("_", " ") ?? "—"}</p>{pagamento.parcelas ? <p className="text-xs text-muted-foreground">{pagamento.parcelas}x</p> : null}</TableCell></TableRow>) : <TableRow><TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">Nenhum pagamento por Link encontrado para a busca informada.</TableCell></TableRow>}</TableBody></Table></div></>}
        </CardContent>
      </Card>
    </div>

    <div className="flex gap-3 rounded-xl border border-primary/15 bg-primary/[0.035] p-4 text-sm text-muted-foreground"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p>As consultas são feitas para a <strong className="text-foreground">unidade selecionada</strong>. Use o nome, CPF/CNPJ parcial, valor e data para confirmar com o cliente. A seção não altera pagamentos, nem inclui vendas presenciais de maquininha.</p></div>
  </div>;
}
