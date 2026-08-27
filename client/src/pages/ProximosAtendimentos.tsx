import { ChamadoTerapeutaDialog } from "@/components/ChamadoTerapeutaDialog";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { BellRing, CalendarClock, Clock3, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

type AtendimentoSelecionado = {
  id: number;
  clienteId: number | null;
  clienteNome: string;
  horario: string | null;
  servicoNome: string | null;
  profissionalNome: string | null;
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
  const atendimentosQuery = trpc.agenda.proximosHoje.useQuery(
    { unidadeId: unidadeId ?? 0 },
    { enabled: !!unidadeId },
  );
  const atendimentos = useMemo(() => (atendimentosQuery.data ?? []) as AtendimentoSelecionado[], [atendimentosQuery.data]);

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
          : <div className="divide-y">{atendimentos.map((atendimento) => <div key={atendimento.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5 sm:px-5">
            <div className="flex w-20 shrink-0 items-center gap-2 text-primary"><Clock3 className="h-4 w-4" /><span className="font-serif text-xl font-semibold">{atendimento.horario || "—"}</span></div>
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{atendimento.clienteNome}</p><p className="mt-0.5 truncate text-sm text-muted-foreground">{atendimento.servicoNome || "Terapia não informada"}</p></div>
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"><UserRound className="h-4 w-4 shrink-0" /><span className="truncate">{primeiroNome(atendimento.profissionalNome)}</span></div>
            <div className="flex items-center justify-between gap-3 sm:justify-end"><Badge variant="secondary" className="font-normal">{atendimento.status}</Badge><Button size="sm" onClick={() => setSelecionado(atendimento)}><BellRing className="mr-1.5 h-4 w-4" />Chamar</Button></div>
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
