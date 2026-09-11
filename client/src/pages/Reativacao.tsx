import { useEffect, useMemo, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, Pencil, Users, Phone, Mail, MessageCircle, BellOff } from "lucide-react";
import { toast } from "sonner";
import { rotaInboxConversa } from "@shared/inboxNavigation";
import { ClienteWhatsAppButton } from "@/components/ClienteWhatsAppButton";
import { diasDesde } from "@/lib/utils";
import { SegmentoFiltros, filtroSegmentoVazio, type FiltroSegmento } from "@/components/SegmentoFiltros";

type StatusReativacao = "inativo" | "mensagem_enviada" | "qualificado" | "agendado" | "atendido";
type FunilReativacao = { id: number; unidadeId: number; nome: string; filtros: string; createdAt: string | Date };

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

function fmtDataHoraBr(data: Date | string | null | undefined): string {
  if (!data) return "—";
  const normalizada = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(normalizada.getTime())) return "—";
  return normalizada.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Cria ou edita um funil — mesmo construtor de filtros da Segmentação de Disparos, salvo com nome para reabrir depois. */
function FunilDialog({ unidadeId, open, onOpenChange, onSalvo, funilParaEditar }: {
  unidadeId: number; open: boolean; onOpenChange: (open: boolean) => void; onSalvo: (id: number) => void;
  funilParaEditar?: FunilReativacao | null;
}) {
  const utils = trpc.useUtils();
  const editando = !!funilParaEditar;
  const [nome, setNome] = useState("");
  const [filtros, setFiltros] = useState<FiltroSegmento[]>([filtroSegmentoVazio()]);

  useEffect(() => {
    if (!open) return;
    if (funilParaEditar) { setNome(funilParaEditar.nome); setFiltros(JSON.parse(funilParaEditar.filtros)); }
    else { setNome(""); setFiltros([filtroSegmentoVazio()]); }
  }, [open, funilParaEditar]);

  const criarMutation = trpc.funilReativacao.criarFunil.useMutation({
    onSuccess: async () => {
      toast.success("Funil criado.");
      const lista = await utils.funilReativacao.listFunis.fetch({ unidadeId });
      const criado = lista.find((f) => f.nome === nome.trim());
      onOpenChange(false);
      if (criado) onSalvo(criado.id);
      utils.funilReativacao.listComResumo.invalidate({ unidadeId });
    },
    onError: (e) => toast.error(e.message),
  });

  const atualizarMutation = trpc.funilReativacao.atualizarFunil.useMutation({
    onSuccess: () => {
      toast.success("Funil atualizado.");
      onOpenChange(false);
      if (funilParaEditar) onSalvo(funilParaEditar.id);
      utils.funilReativacao.listFunis.invalidate({ unidadeId });
      utils.funilReativacao.listComResumo.invalidate({ unidadeId });
    },
    onError: (e) => toast.error(e.message),
  });

  const filtrosValidos = filtros.filter((f) => f.valor.trim());
  const salvando = criarMutation.isPending || atualizarMutation.isPending;

  function salvar() {
    if (editando && funilParaEditar) atualizarMutation.mutate({ id: funilParaEditar.id, nome: nome.trim(), filtros: filtrosValidos });
    else criarMutation.mutate({ unidadeId, nome: nome.trim(), filtros: filtrosValidos });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            {editando ? "Editar funil de reativação" : "Novo funil de reativação"}
          </DialogTitle>
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
          <Button onClick={salvar} disabled={!nome.trim() || filtrosValidos.length === 0 || salvando}>
            {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : editando ? <Pencil className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {editando ? "Salvar alterações" : "Criar funil"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pequeno formulário de motivo — cliente pediu pra não receber mais contato de reativação. */
function NaoReativarDialog({ open, onOpenChange, clienteNome, onConfirmar, salvando }: {
  open: boolean; onOpenChange: (open: boolean) => void; clienteNome: string; onConfirmar: (motivo: string) => void; salvando: boolean;
}) {
  const [motivo, setMotivo] = useState("");
  useEffect(() => { if (open) setMotivo(""); }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Cormorant Garamond', serif" }}>Não reativar {clienteNome}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Motivo</label>
          <Textarea
            placeholder="Ex.: pediu pra não receber mais contato de reativação"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Marca o cliente com a etiqueta "Não reativar" — some de qualquer funil novo que excluir essa etiqueta.
          </p>
        </div>
        <DialogFooter>
          <Button variant="destructive" onClick={() => onConfirmar(motivo.trim())} disabled={!motivo.trim() || salvando}>
            {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BellOff className="h-4 w-4 mr-2" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Caixinha de um funil salvo — nome + total, clicável, com editar/excluir no canto. */
function FunilCaixinha({ funil, selecionado, onSelecionar, onEditar, onExcluir }: {
  funil: { id: number; nome: string; resumo: { total: number } };
  selecionado: boolean; onSelecionar: () => void; onEditar: () => void; onExcluir: () => void;
}) {
  return (
    <div
      role="button"
      onClick={onSelecionar}
      className={`relative w-48 shrink-0 rounded-lg border p-3 text-left cursor-pointer transition-colors ${
        selecionado ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/30"
      }`}
    >
      <p className="text-xs font-medium leading-snug line-clamp-2 pr-10">{funil.nome}</p>
      <p className="text-2xl font-semibold tabular-nums mt-1">{funil.resumo.total}</p>
      <p className="text-[11px] text-muted-foreground">cliente(s)</p>
      <div className="absolute top-2 right-2 flex items-center gap-0.5">
        <Button
          size="icon" variant="ghost" className="h-6 w-6"
          onClick={(e) => { e.stopPropagation(); onEditar(); }}
          title="Editar funil"
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          size="icon" variant="ghost" className="h-6 w-6 hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); onExcluir(); }}
          title="Excluir funil"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

export default function Reativacao() {
  const [, setLocation] = useLocation();
  const { unidadeSelecionada } = useUnidade();
  const unidadeId = unidadeSelecionada?.id ?? 0;
  const utils = trpc.useUtils();

  const [funilId, setFunilId] = useState<number | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [funilEmEdicao, setFunilEmEdicao] = useState<FunilReativacao | null>(null);
  const [naoReativarAlvo, setNaoReativarAlvo] = useState<{ id: number; nome: string } | null>(null);

  const funisQuery = trpc.funilReativacao.listComResumo.useQuery({ unidadeId }, { enabled: !!unidadeSelecionada });
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
    onSuccess: () => { setFunilId(null); utils.funilReativacao.listComResumo.invalidate({ unidadeId }); toast.success("Funil excluído."); },
    onError: (e) => toast.error(e.message),
  });

  const definirStatusMutation = trpc.funilReativacao.definirStatus.useMutation({
    onSuccess: () => utils.funilReativacao.listClientes.invalidate({ unidadeId, filtros: filtrosDoFunil }),
    onError: (e) => toast.error(e.message),
  });

  const marcarNaoReativarMutation = trpc.funilReativacao.marcarNaoReativar.useMutation({
    onSuccess: () => {
      toast.success("Cliente marcado como não reativar.");
      setNaoReativarAlvo(null);
      utils.funilReativacao.listClientes.invalidate({ unidadeId, filtros: filtrosDoFunil });
    },
    onError: (e) => toast.error(e.message),
  });

  const clientes = clientesQuery.data ?? [];
  const contagemPorEtapa = useMemo(() => {
    const mapa = new Map<StatusReativacao, number>();
    for (const c of clientes) mapa.set(c.status as StatusReativacao, (mapa.get(c.status as StatusReativacao) ?? 0) + 1);
    return mapa;
  }, [clientes]);

  function abrirNovoFunil() { setFunilEmEdicao(null); setDialogAberto(true); }
  function abrirEdicaoFunil(funil: FunilReativacao) { setFunilEmEdicao(funil); setDialogAberto(true); }

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

      {!unidadeSelecionada ? (
        <Card><CardContent className="pt-6 text-center text-sm text-muted-foreground">Selecione uma unidade.</CardContent></Card>
      ) : (
        <>
          <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
            {(funisQuery.data ?? []).map((funil) => (
              <FunilCaixinha
                key={funil.id}
                funil={funil}
                selecionado={funil.id === funilId}
                onSelecionar={() => setFunilId(funil.id)}
                onEditar={() => abrirEdicaoFunil(funil)}
                onExcluir={() => excluirFunilMutation.mutate({ id: funil.id })}
              />
            ))}
            <button
              type="button"
              onClick={abrirNovoFunil}
              className="w-48 shrink-0 rounded-lg border border-dashed border-border/60 p-3 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs font-medium">Novo funil</span>
            </button>
          </div>

          {funilSelecionado && (
            <div className="flex flex-wrap gap-2">
              {ETAPAS.map((etapa) => (
                <Badge key={etapa.valor} variant="outline" className="text-xs">
                  {etapa.label}: <span className="font-medium ml-1 tabular-nums">{contagemPorEtapa.get(etapa.valor) ?? 0}</span>
                </Badge>
              ))}
            </div>
          )}

          {!funilSelecionado ? (
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
                      <TableHead>Último contato</TableHead>
                      <TableHead className="w-56">Etapa</TableHead>
                      <TableHead className="w-20 text-center">Ações</TableHead>
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
                        <TableCell className="py-2 text-xs whitespace-nowrap tabular-nums">{fmtDataHoraBr(cliente.ultimoContato)}</TableCell>
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
                        <TableCell className="py-2">
                          <div className="flex items-center justify-center gap-1">
                            <ClienteWhatsAppButton
                              cliente={cliente}
                              unidadeId={unidadeId}
                              onOpenInbox={(conversaId) => setLocation(rotaInboxConversa(conversaId))}
                            />
                            {cliente.naoReativarMotivo != null ? (
                              <span title={`Não reativar — ${cliente.naoReativarMotivo}`}>
                                <BellOff className="h-4 w-4 text-muted-foreground" />
                              </span>
                            ) : (
                              <Button
                                size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                title="Marcar como não reativar"
                                onClick={() => setNaoReativarAlvo({ id: cliente.id, nome: cliente.nome })}
                              >
                                <BellOff className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </>
      )}

      <FunilDialog
        unidadeId={unidadeId}
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        onSalvo={(id) => setFunilId(id)}
        funilParaEditar={funilEmEdicao}
      />

      <NaoReativarDialog
        open={!!naoReativarAlvo}
        onOpenChange={(open) => !open && setNaoReativarAlvo(null)}
        clienteNome={naoReativarAlvo?.nome ?? ""}
        salvando={marcarNaoReativarMutation.isPending}
        onConfirmar={(motivo) => { if (naoReativarAlvo) marcarNaoReativarMutation.mutate({ clienteId: naoReativarAlvo.id, motivo }); }}
      />
    </div>
  );
}
