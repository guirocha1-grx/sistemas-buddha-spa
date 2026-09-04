import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import UnidadeSelector from "@/components/UnidadeSelector";
import { chaveRascunhoConversa, rotaInboxConversa } from "@shared/inboxNavigation";
import { CampoBuscaLista } from "@/components/CampoBuscaLista";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { Clock3, Crown, ListTodo, Loader2, MessageCircle, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

function formatarDataSessao(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  const texto = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(data);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Data/hora do pedido — é o que decide a ordem dentro de cada grupo (plano ou não), por isso precisa aparecer explícito, não só "há Xh". */
function pedidoEm(createdAt: string | Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(createdAt));
}

function formatarDataMensagem(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  const diaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(data);
  return `${diaSemana}, ${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

/** Mensagem padrão pra avisar quem está na fila que abriu vaga — fica pronta na caixa de texto do Inbox, editável antes de enviar. */
function montarMensagemConfirmacaoVaga(nomeCliente: string, dataIso: string, horarioDesejado: string | null, terapiaDesejada: string | null): string {
  const primeiroNome = nomeCliente.trim().split(/\s+/)[0] || nomeCliente;
  let quando = formatarDataMensagem(dataIso);
  if (horarioDesejado) quando += `, às ${horarioDesejado}`;
  if (terapiaDesejada) quando += ` (${terapiaDesejada})`;
  return `Olá, ${primeiroNome}! Uma ótima notícia para o seu autocuidado: conseguimos disponibilizar o horário que você desejava para sua pausa. Está disponível: ${quando}.\n\n`
    + "Para respeitarmos o fluxo da nossa lista de espera, manteremos esse horário reservado para você por 30 minutos. Podemos confirmar o seu agendamento?";
}

export default function ListaEspera() {
  const [, setLocation] = useLocation();
  const { unidadeSelecionada } = useUnidade();
  const unidadeId = unidadeSelecionada?.id;
  const utils = trpc.useUtils();

  const [dataSelecionada, setDataSelecionada] = useState<string | null>(null);
  const [conversao, setConversao] = useState<{ id: number; conversaId: number | null; clienteNome: string; data: string; horario: string; servico: string; observacao: string | null } | null>(null);
  const [edicao, setEdicao] = useState<{ id: number; clienteNome: string; data: string; horarioDesejado: string; terapiaDesejada: string; observacao: string } | null>(null);

  // Mesmo padrão do Inbox (Mensagens.tsx) pro campo de serviço — quanto mais
  // parecido com o form de agendamento de verdade, mais fácil vira um
  // agendamento depois. Só busca quando algum diálogo que usa o campo abre.
  const tabelaPrecosQuery = trpc.tabelaPrecos.list.useQuery(
    { unidadeId: unidadeId ?? 0 },
    { enabled: !!unidadeId && (!!conversao || !!edicao) },
  );
  const [filtroServicoSegSab, setFiltroServicoSegSab] = useState(true);
  const [filtroServicoDomFer, setFiltroServicoDomFer] = useState(false);
  const nomesServicos = useMemo(() => {
    const nomes = new Set<string>();
    for (const item of tabelaPrecosQuery.data ?? []) {
      const ehDom = /\bdom\.?$/i.test(item.servico.trim());
      if (filtroServicoSegSab && !ehDom) nomes.add(item.servico);
      if (filtroServicoDomFer) nomes.add(ehDom ? item.servico : `${item.servico} Dom`);
    }
    return Array.from(nomes);
  }, [tabelaPrecosQuery.data, filtroServicoSegSab, filtroServicoDomFer]);

  const datasQuery = trpc.listaEspera.datasAbertas.useQuery({ unidadeId: unidadeId ?? 0 }, { enabled: !!unidadeId });
  const datas = datasQuery.data ?? [];

  useEffect(() => {
    if (!dataSelecionada && datas.length > 0) setDataSelecionada(datas[0]);
    if (dataSelecionada && !datas.includes(dataSelecionada)) setDataSelecionada(datas[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datas.join(",")]);

  const filaQuery = trpc.listaEspera.porData.useQuery(
    { unidadeId: unidadeId ?? 0, data: dataSelecionada ?? "" },
    { enabled: !!unidadeId && !!dataSelecionada },
  );
  const fila = filaQuery.data ?? [];

  const invalidarTudo = () => {
    utils.listaEspera.datasAbertas.invalidate();
    utils.listaEspera.porData.invalidate();
  };

  const cancelarMutation = trpc.listaEspera.cancelar.useMutation({
    onSuccess: () => { invalidarTudo(); toast.success("Removido da lista de espera."); },
    onError: (e) => toast.error(e.message),
  });
  const marcarConvertidoMutation = trpc.listaEspera.marcarConvertido.useMutation({
    onSuccess: invalidarTudo,
    onError: (e) => toast.error(e.message),
  });
  const atualizarMutation = trpc.listaEspera.atualizar.useMutation({
    onSuccess: () => { invalidarTudo(); toast.success("Pedido atualizado."); setEdicao(null); },
    onError: (e) => toast.error(e.message),
  });
  const criarAtendimentoMutation = trpc.inbox.conversas.criarProximoAtendimento.useMutation({
    onSuccess: () => {
      if (conversao) marcarConvertidoMutation.mutate({ id: conversao.id });
      toast.success("Agendamento incluído — confirme a agenda de verdade com a unidade.");
      setConversao(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const totalNaFila = fila.length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <ListTodo className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-[0.16em]">Recepção</span>
          </div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Lista de espera</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Pedidos coletados no Inbox pra dias lotados. Quem tem plano ativo entra primeiro, na ordem em que pediu.</p>
        </div>
        <UnidadeSelector />
      </header>

      {datasQuery.isLoading ? (
        <Skeleton className="h-9 w-64" />
      ) : datas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <ListTodo className="mx-auto mb-3 h-10 w-10 text-muted-foreground/45" />
            <p className="font-medium">Nenhuma lista de espera aberta.</p>
            <p className="mt-1 text-sm text-muted-foreground">Pedidos entram por aqui a partir do Inbox, na conversa com o cliente.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {datas.map((data) => (
              <button
                key={data}
                type="button"
                onClick={() => setDataSelecionada(data)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${data === dataSelecionada ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground hover:bg-muted/50"}`}
              >
                {formatarDataSessao(data)}
              </button>
            ))}
          </div>

          {dataSelecionada && (
            <Card className="overflow-hidden border-primary/15 shadow-sm">
              <CardHeader className="border-b bg-primary/[0.035]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="font-serif text-2xl">{formatarDataSessao(dataSelecionada)}</CardTitle>
                    <CardDescription className="mt-1">{unidadeSelecionada?.nome ?? "Selecione uma unidade"}</CardDescription>
                  </div>
                  <Badge variant="outline" className="border-primary/25 text-primary">{totalNaFila} na fila</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {filaQuery.isLoading ? (
                  <div className="space-y-3 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                ) : fila.length === 0 ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">Todos os pedidos desse dia já foram atendidos ou removidos.</div>
                ) : (
                  <div className="divide-y">
                    {fila.map((pedido, indice) => (
                      <div
                        key={pedido.id}
                        className={`flex items-center gap-3 px-5 py-3 ${pedido.temPlanoAtivo ? "bg-amber-50/60 dark:bg-amber-950/10" : ""}`}
                      >
                        {pedido.temPlanoAtivo ? (
                          <Badge variant="outline" className="shrink-0 gap-1 border-amber-300 text-amber-700" title="Plano ativo — prioridade na fila">
                            <Crown className="h-3 w-3 fill-amber-500 text-amber-600" /> plano
                          </Badge>
                        ) : (
                          <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">{indice + 1}</span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{pedido.clienteNome}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {pedido.terapiaDesejada || "Terapia não informada"}
                            {pedido.horarioDesejado ? ` · ${pedido.horarioDesejado}` : ""}
                            {" · pedido em "}{pedidoEm(pedido.createdAt)}
                          </p>
                          {pedido.observacao && (
                            <p className="mt-0.5 truncate text-xs italic text-muted-foreground/80">{pedido.observacao}</p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          disabled={!pedido.conversaId}
                          title={pedido.conversaId ? undefined : "Pedido sem conversa vinculada"}
                          onClick={() => setConversao({
                            id: pedido.id,
                            conversaId: pedido.conversaId,
                            clienteNome: pedido.clienteNome,
                            data: dataSelecionada,
                            horario: "",
                            servico: pedido.terapiaDesejada ?? "",
                            observacao: pedido.observacao,
                          })}
                        >
                          <Clock3 className="mr-1.5 h-3.5 w-3.5" /> Transformar em agendamento
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                          disabled={!pedido.conversaId}
                          title={pedido.conversaId ? "Chamar no WhatsApp" : "Pedido sem conversa vinculada"}
                          onClick={() => {
                            if (!pedido.conversaId || !dataSelecionada) return;
                            const mensagem = montarMensagemConfirmacaoVaga(pedido.clienteNome, dataSelecionada, pedido.horarioDesejado, pedido.terapiaDesejada);
                            sessionStorage.setItem(chaveRascunhoConversa(pedido.conversaId), mensagem);
                            setLocation(rotaInboxConversa(pedido.conversaId));
                          }}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-muted-foreground"
                          title="Editar pedido"
                          onClick={() => setEdicao({
                            id: pedido.id,
                            clienteNome: pedido.clienteNome,
                            data: dataSelecionada,
                            horarioDesejado: pedido.horarioDesejado ?? "",
                            terapiaDesejada: pedido.terapiaDesejada ?? "",
                            observacao: pedido.observacao ?? "",
                          })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Remover da lista">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover {pedido.clienteNome} da lista?</AlertDialogTitle>
                              <AlertDialogDescription>Não cria nem cancela nenhum agendamento — só tira o pedido dessa fila.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Voltar</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive hover:bg-destructive/90" disabled={cancelarMutation.isPending} onClick={() => cancelarMutation.mutate({ id: pedido.id })}>
                                {cancelarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover"}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={!!conversao} onOpenChange={(aberto) => !aberto && setConversao(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Transformar em agendamento — {conversao?.clienteNome}</DialogTitle>
          </DialogHeader>
          {conversao && (
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Data</Label>
                <Input type="date" className="mt-1 h-8 text-xs" value={conversao.data} onChange={(e) => setConversao({ ...conversao, data: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Horário confirmado</Label>
                <Input type="time" step={300} className="mt-1 h-8 text-xs" value={conversao.horario} onChange={(e) => setConversao({ ...conversao, horario: e.target.value })} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                    <Checkbox checked={filtroServicoSegSab} onCheckedChange={(v) => setFiltroServicoSegSab(!!v)} className="h-3.5 w-3.5" />
                    Seg-Sáb
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                    <Checkbox checked={filtroServicoDomFer} onCheckedChange={(v) => setFiltroServicoDomFer(!!v)} className="h-3.5 w-3.5" />
                    Dom-Fer
                  </label>
                </div>
                <CampoBuscaLista
                  label="Terapia"
                  value={conversao.servico}
                  onChange={(v) => setConversao({ ...conversao, servico: v })}
                  valores={nomesServicos}
                  placeholder="Selecione ou digite"
                  id="lista-espera-conversao-servico"
                />
              </div>
              {conversao.observacao && (
                <div className="rounded-md border border-dashed p-2">
                  <p className="text-[10px] font-medium text-muted-foreground">Observação da fila</p>
                  <p className="mt-0.5 text-xs">{conversao.observacao}</p>
                </div>
              )}
              <Button
                size="sm"
                className="w-full h-7 text-xs"
                disabled={!conversao.conversaId || !conversao.horario || criarAtendimentoMutation.isPending}
                onClick={() => {
                  if (!conversao.conversaId) return;
                  criarAtendimentoMutation.mutate({
                    conversaId: conversao.conversaId,
                    dataAtendimento: conversao.data,
                    horario: conversao.horario,
                    servicoNome: conversao.servico.trim() || null,
                  });
                }}
              >
                {criarAtendimentoMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}Confirmar agendamento
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!edicao} onOpenChange={(aberto) => !aberto && setEdicao(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Editar pedido — {edicao?.clienteNome}</DialogTitle>
          </DialogHeader>
          {edicao && (
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Data</Label>
                <Input type="date" className="mt-1 h-8 text-xs" value={edicao.data} onChange={(e) => setEdicao({ ...edicao, data: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Horário desejado</Label>
                <Input type="time" step={300} className="mt-1 h-8 text-xs" value={edicao.horarioDesejado} onChange={(e) => setEdicao({ ...edicao, horarioDesejado: e.target.value })} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                    <Checkbox checked={filtroServicoSegSab} onCheckedChange={(v) => setFiltroServicoSegSab(!!v)} className="h-3.5 w-3.5" />
                    Seg-Sáb
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-pointer">
                    <Checkbox checked={filtroServicoDomFer} onCheckedChange={(v) => setFiltroServicoDomFer(!!v)} className="h-3.5 w-3.5" />
                    Dom-Fer
                  </label>
                </div>
                <CampoBuscaLista
                  label="Terapia"
                  value={edicao.terapiaDesejada}
                  onChange={(v) => setEdicao({ ...edicao, terapiaDesejada: v })}
                  valores={nomesServicos}
                  placeholder="Selecione ou digite"
                  id="lista-espera-edicao-servico"
                />
              </div>
              <div>
                <Label className="text-xs">Observação</Label>
                <Textarea className="mt-1 text-xs" rows={2} value={edicao.observacao} onChange={(e) => setEdicao({ ...edicao, observacao: e.target.value })} />
              </div>
              <Button
                size="sm"
                className="w-full h-7 text-xs"
                disabled={atualizarMutation.isPending}
                onClick={() => atualizarMutation.mutate({
                  id: edicao.id,
                  data: edicao.data,
                  horarioDesejado: edicao.horarioDesejado.trim() || undefined,
                  terapiaDesejada: edicao.terapiaDesejada.trim() || undefined,
                  observacao: edicao.observacao.trim() || undefined,
                })}
              >
                {atualizarMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}Salvar alterações
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
