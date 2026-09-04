import { useEffect, useMemo, useState } from "react";
import UnidadeSelector from "@/components/UnidadeSelector";
import { CampoBuscaLista } from "@/components/CampoBuscaLista";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { Clock3, ListTodo, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

function formatarDataSessao(iso: string): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  const texto = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(data);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function faz(createdAt: string | Date): string {
  const minutos = Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos}min`;
  const horas = Math.round(minutos / 60);
  return `há ${horas}h`;
}

export default function ListaEspera() {
  const { unidadeSelecionada } = useUnidade();
  const unidadeId = unidadeSelecionada?.id;
  const utils = trpc.useUtils();

  const [dataSelecionada, setDataSelecionada] = useState<string | null>(null);
  const [conversao, setConversao] = useState<{ id: number; conversaId: number | null; clienteNome: string; data: string; horario: string; servico: string; observacao: string | null } | null>(null);

  // Mesmo padrão do Inbox (Mensagens.tsx) pro campo de serviço — quanto mais
  // parecido com o form de agendamento de verdade, mais fácil vira um
  // agendamento depois. Só busca quando o diálogo de conversão realmente abre.
  const tabelaPrecosQuery = trpc.tabelaPrecos.list.useQuery(
    { unidadeId: unidadeId ?? 0 },
    { enabled: !!unidadeId && !!conversao },
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
                          <Badge variant="outline" className="shrink-0 border-amber-300 text-amber-700">plano</Badge>
                        ) : (
                          <span className="w-6 shrink-0 text-center text-xs text-muted-foreground">{indice + 1}</span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{pedido.clienteNome}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {pedido.terapiaDesejada || "Terapia não informada"}
                            {pedido.horarioDesejado ? ` · ${pedido.horarioDesejado}` : ""}
                            {" · "}{faz(pedido.createdAt)}
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
                <Input type="time" className="mt-1 h-8 text-xs" value={conversao.horario} onChange={(e) => setConversao({ ...conversao, horario: e.target.value })} />
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
    </div>
  );
}
