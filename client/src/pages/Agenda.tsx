import { useMemo, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Calendar } from "lucide-react";

const TODOS = "__todos__";
const STATUS_AGENDADO_POR_IA = "Agendado (IA)";

function origemDoStatus(status: string): "belle" | "ia" {
  return status === STATUS_AGENDADO_POR_IA ? "ia" : "belle";
}

function hojeIso(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function primeiroDiaDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function ultimoDiaDoMes(iso: string): string {
  const [ano, mes] = iso.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(ultimoDia).padStart(2, "0")}`;
}

function fmtDataCurta(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

const CORES_STATUS: Record<string, string> = {
  "Atendido": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Marcado": "bg-blue-100 text-blue-700 border-blue-200",
  "Pré-Agendado": "bg-blue-100 text-blue-700 border-blue-200",
  "Confirmado": "bg-blue-100 text-blue-700 border-blue-200",
  "Agendado (IA)": "bg-amber-100 text-amber-700 border-amber-200",
  "Desmarcado": "bg-muted text-muted-foreground border-border",
  "Cancelado": "bg-red-100 text-red-700 border-red-200",
};

export default function Agenda() {
  const { unidadeSelecionada } = useUnidade();
  const hoje = useMemo(() => hojeIso(), []);
  const [dataInicio, setDataInicio] = useState(primeiroDiaDoMes(hoje));
  const [dataFim, setDataFim] = useState(ultimoDiaDoMes(hoje));
  const [filtroStatus, setFiltroStatus] = useState(TODOS);
  const [filtroTerapeuta, setFiltroTerapeuta] = useState(TODOS);
  const [filtroOrigem, setFiltroOrigem] = useState<typeof TODOS | "belle" | "ia">(TODOS);

  const { data: agendamentos, isLoading } = trpc.agenda.list.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0, dataInicio, dataFim },
    { enabled: !!unidadeSelecionada }
  );

  const statusDisponiveis = useMemo(() => {
    const vistos = new Set<string>();
    for (const ag of agendamentos ?? []) vistos.add(ag.status);
    return Array.from(vistos).sort();
  }, [agendamentos]);

  const terapeutasDisponiveis = useMemo(() => {
    const vistos = new Set<string>();
    for (const ag of agendamentos ?? []) if (ag.profissionalNome) vistos.add(ag.profissionalNome);
    return Array.from(vistos).sort();
  }, [agendamentos]);

  const filtrados = useMemo(() => {
    return (agendamentos ?? []).filter((ag) => {
      if (filtroStatus !== TODOS && ag.status !== filtroStatus) return false;
      if (filtroTerapeuta !== TODOS && ag.profissionalNome !== filtroTerapeuta) return false;
      if (filtroOrigem !== TODOS && origemDoStatus(ag.status) !== filtroOrigem) return false;
      return true;
    });
  }, [agendamentos, filtroStatus, filtroTerapeuta, filtroOrigem]);

  const resumo = useMemo(() => {
    let atendidos = 0;
    let agendados = 0;
    let cancelados = 0;
    let viaIa = 0;
    for (const ag of filtrados) {
      if (ag.status === "Atendido") atendidos++;
      else if (ag.status === "Desmarcado" || ag.status === "Cancelado") cancelados++;
      else agendados++;
      if (origemDoStatus(ag.status) === "ia") viaIa++;
    }
    return { total: filtrados.length, atendidos, agendados, cancelados, viaIa };
  }, [filtrados]);

  function irParaEsteMes() {
    setDataInicio(primeiroDiaDoMes(hoje));
    setDataFim(ultimoDiaDoMes(hoje));
  }

  function limparFiltros() {
    setFiltroStatus(TODOS);
    setFiltroTerapeuta(TODOS);
    setFiltroOrigem(TODOS);
  }

  const filtrosAtivos = filtroStatus !== TODOS || filtroTerapeuta !== TODOS || filtroOrigem !== TODOS;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Agenda
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Relatório de atendimentos e agendamentos — passados e futuros, conforme o período filtrado
          </p>
        </div>
        <UnidadeSelector />
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-4 pb-4 flex items-end gap-3 flex-wrap">
          <div>
            <Label className="text-xs">Data início</Label>
            <Input type="date" className="mt-1 h-9 w-40" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Data fim</Label>
            <Input type="date" className="mt-1 h-9 w-40" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" onClick={irParaEsteMes}>Este mês</Button>

          <div>
            <Label className="text-xs">Status</Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="mt-1 h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os status</SelectItem>
                {statusDisponiveis.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Terapeuta</Label>
            <Select value={filtroTerapeuta} onValueChange={setFiltroTerapeuta}>
              <SelectTrigger className="mt-1 h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os terapeutas</SelectItem>
                {terapeutasDisponiveis.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Origem</Label>
            <Select value={filtroOrigem} onValueChange={(v) => setFiltroOrigem(v as typeof filtroOrigem)}>
              <SelectTrigger className="mt-1 h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Belle e IA</SelectItem>
                <SelectItem value="belle">Só Belle</SelectItem>
                <SelectItem value="ia">Só IA</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {filtrosAtivos && (
            <Button size="sm" variant="ghost" onClick={limparFiltros}>Limpar filtros</Button>
          )}
          <p className="text-xs text-muted-foreground ml-auto">{resumo.total} atendimento(s) no período</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/50 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold mt-1">{resumo.total}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Atendidos</p>
            <p className="text-2xl font-semibold mt-1 text-emerald-600">{resumo.atendidos}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Agendados</p>
            <p className="text-2xl font-semibold mt-1 text-blue-600">{resumo.agendados}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Cancelados/Desmarcados</p>
            <p className="text-2xl font-semibold mt-1 text-red-600">{resumo.cancelados}</p>
          </CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground -mt-3">
        {resumo.viaIa} de {resumo.total} agendamento(s) no período vieram do reconhecimento automático da IA (confirmação do Belle no WhatsApp), o restante veio da planilha do Belle.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtrados.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {agendamentos && agendamentos.length > 0
                ? "Nenhum atendimento bate com os filtros selecionados."
                : "Nenhum atendimento no período selecionado."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground uppercase tracking-wider">
                  <th className="px-4 py-2.5 font-medium">Data</th>
                  <th className="px-4 py-2.5 font-medium">Horário</th>
                  <th className="px-4 py-2.5 font-medium">Cliente</th>
                  <th className="px-4 py-2.5 font-medium">Serviço</th>
                  <th className="px-4 py-2.5 font-medium">Profissional</th>
                  <th className="px-4 py-2.5 font-medium">Origem</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((ag) => (
                  <tr key={ag.id} className={`border-b last:border-0 ${ag.dataAtendimento === hoje ? "bg-primary/5" : ""}`}>
                    <td className="px-4 py-2.5 whitespace-nowrap">{fmtDataCurta(ag.dataAtendimento)}</td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{ag.horario ?? "—"}</td>
                    <td className="px-4 py-2.5 font-medium">{ag.clienteNome}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{ag.servicoNome ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{ag.profissionalNome ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">
                      {origemDoStatus(ag.status) === "ia" ? "IA" : "Belle"}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className={`text-[11px] ${CORES_STATUS[ag.status] ?? ""}`}>{ag.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
