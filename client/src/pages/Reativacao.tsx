import { useEffect, useMemo, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, Users, Phone, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { rotaInboxConversa } from "@shared/inboxNavigation";
import { ClienteWhatsAppButton } from "@/components/ClienteWhatsAppButton";
import { diasDesde } from "@/lib/utils";
import { SegmentoFiltros, filtroSegmentoVazio, type FiltroSegmento } from "@/components/SegmentoFiltros";

type StatusReativacao = "inativo" | "mensagem_enviada" | "qualificado" | "agendado" | "atendido";

const ETAPAS: Array<{ valor: StatusReativacao; label: string }> = [
  { valor: "inativo", label: "Cliente inativo" },
  { valor: "mensagem_enviada", label: "Mensagem enviada" },
  { valor: "qualificado", label: "Qualificado (respondeu)" },
  { valor: "agendado", label: "Agendado" },
  { valor: "atendido", label: "Atendido" },
];

function fmtDataBr(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Dialog de criação de funil — mesmo construtor de filtros da Segmentação de Disparos, só que salvo com nome para reabrir depois. */
function NovoFunilDialog({ unidadeId, open, onOpenChange, onCriado }: {
  unidadeId: number; open: boolean; onOpenChange: (open: boolean) => void; onCriado: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const [nome, setNome] = useState("");
  const [filtros, setFiltros] = useState<FiltroSegmento[]>([filtroSegmentoVazio()]);

  useEffect(() => {
    if (open) { setNome(""); setFiltros([filtroSegmentoVazio()]); }
  }, [open]);

  const criarMutation = trpc.funilReativacao.criarFunil.useMutation({
    onSuccess: async () => {
      toast.success("Funil criado.");
      const lista = await utils.funilReativacao.listFunis.fetch({ unidadeId });
      const criado = lista.find((f) => f.nome === nome.trim());
      onOpenChange(false);
      if (criado) onCriado(criado.id);
    },
    onError: (e) => toast.error(e.message),
  });

  const filtrosValidos = filtros.filter((f) => f.valor.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Cormorant Garamond', serif" }}>Novo funil de reativação</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nome do funil</label>
            <Input
              placeholder='Ex.: "Clientes 5+ atendimentos, última visita +60 dias"'
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Critérios (todos precisam bater)</label>
            <SegmentoFiltros filtros={filtros} onChange={setFiltros} unidadeId={unidadeId} />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => criarMutation.mutate({ unidadeId, nome: nome.trim(), filtros: filtrosValidos })}
            disabled={!nome.trim() || filtrosValidos.length === 0 || criarMutation.isPending}
          >
            {criarMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Criar funil
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Reativacao() {
  const [, setLocation] = useLocation();
  const { unidadeSelecionada } = useUnidade();
  const unidadeId = unidadeSelecionada?.id ?? 0;
  const utils = trpc.useUtils();

  const [funilId, setFunilId] = useState<number | null>(null);
  const [novoFunilAberto, setNovoFunilAberto] = useState(false);

  const funisQuery = trpc.funilReativacao.listFunis.useQuery({ unidadeId }, { enabled: !!unidadeSelecionada });
  useEffect(() => {
    if (funilId === null && (funisQuery.data?.length ?? 0) > 0) setFunilId(funisQuery.data![0].id);
  }, [funisQuery.data, funilId]);
  useEffect(() => { setFunilId(null); }, [unidadeId]);

  const funilSelecionado = funisQuery.data?.find((f) => f.id === funilId) ?? null;
  const filtrosDoFunil = useMemo<FiltroSegmento[]>(
    () => (funilSelecionado ? JSON.parse(funilSelecionado.filtros) : []),
    [funilSelecionado],
  );

  const clientesQuery = trpc.funilReativacao.listClientes.useQuery(
    { unidadeId, filtros: filtrosDoFunil },
    { enabled: !!unidadeSelecionada && !!funilSelecionado },
  );

  const excluirFunilMutation = trpc.funilReativacao.excluirFunil.useMutation({
    onSuccess: () => { setFunilId(null); utils.funilReativacao.listFunis.invalidate({ unidadeId }); toast.success("Funil excluído."); },
    onError: (e) => toast.error(e.message),
  });

  const definirStatusMutation = trpc.funilReativacao.definirStatus.useMutation({
    onSuccess: () => utils.funilReativacao.listClientes.invalidate({ unidadeId, filtros: filtrosDoFunil }),
    onError: (e) => toast.error(e.message),
  });

  const clientes = clientesQuery.data ?? [];
  const contagemPorEtapa = useMemo(() => {
    const mapa = new Map<StatusReativacao, number>();
    for (const c of clientes) mapa.set(c.status as StatusReativacao, (mapa.get(c.status as StatusReativacao) ?? 0) + 1);
    return mapa;
  }, [clientes]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Funil de Reativação
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Filtre a base de clientes por potencial e vá avançando a etapa conforme liga ou manda mensagem.
          </p>
        </div>
        <UnidadeSelector />
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardContent className="pt-4 flex flex-wrap items-center gap-2">
          <Select
            value={funilId?.toString() ?? ""}
            onValueChange={(v) => setFunilId(Number(v))}
            disabled={!unidadeSelecionada || funisQuery.isLoading}
          >
            <SelectTrigger className="w-80"><SelectValue placeholder="Escolha um funil" /></SelectTrigger>
            <SelectContent>
              {(funisQuery.data ?? []).map((f) => <SelectItem key={f.id} value={f.id.toString()}>{f.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={!unidadeSelecionada} onClick={() => setNovoFunilAberto(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo funil
          </Button>
          {funilSelecionado && (
            <Button
              variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive"
              onClick={() => excluirFunilMutation.mutate({ id: funilSelecionado.id })}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir funil
            </Button>
          )}
          {funilSelecionado && (
            <Badge variant="secondary" className="ml-auto gap-1.5">
              <Users className="h-3 w-3" />
              {clientesQuery.isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : `${clientes.length} cliente(s)`}
            </Badge>
          )}
        </CardContent>
      </Card>

      {funilSelecionado && (
        <div className="flex flex-wrap gap-2">
          {ETAPAS.map((etapa) => (
            <Badge key={etapa.valor} variant="outline" className="text-xs">
              {etapa.label}: <span className="font-medium ml-1 tabular-nums">{contagemPorEtapa.get(etapa.valor) ?? 0}</span>
            </Badge>
          ))}
        </div>
      )}

      {!unidadeSelecionada ? (
        <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">Selecione uma unidade.</CardContent></Card>
      ) : !funilSelecionado ? (
        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-3 text-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {funisQuery.isLoading ? "Carregando funis..." : "Nenhum funil ainda — crie um para começar a trabalhar a reativação."}
            </p>
          </CardContent>
        </Card>
      ) : clientesQuery.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      ) : clientes.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground py-12">Nenhum cliente bate com esses critérios.</CardContent></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="max-w-[150px]">Contato</TableHead>
                  <TableHead className="text-center">Visitas</TableHead>
                  <TableHead>Última visita</TableHead>
                  <TableHead className="w-56">Etapa</TableHead>
                  <TableHead className="w-12 text-center" aria-label="WhatsApp">
                    <MessageCircle className="mx-auto h-4 w-4 text-emerald-600" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.map((cliente) => (
                  <TableRow key={cliente.id}>
                    <TableCell className="py-2 font-medium">{cliente.nome}</TableCell>
                    <TableCell className="py-2 max-w-[150px]">
                      <div className="space-y-0.5">
                        {cliente.celular && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate" title={cliente.celular}>
                            <Phone className="h-3 w-3 shrink-0" /> <span className="truncate">{cliente.celular}</span>
                          </p>
                        )}
                        {cliente.email && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 truncate" title={cliente.email}>
                            <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{cliente.email}</span>
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-center tabular-nums">{cliente.qtdAtendimentosFinalizados}</TableCell>
                    <TableCell className="py-2 text-xs whitespace-nowrap">
                      {fmtDataBr(cliente.ultimoAtendimento)}
                      {diasDesde(cliente.ultimoAtendimento) !== null && (
                        <span className="text-muted-foreground"> ({diasDesde(cliente.ultimoAtendimento)}d)</span>
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <Select
                        value={cliente.status}
                        onValueChange={(v) => definirStatusMutation.mutate({ clienteId: cliente.id, unidadeId, status: v as StatusReativacao })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ETAPAS.map((e) => <SelectItem key={e.valor} value={e.valor}>{e.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="py-2 text-center">
                      <ClienteWhatsAppButton
                        cliente={cliente}
                        unidadeId={unidadeId}
                        onOpenInbox={(conversaId) => setLocation(rotaInboxConversa(conversaId))}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <NovoFunilDialog
        unidadeId={unidadeId}
        open={novoFunilAberto}
        onOpenChange={setNovoFunilAberto}
        onCriado={(id) => setFunilId(id)}
      />
    </div>
  );
}
