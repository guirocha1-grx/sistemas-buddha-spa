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
import { Loader2, Plus, Trash2, Pencil, Copy, Users, Phone, Mail, BellOff, Eye, EyeOff, ArrowUp, ArrowDown, ArrowUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { rotaInboxConversa } from "@shared/inboxNavigation";
import { ClienteWhatsAppButton } from "@/components/ClienteWhatsAppButton";
import { diasDesde } from "@/lib/utils";
import { SegmentoFiltros, filtroSegmentoVazio, descreverFiltros, type FiltroSegmento } from "@/components/SegmentoFiltros";

type OrderCol = "nome" | "qtdAtendimentosFinalizados" | "ultimoAtendimento" | "ultimoContato" | "dataNascimento";
type Grupo = "estrategica" | "por_terapeuta" | "por_data" | "por_terapia";
type GrupoVirtual = Exclude<Grupo, "estrategica">;
/** Base pra criar/editar/duplicar — id só existe em edição (funil real, do banco). */
type FunilBase = { id?: number; nome: string; filtros: string };
/** Formato retornado por listComResumo — id sempre string (virtual usa "terapeuta-5"/"dia-2"/"terapia-Drenagem"). */
type FunilListado = { id: string; nome: string; filtros: string; virtual: boolean; oculto: boolean; resumo: { total: number } };

const GRUPOS: Array<{ valor: Grupo; label: string }> = [
  { valor: "estrategica", label: "Reativações Personalizadas" },
  { valor: "por_terapeuta", label: "Reativação por Terapeuta" },
  { valor: "por_data", label: "Reativação por Dia da Semana" },
  { valor: "por_terapia", label: "Reativação por Terapia" },
];

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

/**
 * Cria, edita ou duplica um funil — mesmo construtor de filtros da
 * Segmentação de Disparos. "editar" grava em cima do funil (funilBase.id
 * obrigatório); "criar" sempre grava um funil novo — com funilBase
 * preenchido, é a duplicação (nome/critérios pré-carregados prontos pra
 * ajustar e salvar como outro funil).
 */
function FunilDialog({ unidadeId, open, onOpenChange, onSalvo, modo, funilBase }: {
  unidadeId: number; open: boolean; onOpenChange: (open: boolean) => void; onSalvo: (id: string) => void;
  modo: "criar" | "editar"; funilBase?: FunilBase | null;
}) {
  const utils = trpc.useUtils();
  const [nome, setNome] = useState("");
  const [filtros, setFiltros] = useState<FiltroSegmento[]>([filtroSegmentoVazio()]);

  useEffect(() => {
    if (!open) return;
    if (funilBase) { setNome(funilBase.nome); setFiltros(JSON.parse(funilBase.filtros)); }
    else { setNome(""); setFiltros([filtroSegmentoVazio()]); }
  }, [open, funilBase]);

  const criarMutation = trpc.funilReativacao.criarFunil.useMutation({
    onSuccess: (resultado) => {
      toast.success("Funil criado.");
      onOpenChange(false);
      onSalvo(String(resultado.id));
      utils.funilReativacao.listComResumo.invalidate({ unidadeId });
    },
    onError: (e) => toast.error(e.message),
  });

  const atualizarMutation = trpc.funilReativacao.atualizarFunil.useMutation({
    onSuccess: () => {
      toast.success("Funil atualizado.");
      onOpenChange(false);
      if (funilBase?.id) onSalvo(String(funilBase.id));
      utils.funilReativacao.listComResumo.invalidate({ unidadeId });
    },
    onError: (e) => toast.error(e.message),
  });

  const filtrosValidos = filtros.filter((f) => f.valor.trim());
  const salvando = criarMutation.isPending || atualizarMutation.isPending;

  function salvar() {
    if (modo === "editar" && funilBase?.id) atualizarMutation.mutate({ id: funilBase.id, nome: nome.trim(), filtros: filtrosValidos });
    else criarMutation.mutate({ unidadeId, nome: nome.trim(), filtros: filtrosValidos });
  }

  const titulo = modo === "editar" ? "Editar funil de reativação" : funilBase ? "Duplicar funil de reativação" : "Novo funil de reativação";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "'Cormorant Garamond', serif" }}>{titulo}</DialogTitle>
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
            {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : modo === "editar" ? <Pencil className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {modo === "editar" ? "Salvar alterações" : "Criar funil"}
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
 * Linha de um funil (2026-09-11) — nome com o hover mostrando todos os
 * critérios (ver descreverFiltros); duplicar funciona pra funil virtual
 * também (por terapeuta/data/terapia) — é assim que dá pra pegar um
 * pronto e só trocar 1 critério, salvando como um novo funil estratégico.
 * Editar e excluir só existem pro funil real (virtual não tem linha no
 * banco — em vez de excluir, dá pra ocultar, ver onOcultar/onReexibir).
 * Item oculto vira uma linha reduzida, só com o botão de reexibir.
 */
function FunilLinha({ funil, unidadeId, selecionado, onSelecionar, onEditar, onDuplicar, onExcluir, onOcultar, onReexibir }: {
  funil: FunilListado; unidadeId: number;
  selecionado: boolean; onSelecionar: () => void; onEditar: () => void; onDuplicar: () => void; onExcluir: () => void;
  onOcultar: () => void; onReexibir: () => void;
}) {
  const tooltip = useMemo(() => descreverFiltros(JSON.parse(funil.filtros), unidadeId), [funil.filtros, unidadeId]);

  if (funil.oculto) {
    return (
      <div className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-lg border border-dashed border-border/40 opacity-60">
        <span className="text-sm truncate" title={tooltip}>{funil.nome}</span>
        <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs shrink-0" onClick={onReexibir}>
          <Eye className="h-3.5 w-3.5" /> Reexibir
        </Button>
      </div>
    );
  }

  return (
    <div
      role="button"
      onClick={onSelecionar}
      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
        selecionado ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/30"
      }`}
    >
      <span className="text-sm font-medium truncate" title={tooltip}>{funil.nome}</span>
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{funil.resumo.total} cliente(s)</span>
        <div className="flex items-center gap-0.5">
          {!funil.virtual && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEditar(); }} title="Editar funil">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onDuplicar(); }} title="Duplicar funil">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          {funil.virtual && (
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onOcultar(); }} title="Ocultar">
              <EyeOff className="h-3.5 w-3.5" />
            </Button>
          )}
          {!funil.virtual && (
            <Button size="icon" variant="ghost" className="h-7 w-7 hover:text-destructive" onClick={(e) => { e.stopPropagation(); onExcluir(); }} title="Excluir funil">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
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

  const [grupo, setGrupo] = useState<Grupo>("estrategica");
  const [listaAberta, setListaAberta] = useState(true);
  const [mostrarOcultos, setMostrarOcultos] = useState(false);
  const [funilId, setFunilId] = useState<string | null>(null);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [dialogModo, setDialogModo] = useState<"criar" | "editar">("criar");
  const [dialogFunilBase, setDialogFunilBase] = useState<FunilBase | null>(null);
  const [naoReativarAlvo, setNaoReativarAlvo] = useState<{ id: number; nome: string } | null>(null);
  const [orderBy, setOrderBy] = useState<OrderCol>("qtdAtendimentosFinalizados");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");

  const funisQuery = trpc.funilReativacao.listComResumo.useQuery({ unidadeId, grupo }, { enabled: !!unidadeSelecionada });
  useEffect(() => { setFunilId(null); setGrupo("estrategica"); setListaAberta(true); setMostrarOcultos(false); }, [unidadeId]);

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

  const ocultarItemMutation = trpc.funilReativacao.ocultarItem.useMutation({
    onSuccess: () => utils.funilReativacao.listComResumo.invalidate({ unidadeId }),
    onError: (e) => toast.error(e.message),
  });

  const reexibirItemMutation = trpc.funilReativacao.reexibirItem.useMutation({
    onSuccess: () => utils.funilReativacao.listComResumo.invalidate({ unidadeId }),
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

  function trocarGrupo(g: Grupo) {
    if (g === grupo) return;
    setGrupo(g);
    setFunilId(null);
    setListaAberta(true);
    setMostrarOcultos(false);
  }

  function selecionarFunil(id: string) {
    setFunilId(id);
    setListaAberta(false);
  }

  function abrirNovoFunil() { setDialogModo("criar"); setDialogFunilBase(null); setDialogAberto(true); }
  function abrirEdicaoFunil(funil: FunilListado) { setDialogModo("editar"); setDialogFunilBase({ id: Number(funil.id), nome: funil.nome, filtros: funil.filtros }); setDialogAberto(true); }
  function abrirDuplicacaoFunil(funil: FunilListado) { setDialogModo("criar"); setDialogFunilBase({ nome: `Cópia de ${funil.nome}`, filtros: funil.filtros }); setDialogAberto(true); }

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
          <div className="flex flex-wrap gap-2">
            {GRUPOS.map((g) => (
              <Button
                key={g.valor}
                size="sm"
                variant={grupo === g.valor ? "default" : "outline"}
                onClick={() => trocarGrupo(g.valor)}
              >
                {g.label}
              </Button>
            ))}
          </div>

          <Card className="overflow-hidden">
            <button
              type="button"
              onClick={() => setListaAberta((a) => !a)}
              className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-sm hover:bg-muted/20 transition-colors"
            >
              <span className="font-medium truncate">
                {funilSelecionado ? funilSelecionado.nome : "Escolha um funil"}
              </span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                {funisQuery.isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `${funisQuery.data?.length ?? 0} funil(is)`}
                {listaAberta ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>
            {listaAberta && (() => {
              const todos = funisQuery.data ?? [];
              const ocultosCount = todos.filter((f) => f.oculto).length;
              const visiveis = todos.filter((f) => !f.oculto || mostrarOcultos);
              return (
                <CardContent className="pt-0 space-y-1.5 border-t border-border/50">
                  <div className="pt-3 space-y-1.5">
                    {visiveis.map((funil) => (
                      <FunilLinha
                        key={funil.id}
                        funil={funil}
                        unidadeId={unidadeId}
                        selecionado={funil.id === funilId}
                        onSelecionar={() => selecionarFunil(funil.id)}
                        onEditar={() => abrirEdicaoFunil(funil)}
                        onDuplicar={() => abrirDuplicacaoFunil(funil)}
                        onExcluir={() => excluirFunilMutation.mutate({ id: Number(funil.id) })}
                        onOcultar={() => ocultarItemMutation.mutate({ unidadeId, grupo: grupo as GrupoVirtual, itemId: funil.id })}
                        onReexibir={() => reexibirItemMutation.mutate({ unidadeId, grupo: grupo as GrupoVirtual, itemId: funil.id })}
                      />
                    ))}
                    {!funisQuery.isLoading && todos.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {grupo === "por_terapeuta" ? "Nenhum terapeuta ativo nessa unidade."
                          : grupo === "por_terapia" ? "Nenhuma terapia registrada nessa unidade ainda."
                          : "Nenhum funil aqui ainda."}
                      </p>
                    )}
                    {grupo === "estrategica" && (
                      <button
                        type="button"
                        onClick={abrirNovoFunil}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-border/60 text-muted-foreground hover:bg-muted/30 hover:text-foreground transition-colors"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="text-sm font-medium">Novo funil</span>
                      </button>
                    )}
                    {ocultosCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setMostrarOcultos((m) => !m)}
                        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {mostrarOcultos ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        {mostrarOcultos ? "Esconder ocultos" : `Mostrar ocultos (${ocultosCount})`}
                      </button>
                    )}
                  </div>
                </CardContent>
              );
            })()}
          </Card>

          {!funilSelecionado ? (
            <Card>
              <CardContent className="pt-6 flex flex-col items-center gap-3 text-center py-12">
                <Users className="h-12 w-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Selecione um funil acima para ver os clientes.</p>
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
        onSalvo={(id) => selecionarFunil(id)}
        modo={dialogModo}
        funilBase={dialogFunilBase}
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
