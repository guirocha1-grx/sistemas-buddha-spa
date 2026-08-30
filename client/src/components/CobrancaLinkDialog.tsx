import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Ban, CheckCircle2, CreditCard, FileText, Loader2, MessageSquareText, Send } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { parcelamentoForaDoPadrao } from "@shared/cobrancaParcelamento";

type FormaPagamento = "Não especificada" | "Pix" | "Cartão" | "Pix ou cartão";

const FORMAS_PAGAMENTO: FormaPagamento[] = ["Não especificada", "Pix", "Cartão", "Pix ou cartão"];

function valorParaInput(valor: number | string | null | undefined) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero.toFixed(2).replace(".", ",") : "";
}

function lerValor(valor: string): number | null {
  const normalizado = valor.trim().replace(/\./g, "").replace(",", ".");
  const numero = Number(normalizado);
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero * 100) / 100 : null;
}

function formatarBrl(valor: number | null) {
  return valor === null ? "valor a confirmar" : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function primeiroNome(nome: string) {
  return nome.trim().split(/\s+/)[0] || "cliente";
}

function montarTextoPadrao(clienteNome: string, titulo: string, valor: number | null) {
  const referencia = titulo.trim() || "seu atendimento";
  return `Olá, ${primeiroNome(clienteNome)}. Segue o Link de Pagamento referente a ${referencia}, no valor de ${formatarBrl(valor)}.\n\nAssim que o pagamento for confirmado, podemos seguir com o agendamento ou voucher.`;
}

export function CobrancaLinkDialog({ open, onOpenChange, conversaId, unidadeId, clienteNome, ehGrupo }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversaId: number | null;
  unidadeId: number | undefined;
  clienteNome: string;
  ehGrupo: boolean;
}) {
  const utils = trpc.useUtils();
  const [aba, setAba] = useState("manual");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valorTexto, setValorTexto] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>("Não especificada");
  const [parcelas, setParcelas] = useState(1);
  const [textoWhatsapp, setTextoWhatsapp] = useState("");
  const [textoEditado, setTextoEditado] = useState(false);
  const [confirmarEnvio, setConfirmarEnvio] = useState(false);
  const [confirmarCancelamento, setConfirmarCancelamento] = useState(false);
  const [mostrarJustificativa, setMostrarJustificativa] = useState(false);
  const [motivoExcecao, setMotivoExcecao] = useState("");
  const [autorizadorExcecao, setAutorizadorExcecao] = useState("");
  const inicializado = useRef(false);
  const valor = useMemo(() => lerValor(valorTexto), [valorTexto]);

  const configuracao = trpc.cobrancasLink.configuracao.useQuery(
    { unidadeId: unidadeId ?? 0 },
    { enabled: open && !!unidadeId && !ehGrupo },
  );
  const modelos = trpc.cobrancasLink.modelos.list.useQuery(
    { unidadeId: unidadeId ?? 0 },
    { enabled: open && !!unidadeId && !ehGrupo },
  );
  const cobrancaAberta = trpc.cobrancasLink.aberta.useQuery(
    { conversaId: conversaId ?? 0 },
    { enabled: open && !!conversaId && !ehGrupo },
  );
  const extrairConversa = trpc.cobrancasLink.extrairDaConversa.useMutation({
    onSuccess: (dados) => {
      if (dados.titulo) setTitulo(dados.titulo);
      if (dados.descricao) setDescricao(dados.descricao);
      if (dados.valor) setValorTexto(valorParaInput(dados.valor));
      if (dados.formaPagamentoMencionada && FORMAS_PAGAMENTO.includes(dados.formaPagamentoMencionada as FormaPagamento)) {
        setFormaPagamento(dados.formaPagamentoMencionada as FormaPagamento);
      }
      setTextoEditado(false);
      setAba("manual");
      toast.success(dados.valor ? "Dados sugeridos pela conversa. Revise antes de enviar." : "Dados parciais sugeridos. Informe o valor antes de enviar.");
    },
    onError: (erro) => toast.error(erro.message),
  });
  const criarEEnviar = trpc.cobrancasLink.criarEEnviar.useMutation({
    onSuccess: ({ reutilizada }) => {
      toast.success(reutilizada ? "Link existente reenviado ao cliente." : "Link criado e enviado ao cliente.");
      if (conversaId) {
        utils.inbox.mensagens.listPaginada.invalidate({ conversaId });
        utils.cobrancasLink.aberta.invalidate({ conversaId });
      }
      utils.inbox.conversas.list.invalidate();
      onOpenChange(false);
    },
    onError: (erro) => toast.error(`Não foi possível enviar a cobrança: ${erro.message}`),
  });
  const cancelarLink = trpc.cobrancasLink.cancelar.useMutation({
    onSuccess: () => {
      toast.success("Link cancelado. Já dá pra criar uma nova cobrança para este cliente.");
      if (conversaId) utils.cobrancasLink.aberta.invalidate({ conversaId });
      setConfirmarCancelamento(false);
    },
    onError: (erro) => toast.error(`Não foi possível cancelar o Link: ${erro.message}`),
  });

  useEffect(() => {
    if (!open) {
      inicializado.current = false;
      setConfirmarEnvio(false);
      setConfirmarCancelamento(false);
      setMostrarJustificativa(false);
      setMotivoExcecao("");
      setAutorizadorExcecao("");
      return;
    }
    if (inicializado.current) return;
    setAba("manual");
    setTitulo("");
    setDescricao("");
    setValorTexto("");
    setFormaPagamento("Não especificada");
    setParcelas(1);
    setTextoWhatsapp(montarTextoPadrao(clienteNome, "", null));
    setTextoEditado(false);
    inicializado.current = true;
  }, [open, clienteNome]);

  useEffect(() => {
    if (!textoEditado && open && !cobrancaAberta.data) setTextoWhatsapp(montarTextoPadrao(clienteNome, titulo, valor));
  }, [clienteNome, cobrancaAberta.data, open, textoEditado, titulo, valor]);

  function selecionarModelo(modelo: { titulo: string; descricao: string | null; valor: string; formaPagamentoInformada: string | null; parcelas: number }) {
    setTitulo(modelo.titulo);
    setDescricao(modelo.descricao ?? "");
    setValorTexto(valorParaInput(modelo.valor));
    if (FORMAS_PAGAMENTO.includes(modelo.formaPagamentoInformada as FormaPagamento)) setFormaPagamento(modelo.formaPagamentoInformada as FormaPagamento);
    setParcelas(modelo.parcelas);
    setTextoEditado(false);
    setAba("manual");
  }

  const existeAberta = Boolean(cobrancaAberta.data);
  const pronta = Boolean(conversaId && unidadeId && titulo.trim().length >= 2 && valor && textoWhatsapp.trim().length >= 2);
  const integracaoPronta = Boolean(configuracao.data?.mercadoPagoConfigurado && configuracao.data?.webhookConfigurado);
  const podeProsseguir = existeAberta ? Boolean(conversaId && textoWhatsapp.trim().length >= 2 && integracaoPronta) : pronta && integracaoPronta;

  const valorEfetivo = existeAberta ? Number(cobrancaAberta.data?.valor ?? 0) : (valor ?? 0);
  const parcelasEfetivas = existeAberta ? (cobrancaAberta.data?.parcelas ?? 1) : parcelas;
  const foraDoPadrao = valorEfetivo > 0 && parcelamentoForaDoPadrao(valorEfetivo, parcelasEfetivas);
  const justificativaPronta = motivoExcecao.trim().length >= 3 && autorizadorExcecao.trim().length >= 2;

  function enviar() {
    if (!conversaId || !valor) return;
    criarEEnviar.mutate({
      conversaId,
      titulo: existeAberta ? cobrancaAberta.data!.titulo : titulo.trim(),
      descricao: existeAberta ? undefined : (descricao.trim() || undefined),
      valor: existeAberta ? Number(cobrancaAberta.data!.valor) : valor,
      formaPagamentoInformada: formaPagamento,
      parcelas: existeAberta ? cobrancaAberta.data!.parcelas : parcelas,
      excecaoParcelamento: foraDoPadrao ? { motivo: motivoExcecao.trim(), autorizador: autorizadorExcecao.trim() } : undefined,
      textoWhatsapp: textoWhatsapp.trim(),
      reutilizarCobrancaAberta: existeAberta,
      confirmarCriacaoEEnvio: true,
    });
    setConfirmarEnvio(false);
  }

  // Fora do padrão (parcela abaixo de R$100 ou acima de 3x) pede a
  // justificativa antes da confirmação — não trava o envio, só exige
  // motivo + autorizador antes de seguir pra revisão final.
  function iniciarEnvio() {
    if (foraDoPadrao && !justificativaPronta) {
      setMostrarJustificativa(true);
      return;
    }
    setConfirmarEnvio(true);
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><CreditCard className="h-4 w-4" /></span><DialogTitle className="font-serif text-2xl">Cobrar cliente</DialogTitle></div>
        <DialogDescription>O Link só será criado e enviado após sua confirmação. Revise todas as informações antes de prosseguir.</DialogDescription>
      </DialogHeader>

      {ehGrupo ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle className="mr-2 inline h-4 w-4" />Cobranças por Link só podem ser feitas em conversas individuais.</div> : (
        <div className="space-y-4">
          {!configuracao.isLoading && !integracaoPronta && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"><AlertTriangle className="mr-2 inline h-4 w-4" />Antes de criar um Link, um administrador precisa configurar o Access Token, a URL HTTPS e a assinatura secreta do Webhook Mercado Pago desta unidade.</div>}

          {existeAberta ? <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/[0.035] p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="font-medium">Já existe um Link aberto para este cliente</p><p className="mt-0.5 text-xs text-muted-foreground">Para evitar duas cobranças para a mesma negociação, o sistema vai reutilizar o Link já criado.</p></div><Badge variant="outline" className="border-primary/30 text-primary">{cobrancaAberta.data?.status}</Badge></div>
            <div className="grid gap-2 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Referência:</span> {cobrancaAberta.data?.titulo}</p><p><span className="text-muted-foreground">Valor:</span> {formatarBrl(Number(cobrancaAberta.data?.valor))}</p><p><span className="text-muted-foreground">Parcelas:</span> {(cobrancaAberta.data?.parcelas ?? 1) > 1 ? `até ${cobrancaAberta.data?.parcelas}x` : "à vista"}</p></div>
            <Button type="button" variant="outline" size="sm" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => setConfirmarCancelamento(true)} disabled={cancelarLink.isPending}>{cancelarLink.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Ban className="mr-1.5 h-3.5 w-3.5" />}Cancelar Link</Button>
          </div> : <Tabs value={aba} onValueChange={setAba}>
            <TabsList className="grid h-auto w-full grid-cols-3">
              <TabsTrigger value="manual" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" />Manual</TabsTrigger>
              <TabsTrigger value="conversa" className="gap-1.5 text-xs"><MessageSquareText className="h-3.5 w-3.5" />Trazer da conversa</TabsTrigger>
              <TabsTrigger value="modelos" className="gap-1.5 text-xs"><CreditCard className="h-3.5 w-3.5" />Itens recorrentes</TabsTrigger>
            </TabsList>
            <TabsContent value="conversa" className="mt-3 rounded-lg border bg-muted/20 p-4"><p className="text-sm font-medium">Sugerir dados pelas últimas 10 mensagens</p><p className="mt-1 text-xs text-muted-foreground">A IA apenas sugere título, descrição, valor explícito e forma de pagamento mencionada. Nenhum Link é criado nesta etapa.</p><Button type="button" className="mt-3" size="sm" onClick={() => conversaId && extrairConversa.mutate({ conversaId })} disabled={!conversaId || extrairConversa.isPending}>{extrairConversa.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MessageSquareText className="mr-2 h-4 w-4" />}Trazer dados da conversa</Button></TabsContent>
            <TabsContent value="modelos" className="mt-3 rounded-lg border bg-muted/20 p-3"><p className="mb-2 text-xs text-muted-foreground">Os itens apenas preenchem o formulário; cada cliente recebe seu próprio Link.</p>{modelos.isLoading ? <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando itens...</p> : modelos.data?.length ? <div className="grid gap-2 sm:grid-cols-2">{modelos.data.map((modelo) => <button type="button" key={modelo.id} className="rounded-lg border bg-background p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/[0.025]" onClick={() => selecionarModelo(modelo)}><p className="text-sm font-medium">{modelo.titulo}</p><p className="mt-0.5 text-xs text-muted-foreground">{formatarBrl(Number(modelo.valor))}{modelo.formaPagamentoInformada ? ` · ${modelo.formaPagamentoInformada}` : ""}</p></button>)}</div> : <p className="text-sm text-muted-foreground">Nenhum item recorrente cadastrado para esta unidade.</p>}</TabsContent>
          </Tabs>}

          {!existeAberta && <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="cobranca-titulo">Item ou serviço</Label><Input id="cobranca-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Mini Day Spa" /></div>
            <div className="space-y-1.5"><Label htmlFor="cobranca-valor">Valor negociado</Label><Input id="cobranca-valor" inputMode="decimal" value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} placeholder="Ex.: 419,00" /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="cobranca-descricao">Descrição</Label><Textarea id="cobranca-descricao" rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Opcional: detalhe que aparecerá na cobrança" /></div>
            <div className="space-y-1.5"><Label htmlFor="cobranca-forma">Forma mencionada na conversa</Label><select id="cobranca-forma" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento)}>{FORMAS_PAGAMENTO.map((forma) => <option key={forma} value={forma}>{forma}</option>)}</select></div>
            <div className="space-y-1.5"><Label htmlFor="cobranca-parcelas">Parcelas no checkout</Label><select id="cobranca-parcelas" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50" value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? "À vista" : `Até ${n}x`}</option>)}</select>{foraDoPadrao && <p className="flex items-center gap-1 text-[11px] text-amber-700"><AlertTriangle className="h-3 w-3" />Fora do padrão (mín. R$100/parcela, máx. 3x) — vai pedir justificativa</p>}</div>
          </div>}

          <div className="space-y-1.5"><Label htmlFor="cobranca-texto">Mensagem para WhatsApp</Label><Textarea id="cobranca-texto" rows={4} value={textoWhatsapp} onChange={(e) => { setTextoWhatsapp(e.target.value); setTextoEditado(true); }} /><p className="text-xs text-muted-foreground">A URL segura do pagamento é incluída automaticamente no envio.</p></div>
          <div className="rounded-lg border border-primary/15 bg-primary/[0.035] p-3 text-sm"><p className="mb-1 flex items-center gap-1.5 font-medium text-primary"><CheckCircle2 className="h-4 w-4" />Prévia operacional</p><p>Cliente: <strong>{clienteNome || "Cliente"}</strong>{!existeAberta && <> · {titulo || "item a informar"} · {formatarBrl(valor)}</>}</p></div>
        </div>
      )}

      <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={criarEEnviar.isPending}>Cancelar</Button><Button type="button" disabled={!podeProsseguir || criarEEnviar.isPending} onClick={iniciarEnvio}>{criarEEnviar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{existeAberta ? "Reenviar Link existente" : "Criar e enviar Link"}</Button></DialogFooter>

      <Dialog open={mostrarJustificativa} onOpenChange={setMostrarJustificativa}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Exceção de parcelamento</DialogTitle>
            <DialogDescription>
              {parcelasEfetivas > 3 ? `Esse Link permite até ${parcelasEfetivas}x — acima do máximo padrão (3x).` : `Cada parcela ficaria abaixo de R$100 (${formatarBrl(valorEfetivo / parcelasEfetivas)}).`}
              {" "}Informe motivo e quem autorizou para seguir — um aviso será enviado ao grupo da recepção após o envio do Link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label htmlFor="excecao-motivo">Motivo</Label><Textarea id="excecao-motivo" rows={2} value={motivoExcecao} onChange={(e) => setMotivoExcecao(e.target.value)} placeholder="Ex.: Cliente antigo, negociação especial da gerência" /></div>
            <div className="space-y-1.5"><Label htmlFor="excecao-autorizador">Autorizador</Label><Input id="excecao-autorizador" value={autorizadorExcecao} onChange={(e) => setAutorizadorExcecao(e.target.value)} placeholder="Nome de quem autorizou" /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMostrarJustificativa(false)}>Voltar</Button>
            <Button type="button" disabled={!justificativaPronta} onClick={() => { setMostrarJustificativa(false); setConfirmarEnvio(true); }}>Continuar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmarEnvio} onOpenChange={setConfirmarEnvio}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle className="font-serif text-xl">Confirmar envio da cobrança</DialogTitle><DialogDescription>{existeAberta ? "Você irá reenviar o Link já aberto para este cliente." : "Você irá criar um novo Link individual no Mercado Pago e enviá-lo ao cliente."}</DialogDescription></DialogHeader><div className="rounded-lg bg-muted/50 p-3 text-sm"><p><strong>{existeAberta ? cobrancaAberta.data?.titulo : titulo}</strong></p><p className="mt-1 text-muted-foreground">{formatarBrl(existeAberta ? Number(cobrancaAberta.data?.valor) : valor)}</p>{foraDoPadrao && <p className="mt-2 flex items-center gap-1.5 text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />Exceção de parcelamento registrada — aviso será enviado à recepção.</p>}</div><DialogFooter><Button type="button" variant="outline" onClick={() => setConfirmarEnvio(false)}>Voltar para revisão</Button><Button type="button" onClick={enviar} disabled={criarEEnviar.isPending}>{criarEEnviar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Confirmar e enviar</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={confirmarCancelamento} onOpenChange={setConfirmarCancelamento}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle className="font-serif text-xl">Cancelar Link de pagamento</DialogTitle><DialogDescription>O Link atual deixa de funcionar e você poderá criar uma nova cobrança para este cliente. Essa ação não pode ser desfeita.</DialogDescription></DialogHeader><div className="rounded-lg bg-muted/50 p-3 text-sm"><p><strong>{cobrancaAberta.data?.titulo}</strong></p><p className="mt-1 text-muted-foreground">{formatarBrl(Number(cobrancaAberta.data?.valor))}</p></div><DialogFooter><Button type="button" variant="outline" onClick={() => setConfirmarCancelamento(false)}>Voltar</Button><Button type="button" variant="destructive" onClick={() => cobrancaAberta.data && cancelarLink.mutate({ cobrancaId: cobrancaAberta.data.id })} disabled={cancelarLink.isPending}>{cancelarLink.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Ban className="mr-2 h-4 w-4" />}Cancelar Link</Button></DialogFooter></DialogContent>
      </Dialog>
    </DialogContent>
  </Dialog>;
}
