import { ChamadoTerapeutaDialog } from "@/components/ChamadoTerapeutaDialog";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { BellRing, CalendarClock, Clock3, Loader2, MapPin, Trash2, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type AtendimentoSelecionado = {
  id: number;
  clienteId: number | null;
  clienteNome: string;
  horario: string | null;
  servicoNome: string | null;
  profissionalNome: string | null;
  terapeutaOrganizado: string | null;
  salaOrganizada: string | null;
  status: string;
};

function primeiroNome(nome: string | null) {
  return nome?.trim().split(/\s+/)[0] || "Não informado";
}

function dataHoje() {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).format(new Date());
}

export default function ProximosAtendimentos() {
  const { unidadeSelecionada } = useUnidade();
  const unidadeId = unidadeSelecionada?.id;
  const [selecionado, setSelecionado] = useState<AtendimentoSelecionado | null>(null);
  const atendimentosQuery = trpc.proximosAtendimentos.listarHoje.useQuery(
    { unidadeId: unidadeId ?? 0 },
    { enabled: !!unidadeId },
  );
  const opcoesQuery = trpc.proximosAtendimentos.opcoes.useQuery({ unidadeId: unidadeId ?? 0 }, { enabled: !!unidadeId });
  const utils = trpc.useUtils();
  const organizarMutation = trpc.proximosAtendimentos.organizar.useMutation({
    onSuccess: () => { utils.proximosAtendimentos.listarHoje.invalidate(); toast.success("Organização do atendimento atualizada."); },
    onError: (erro) => toast.error(`Não foi possível atualizar: ${erro.message}`),
  });
  const retirarMutation = trpc.proximosAtendimentos.retirar.useMutation({
    onSuccess: () => { utils.proximosAtendimentos.listarHoje.invalidate(); toast.success("Atendimento retirado apenas da lista operacional."); },
    onError: (erro) => toast.error(`Não foi possível retirar: ${erro.message}`),
  });
  const atendimentos = useMemo(() => (atendimentosQuery.data ?? []) as AtendimentoSelecionado[], [atendimentosQuery.data]);
  const terapeutas = opcoesQuery.data?.terapeutas ?? [];
  const salas = (opcoesQuery.data?.parametros ?? []).filter((item: any) => item.tipo === "sala");
  const atualizarOrganizacao = (atendimentoBelleId: number, dados: { terapeutaNome?: string | null; sala?: string | null }) => {
    if (!unidadeId) return;
    organizarMutation.mutate({ unidadeId, atendimentoBelleId, ...dados });
  };

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-primary"><CalendarClock className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-[0.16em]">Recepção</span></div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Próximos atendimentos</h1>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Atendimentos previstos para hoje, em ordem de horário. Abra o chamado diretamente na linha do cliente.</p>
      </div>
      <UnidadeSelector />
    </header>

    <Card className="overflow-hidden border-primary/15 shadow-sm">
      <CardHeader className="border-b bg-primary/[0.035]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><CardTitle className="font-serif text-2xl">Hoje</CardTitle><CardDescription className="mt-1 capitalize">{dataHoje()} · {unidadeSelecionada?.nome ?? "Selecione uma unidade"}</CardDescription></div>
          <Badge variant="outline" className="border-primary/25 text-primary">{atendimentos.length} atendimento(s)</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {atendimentosQuery.isLoading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, indice) => <Skeleton key={indice} className="h-16 w-full" />)}</div>
          : atendimentosQuery.isError ? <div className="p-8 text-center text-sm text-destructive">Não foi possível carregar os atendimentos de hoje.</div>
          : atendimentos.length === 0 ? <div className="p-10 text-center"><CalendarClock className="mx-auto mb-3 h-10 w-10 text-muted-foreground/45" /><p className="font-medium">Nenhum próximo atendimento para hoje.</p><p className="mt-1 text-sm text-muted-foreground">A lista é atualizada pela importação de atendimentos do Belle.</p></div>
          : <div className="divide-y">{atendimentos.map((atendimento) => <div key={atendimento.id} className="flex flex-col gap-4 p-4 sm:grid sm:grid-cols-[5rem_minmax(10rem,1fr)_minmax(9rem,0.75fr)_minmax(10rem,0.9fr)_auto] sm:items-center sm:gap-3 sm:px-5">
            <div className="flex w-20 shrink-0 items-center gap-2 text-primary"><Clock3 className="h-4 w-4" /><span className="font-serif text-xl font-semibold">{atendimento.horario || "—"}</span></div>
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{atendimento.clienteNome}</p><p className="mt-0.5 truncate text-sm text-muted-foreground">{atendimento.servicoNome || "Terapia não informada"}</p></div>
            <div className="min-w-0 space-y-1"><div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><UserRound className="h-3.5 w-3.5" />Terapeuta</div><Select value={atendimento.terapeutaOrganizado || "teorico"} onValueChange={(valor) => atualizarOrganizacao(atendimento.id, { terapeutaNome: valor === "teorico" ? null : valor })}><SelectTrigger className="h-8 w-full text-sm"><SelectValue placeholder="Selecionar" /></SelectTrigger><SelectContent><SelectItem value="teorico">{primeiroNome(atendimento.profissionalNome)} (teórico)</SelectItem>{terapeutas.map((terapeuta: any) => <SelectItem key={terapeuta.id} value={terapeuta.nomeAbreviado || terapeuta.nomeCompleto}>{terapeuta.nomeAbreviado || primeiroNome(terapeuta.nomeCompleto)}</SelectItem>)}</SelectContent></Select></div>
            <div className="min-w-0 space-y-1"><div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><MapPin className="h-3.5 w-3.5" />Sala</div><Select value={atendimento.salaOrganizada || "sem_sala"} onValueChange={(valor) => atualizarOrganizacao(atendimento.id, { sala: valor === "sem_sala" ? null : valor })}><SelectTrigger className="h-8 w-full text-sm"><SelectValue placeholder="Definir sala" /></SelectTrigger><SelectContent><SelectItem value="sem_sala">Definir no chamado</SelectItem>{salas.map((sala: any) => <SelectItem key={sala.id} value={sala.nome}>{sala.nome}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end"><Badge variant="secondary" className="font-normal">{atendimento.status}</Badge><Button size="sm" onClick={() => setSelecionado({ ...atendimento, profissionalNome: atendimento.terapeutaOrganizado || atendimento.profissionalNome })}><BellRing className="mr-1.5 h-4 w-4" />Chamar</Button><AlertDialog><AlertDialogTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Retirar da lista"><Trash2 className="h-4 w-4" /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Retirar atendimento da lista?</AlertDialogTitle><AlertDialogDescription>O atendimento de {atendimento.clienteNome} será ocultado somente desta lista operacional. A agenda no Belle não será cancelada nem alterada.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Voltar</AlertDialogCancel><AlertDialogAction className="bg-destructive hover:bg-destructive/90" disabled={retirarMutation.isPending} onClick={() => unidadeId && retirarMutation.mutate({ unidadeId, atendimentoBelleId: atendimento.id })}>{retirarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Retirar da lista"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div>
          </div>)}</div>}
      </CardContent>
    </Card>

    <ChamadoTerapeutaDialog
      open={!!selecionado}
      onOpenChange={(aberto: boolean) => !aberto && setSelecionado(null)}
      unidadeId={unidadeId}
      atendimento={selecionado}
      conversa={selecionado ? { clienteId: selecionado.clienteId, nomeContato: selecionado.clienteNome } : null}
    />
  </div>;
}
