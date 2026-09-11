import { useEffect, useMemo, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, Pencil, Users, Phone, Mail, BellOff, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { rotaInboxConversa } from "@shared/inboxNavigation";
import { ClienteWhatsAppButton } from "@/components/ClienteWhatsAppButton";
import { diasDesde } from "@/lib/utils";
import { SegmentoFiltros, filtroSegmentoVazio, type FiltroSegmento } from "@/components/SegmentoFiltros";

type FunilReativacao = { id: number; unidadeId: number; nome: string; filtros: string; createdAt: string | Date };
type OrderCol = "nome" | "qtdAtendimentosFinalizados" | "ultimoAtendimento" | "ultimoContato" | "dataNascimento";

function fmtDataBr(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtNascimentoSemAno(iso: string | null): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function fmtDataHoraBr(data: Date | string | null | undefined): string {
  if (!data) return "—";
  const normalizada = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(normalizada.getTime())) return "—";
  return normalizada.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Compara datas (string ISO ou Date) com nulos sempre por último, independente da direção. */
function compararComNulos(a: string | Date | null | undefined, b: string | Date | null | undefined, direcao: "asc" | "desc") {
  const va = a ? new Date(a).getTime() : Number.NaN;
  const vb = b ? new Date(b).getTime() : Number.NaN;
  const aValido = Number.isFinite(va);
  const bValido = Number.isFinite(vb);
  if (!aValido && !bValido) return 0;
  if (!aValido) return 1;
  if (!bValido) return -1;
  return direcao === "asc" ? va - vb : vb - va;
}

function SortTh({ col, label, orderBy, orderDir, onSort, className }: {
  col: OrderCol; label: string; orderBy: OrderCol; orderDir: "asc" | "desc";
  onSort: (col: OrderCol) => void; className?: string;
}) {
  const active = orderBy === col;
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap ${className ?? ""}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? (orderDir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />)
          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </span>
    </TableHead>
  );
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

/**
 * Linha de um funil salvo (2026-09-11) — era um card quadrado, mas com
 * mais funis o texto/critério não cabia; em linha o nome tem o espaço
 * inteiro. Ainda é um formato provisório — reorganizar/agrupar quando
 * tiver muitos funis fica pra depois.
 */
function FunilLinha({ funil, selecionado, onSelecionar, onEditar, onExcluir }: {
  funil: { id: number; nome: string; resumo: { total: number } };
  selecionado: boolean; onSelecionar: () => void; onEditar: () => void; onExcluir: () => void;
}) {
  return (
    <div
      role="button"
      onClick={onSelecionar}
      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
        selecionado ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/30"
      }`}
    >
      <span className="text-sm font-medium truncate">{funil.nome}</span>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{funil.resumo.total} cliente(s)</span>
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEditar(); }} title="Editar funil">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive" onClick={(e) => { e.stopPropagation(); onExcluir(); }} title="Excluir funil">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
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
  const [orderBy, setOrderBy] = useState<OrderCol>("qtdAtendimentosFinalizados");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");

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

  const marcarNaoReativarMutation = trpc.funilReativacao.marcarNaoReativar.useMutation({
    onSuccess: () => {
      toast.success("Cliente marcado como não reativar.");
      setNaoReativarAlvo(null);
      utils.funilReativacao.listClientes.invalidate({ unidadeId, filtros: filtrosDoFunil });
    },
    onError: (e) => toast.error(e.message),
  });

  const clientes = clientesQuery.data ?? [];
  const clientesOrdenados = useMemo(() => {
    const lista = [...clientes];
    lista.sort((a, b) => {
      switch (orderBy) {
        case "nome":
          return orderDir === "asc" ? a.nome.localeCompare(b.nome, "pt-BR") : b.nome.localeCompare(a.nome, "pt-BR");
        case "qtdAtendimentosFinalizados":
          return orderDir === "asc"
            ? a.qtdAtendimentosFinalizados - b.qtdAtendimentosFinalizados
            : b.qtdAtendimentosFinalizados - a.qtdAtendimentosFinalizados;
        case "ultimoAtendimento": return compararComNulos(a.ultimoAtendimento, b.ultimoAtendimento, orderDir);
        case "ultimoContato": return compararComNulos(a.ultimoContato, b.ultimoContato, orderDir);
        case "dataNascimento": return compararComNulos(a.dataNascimento, b.dataNascimento, orderDir);
        default: return 0;
      }
    });
    return lista;
  }, [clientes, orderBy, orderDir]);

  function toggleSort(col: OrderCol) {
    if (orderBy === col) setOrderDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setOrderBy(col); setOrderDir("asc"); }
  }

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
          <div className="space-y-1.5">
            {(funisQuery.data ?? []).map((funil) => (
              <FunilLinha
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
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border/60 text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span className="text-sm font-medium">Novo funil</span>
            </button>
          </div>

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
                      <SortTh col="nome" label="Cliente" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                      <TableHead className="max-w-[150px]">Contato</TableHead>
                      <SortTh col="qtdAtendimentosFinalizados" label="Visitas" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} className="text-center" />
                      <SortTh col="ultimoAtendimento" label="Última visita" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                      <SortTh col="ultimoContato" label="Último contato" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                      <SortTh col="dataNascimento" label="Nascimento" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                      <TableHead className="w-20 text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientesOrdenados.map((cliente) => (
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
                        <TableCell className="py-2 text-xs whitespace-nowrap tabular-nums">{fmtNascimentoSemAno(cliente.dataNascimento)}</TableCell>
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
