import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  ArrowLeft, Plus, Trash2, X, Save, MessageSquare, Clock, GitFork, Variable, Flag, Play, Search, Star, Zap,
  Shuffle, Webhook as WebhookIcon, Image, ListChecks, ChevronDown, Tag, Hash,
} from "lucide-react";

type NoTipo = "mensagem" | "aguardar" | "condicional" | "salvar_variavel" | "fim" | "randomizador" | "webhook" | "midia" | "menu" | "aplicar_etiqueta" | "incrementar_campo";

type FluxoNo = {
  id: number;
  fluxoId: number;
  tipo: NoTipo;
  ordem: number;
  config: any;
  proximoNoOrdem: number | null;
  posX: number | null;
  posY: number | null;
  enviados?: number;
};

const TIPO_INFO: Record<NoTipo, { label: string; icon: any; cor: string }> = {
  mensagem: { label: "Mensagem", icon: MessageSquare, cor: "text-blue-600 bg-blue-50" },
  aguardar: { label: "Aguardar", icon: Clock, cor: "text-amber-600 bg-amber-50" },
  condicional: { label: "Condicional", icon: GitFork, cor: "text-purple-600 bg-purple-50" },
  salvar_variavel: { label: "Salvar Variável", icon: Variable, cor: "text-emerald-600 bg-emerald-50" },
  fim: { label: "Fim", icon: Flag, cor: "text-gray-600 bg-gray-100" },
  randomizador: { label: "Randomizador", icon: Shuffle, cor: "text-orange-600 bg-orange-50" },
  webhook: { label: "Disparo de Webhook", icon: WebhookIcon, cor: "text-cyan-600 bg-cyan-50" },
  midia: { label: "Conteúdo com mídia", icon: Image, cor: "text-teal-600 bg-teal-50" },
  menu: { label: "Menu", icon: ListChecks, cor: "text-indigo-600 bg-indigo-50" },
  aplicar_etiqueta: { label: "Aplicar etiqueta", icon: Tag, cor: "text-rose-600 bg-rose-50" },
  incrementar_campo: { label: "Incrementar campo", icon: Hash, cor: "text-lime-600 bg-lime-50" },
};

const TIPOS_CRIAVEIS: NoTipo[] = ["mensagem", "aguardar", "condicional", "salvar_variavel", "randomizador", "webhook", "midia", "menu", "aplicar_etiqueta", "incrementar_campo", "fim"];

function configPadrao(tipo: NoTipo): any {
  switch (tipo) {
    case "mensagem": return { texto: "Nova mensagem" };
    case "aguardar": return { valor: 10, unidade: "minutos" };
    case "condicional": return { logica: "E", condicoes: [{ variavel: "variavel", operador: "existe" }], ordemSeVerdadeiro: null, ordemSeFalso: null };
    case "salvar_variavel": return { nome: "nova_variavel", origem: "fixo", valorFixo: "" };
    case "fim": return {};
    case "randomizador": return { ramos: [{ pesoPercentual: 50, ordemDestino: null }, { pesoPercentual: 50, ordemDestino: null }] };
    case "webhook": return { url: "", variavelResposta: "", campoResposta: "", ordemSeErro: null };
    case "midia": return { tipoMidia: "imagem", storageKey: "", nomeArquivo: "", legenda: "" };
    case "menu": return { texto: "Escolha uma opção:", opcoes: [{ label: "Opção 1", ordemDestino: null }], ordemSeNaoEntendeu: null, diasTimeoutSemResposta: 3 };
    case "aplicar_etiqueta": return { etiquetaNome: "" };
    case "incrementar_campo": return { campoNome: "", incremento: 1 };
  }
}

function resumoNo(no: FluxoNo): string {
  switch (no.tipo) {
    case "mensagem":
      return no.config?.texto ? `"${no.config.texto.slice(0, 80)}${no.config.texto.length > 80 ? "…" : ""}"` : "(vazio)";
    case "aguardar":
      return `${no.config?.valor} ${no.config?.unidade}`;
    case "condicional": {
      const n = no.config?.condicoes?.length ?? 0;
      return `${n} condição(ões) — ${no.config?.logica === "E" ? "todas" : "qualquer uma"}`;
    }
    case "salvar_variavel":
      return `{{${no.config?.nome}}} ← ${no.config?.origem === "ia" ? "extraído por IA" : `"${no.config?.valorFixo}"`}`;
    case "fim":
      return "Encerra a execução";
    case "randomizador": {
      const ramos = no.config?.ramos ?? [];
      return `${ramos.length} ramo(s): ${ramos.map((r: any) => `${r.pesoPercentual}%`).join(" / ")}`;
    }
    case "webhook":
      return no.config?.url ? `POST ${no.config.url}` : "(sem URL configurada)";
    case "midia":
      return no.config?.storageKey ? `${no.config.tipoMidia} — ${no.config.nomeArquivo ?? "arquivo enviado"}` : "(sem arquivo enviado)";
    case "menu": {
      const opcoes = no.config?.opcoes ?? [];
      return `"${(no.config?.texto ?? "").slice(0, 40)}${(no.config?.texto?.length ?? 0) > 40 ? "…" : ""}" — ${opcoes.length} opção(ões)`;
    }
    case "aplicar_etiqueta":
      return no.config?.etiquetaNome ? `Etiqueta "${no.config.etiquetaNome}"` : "(sem etiqueta definida)";
    case "incrementar_campo":
      return no.config?.campoNome ? `${no.config.campoNome} += ${no.config?.incremento ?? 1}` : "(sem campo definido)";
  }
}

// ─── Arestas derivadas do config (sem tabela própria) ──────────────────────
function derivarArestas(nos: FluxoNo[]): Edge[] {
  const porOrdem = new Map(nos.map((n) => [n.ordem, n]));
  const arestas: Edge[] = [];
  for (const no of nos) {
    if (no.tipo === "condicional") {
      const verdadeiro = no.config?.ordemSeVerdadeiro;
      const falso = no.config?.ordemSeFalso;
      if (verdadeiro != null && porOrdem.has(verdadeiro)) {
        arestas.push({
          id: `${no.id}-verdadeiro`, source: String(no.id), sourceHandle: "verdadeiro",
          target: String(porOrdem.get(verdadeiro)!.id), label: "Sim",
          style: { stroke: "#16a34a", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#16a34a" },
        });
      }
      if (falso != null && porOrdem.has(falso)) {
        arestas.push({
          id: `${no.id}-falso`, source: String(no.id), sourceHandle: "falso",
          target: String(porOrdem.get(falso)!.id), label: "Não",
          style: { stroke: "#dc2626", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#dc2626" },
        });
      }
    } else if (no.tipo === "randomizador") {
      const ramos = (no.config?.ramos ?? []) as Array<{ pesoPercentual: number; ordemDestino: number | null }>;
      ramos.forEach((ramo, i) => {
        if (ramo.ordemDestino != null && porOrdem.has(ramo.ordemDestino)) {
          arestas.push({
            id: `${no.id}-ramo-${i}`, source: String(no.id), sourceHandle: `ramo-${i}`,
            target: String(porOrdem.get(ramo.ordemDestino)!.id), label: `${ramo.pesoPercentual}%`,
            style: { stroke: "#ea580c", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#ea580c" },
          });
        }
      });
    } else if (no.tipo === "menu") {
      const opcoes = (no.config?.opcoes ?? []) as Array<{ label: string; ordemDestino: number | null }>;
      opcoes.forEach((opcao, i) => {
        if (opcao.ordemDestino != null && porOrdem.has(opcao.ordemDestino)) {
          arestas.push({
            id: `${no.id}-opcao-${i}`, source: String(no.id), sourceHandle: `opcao-${i}`,
            target: String(porOrdem.get(opcao.ordemDestino)!.id), label: opcao.label,
            style: { stroke: "#4f46e5", strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "#4f46e5" },
          });
        }
      });
      const naoEntendeu = no.config?.ordemSeNaoEntendeu;
      if (naoEntendeu != null && porOrdem.has(naoEntendeu)) {
        arestas.push({
          id: `${no.id}-nao-entendeu`, source: String(no.id), sourceHandle: "nao_entendeu",
          target: String(porOrdem.get(naoEntendeu)!.id), label: "Não entendeu",
          style: { stroke: "#dc2626", strokeWidth: 2.5, strokeDasharray: "5 4" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#dc2626" },
        });
      }
    } else if (no.tipo !== "fim" && no.proximoNoOrdem != null && porOrdem.has(no.proximoNoOrdem)) {
      arestas.push({
        id: `${no.id}-default`, source: String(no.id), sourceHandle: "default",
        target: String(porOrdem.get(no.proximoNoOrdem)!.id),
        style: { strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed },
      });
    }
    if (no.tipo === "webhook") {
      const erro = no.config?.ordemSeErro;
      if (erro != null && porOrdem.has(erro)) {
        arestas.push({
          id: `${no.id}-erro`, source: String(no.id), sourceHandle: "erro",
          target: String(porOrdem.get(erro)!.id), label: "Erro",
          style: { stroke: "#dc2626", strokeWidth: 2.5, strokeDasharray: "5 4" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#dc2626" },
        });
      }
    }
  }
  return arestas;
}

// ─── Auto-layout (BFS a partir da entrada, sem dagre/elkjs) ────────────────
const COL_WIDTH = 280;
const ROW_HEIGHT = 140;

function autoLayout(nos: FluxoNo[], entradaOrdem: number): Record<number, { x: number; y: number }> {
  const porOrdem = new Map(nos.map((n) => [n.ordem, n]));
  const posicoes: Record<number, { x: number; y: number }> = {};
  const visitado = new Set<number>();
  const proximaLinha: Record<number, number> = {};

  function visitar(ordem: number, profundidade: number) {
    if (visitado.has(ordem)) return;
    const no = porOrdem.get(ordem);
    if (!no) return;
    visitado.add(ordem);
    const linha = proximaLinha[profundidade] ?? 0;
    proximaLinha[profundidade] = linha + 1;
    posicoes[no.id] = { x: profundidade * COL_WIDTH, y: linha * ROW_HEIGHT };
    if (no.tipo === "condicional") {
      if (no.config?.ordemSeVerdadeiro != null) visitar(no.config.ordemSeVerdadeiro, profundidade + 1);
      if (no.config?.ordemSeFalso != null) visitar(no.config.ordemSeFalso, profundidade + 1);
    } else if (no.proximoNoOrdem != null) {
      visitar(no.proximoNoOrdem, profundidade + 1);
    }
  }

  if (porOrdem.has(entradaOrdem)) visitar(entradaOrdem, 0);

  const colunaOrfaos = Object.keys(proximaLinha).length + 2;
  let linhaOrfao = 0;
  for (const no of [...nos].sort((a, b) => a.ordem - b.ordem)) {
    if (!visitado.has(no.ordem)) {
      posicoes[no.id] = { x: colunaOrfaos * COL_WIDTH, y: linhaOrfao * ROW_HEIGHT };
      linhaOrfao++;
    }
  }
  return posicoes;
}

// ─── Card de nó no canvas ───────────────────────────────────────────────────
function FluxoNoCard({ data, selected }: NodeProps) {
  const no = (data as any).no as FluxoNo;
  const isEntrada = (data as any).isEntrada as boolean;
  const cliques = (data as any).cliques as Record<number, number> | undefined;
  const info = TIPO_INFO[no.tipo];
  const Icon = info.icon;
  return (
    <div className={`w-64 rounded-lg border bg-background shadow-sm cursor-pointer ${selected ? "ring-2 ring-primary" : ""}`}>
      <Handle type="target" position={Position.Top} />
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-lg ${info.cor}`}>
        <Icon size={14} />
        <span className="text-xs font-semibold flex-1">{info.label}</span>
        {isEntrada && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/80 flex items-center gap-0.5">
            <Star size={9} className="fill-current" /> INÍCIO
          </span>
        )}
      </div>
      <div className="px-3 py-2 text-xs text-muted-foreground line-clamp-3 min-h-[2.5rem]">{resumoNo(no)}</div>
      {no.tipo === "condicional" && (
        <div className="flex justify-between px-4 pb-1.5 text-[10px] font-medium">
          <span className="text-green-600">Sim</span>
          <span className="text-red-600">Não</span>
        </div>
      )}
      {no.tipo === "randomizador" && (
        <div className="flex justify-between px-3 pb-1.5 text-[10px] font-medium text-orange-600">
          {(no.config?.ramos ?? []).map((r: any, i: number) => <span key={i}>{r.pesoPercentual}%</span>)}
        </div>
      )}
      {no.tipo === "webhook" && (
        <div className="flex justify-between px-4 pb-1.5 text-[10px] font-medium">
          <span className="text-foreground">Sucesso</span>
          <span className="text-red-600">Erro</span>
        </div>
      )}
      {no.tipo === "menu" && (
        <>
          <div className="flex justify-between px-3 pb-1.5 text-[10px] font-medium text-indigo-600">
            {(no.config?.opcoes ?? []).map((o: any, i: number) => <span key={i} className="truncate max-w-[4rem]">{o.label}</span>)}
            <span className="text-red-600">?</span>
          </div>
          {!!no.enviados && (
            <div className="px-3 pb-1.5 space-y-0.5 border-t border-border/50 pt-1.5">
              <p className="text-[10px] text-muted-foreground">{no.enviados} enviado(s)</p>
              {(no.config?.opcoes ?? []).map((o: any, i: number) => {
                const n = cliques?.[i] ?? 0;
                const pct = no.enviados ? Math.round((n / no.enviados) * 100) : 0;
                return (
                  <p key={i} className="text-[10px] text-muted-foreground truncate">
                    {o.label}: {n} ({pct}%)
                  </p>
                );
              })}
            </div>
          )}
        </>
      )}
      {no.tipo === "condicional" ? (
        <>
          <Handle type="source" position={Position.Bottom} id="verdadeiro" style={{ left: "30%", background: "#16a34a" }} />
          <Handle type="source" position={Position.Bottom} id="falso" style={{ left: "70%", background: "#dc2626" }} />
        </>
      ) : no.tipo === "randomizador" ? (
        (no.config?.ramos ?? []).map((_: any, i: number, arr: any[]) => (
          <Handle
            key={i} type="source" position={Position.Bottom} id={`ramo-${i}`}
            style={{ left: `${((i + 1) / (arr.length + 1)) * 100}%`, background: "#ea580c" }}
          />
        ))
      ) : no.tipo === "webhook" ? (
        <>
          <Handle type="source" position={Position.Bottom} id="default" style={{ left: "30%" }} />
          <Handle type="source" position={Position.Bottom} id="erro" style={{ left: "70%", background: "#dc2626" }} />
        </>
      ) : no.tipo === "menu" ? (
        <>
          {(no.config?.opcoes ?? []).map((_: any, i: number, arr: any[]) => (
            <Handle
              key={i} type="source" position={Position.Bottom} id={`opcao-${i}`}
              style={{ left: `${((i + 1) / (arr.length + 2)) * 100}%`, background: "#4f46e5" }}
            />
          ))}
          <Handle type="source" position={Position.Bottom} id="nao_entendeu" style={{ left: "95%", background: "#dc2626" }} />
        </>
      ) : no.tipo !== "fim" ? (
        <Handle type="source" position={Position.Bottom} id="default" />
      ) : (
        <div className="pb-1" />
      )}
    </div>
  );
}

const NODE_TYPES = { fluxoNo: FluxoNoCard };

export default function FluxoDetalhe() {
  const params = useParams<{ id: string }>();
  const fluxoId = parseInt(params.id);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.fluxos.get.useQuery({ id: fluxoId });
  const { data: execucoes = [], error: execucoesError } = trpc.fluxos.execucoes.list.useQuery({ fluxoId });

  const [showTestar, setShowTestar] = useState(false);
  const [selectedNoId, setSelectedNoId] = useState<number | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [execucoesAbertas, setExecucoesAbertas] = useState(false);

  // Devolve a Promise (não "fire-and-forget") — quem fecha um painel logo depois
  // de salvar precisa esperar essa atualização terminar, senão reabrir o nó em
  // seguida usa o `nos` ainda desatualizado do cache e mostra o valor antigo.
  const invalidateAll = () => {
    return Promise.all([
      utils.fluxos.get.invalidate({ id: fluxoId }),
      utils.fluxos.execucoes.list.invalidate({ fluxoId }),
    ]);
  };

  const createNoMut = trpc.fluxos.nos.create.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const updateNoMut = trpc.fluxos.nos.update.useMutation({
    onError: (e) => toast.error(e.message),
  });
  const deleteNoMut = trpc.fluxos.nos.excluir.useMutation({
    onSuccess: async () => { await invalidateAll(); toast.success("Passo removido"); setSelectedNoId(null); },
    onError: (e) => toast.error(e.message),
  });
  const updateFluxoMut = trpc.fluxos.update.useMutation({
    onSuccess: async () => { await invalidateAll(); toast.success("Início do fluxo atualizado"); },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-6 text-center text-muted-foreground">Carregando...</div>;
  if (!data) return <div className="p-6 text-center text-muted-foreground">Fluxo não encontrado.</div>;

  const { fluxo, nos, cliques } = data as { fluxo: any; nos: FluxoNo[]; cliques?: Array<{ fluxoNoId: number; opcaoIndex: number; cliques: number }> };

  // noId -> opcaoIndex -> cliques, pra CTR por opção no card do nó "menu"
  // (contadores só existem depois que um Disparo real roda por cima
  // desse fluxo — ver server/fluxosMenu.ts).
  const cliquesPorNo = new Map<number, Record<number, number>>();
  for (const c of cliques ?? []) {
    const mapaNo = cliquesPorNo.get(c.fluxoNoId) ?? {};
    mapaNo[c.opcaoIndex] = c.cliques;
    cliquesPorNo.set(c.fluxoNoId, mapaNo);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] gap-4">
      <div className="flex items-center gap-3 shrink-0 flex-wrap">
        <Link href="/fluxos">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0"><ArrowLeft size={16} /></Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate" style={{ fontFamily: "'Cormorant Garamond', serif" }}>{fluxo.nome}</h1>
          {fluxo.descricao && <p className="text-sm text-muted-foreground truncate">{fluxo.descricao}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0" title="Se ligado, esse fluxo aparece como opção ao criar um Script tipo 'Executar fluxo' — é o único jeito de disparar um fluxo numa conversa. Deixe desligado pra fluxos automáticos (gatilho de recepção, menu, bot etc.), que não devem ser disparados manualmente.">
          <Switch
            checked={!!fluxo.visivelNoInbox}
            onCheckedChange={(v) => updateFluxoMut.mutate({ id: fluxo.id, visivelNoInbox: v })}
          />
          <span className="text-xs text-muted-foreground">Visível para criação de script</span>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              <Zap size={14} className="mr-1" /> Gatilho: {GATILHO_LABELS[fluxo.gatilhoTipo ?? "manual"]}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto max-w-[90vw]">
            <GatilhoAutomaticoBar fluxo={fluxo} updateFluxoMut={updateFluxoMut} />
          </PopoverContent>
        </Popover>
        <Button size="sm" onClick={() => setShowTestar(true)}>
          <Play size={14} className="mr-1" /> Testar com uma conversa
        </Button>
      </div>

      <div className="flex-1 min-h-0 border rounded-lg overflow-hidden relative">
        <ReactFlowProvider>
          <FluxoCanvas
            key={fluxoId}
            fluxoId={fluxoId}
            fluxo={fluxo}
            nos={nos}
            cliquesPorNo={cliquesPorNo}
            selectedNoId={selectedNoId}
            setSelectedNoId={setSelectedNoId}
            showAddMenu={showAddMenu}
            setShowAddMenu={setShowAddMenu}
            createNoMut={createNoMut}
            updateNoMut={updateNoMut}
            updateFluxoMut={updateFluxoMut}
            deleteNoMut={deleteNoMut}
            invalidateAll={invalidateAll}
          />
        </ReactFlowProvider>
      </div>

      <Collapsible open={execucoesAbertas} onOpenChange={setExecucoesAbertas}>
        <Card className="border-border/50 shadow-sm shrink-0">
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-2 cursor-pointer select-none flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Execuções ({execucoes.length})</CardTitle>
              <ChevronDown size={16} className={`text-muted-foreground transition-transform ${execucoesAbertas ? "rotate-180" : ""}`} />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="p-0 max-h-56 overflow-y-auto">
              {execucoesError ? (
                <p className="text-sm text-destructive text-center py-6">Erro ao carregar execuções: {execucoesError.message}</p>
              ) : execucoes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma execução ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Contato</th>
                        <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Status</th>
                        <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Passo atual</th>
                        <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Iniciado em</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(execucoes as any[]).map((e) => (
                        <tr key={e.id} className="border-b last:border-0">
                          <td className="px-4 py-2.5">{e.clienteNome ?? e.conversaNome ?? e.conversaTelefone ?? `Conversa #${e.conversaId}`}</td>
                          <td className="px-4 py-2.5">
                            <Badge variant={
                              e.status === "erro" ? "destructive" : e.status === "concluido" ? "default" : "secondary"
                            } className="text-xs">
                              {e.status}
                            </Badge>
                            {e.erroMsg && <p className="text-xs text-destructive mt-0.5">{e.erroMsg}</p>}
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {(() => {
                              const noAtual = nos.find((n) => n.ordem === e.noAtualOrdem);
                              return noAtual ? TIPO_INFO[noAtual.tipo].label : `Passo #${e.noAtualOrdem}`;
                            })()}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(e.iniciadoEm).toLocaleString("pt-BR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <TestarComConversaDialog open={showTestar} onOpenChange={setShowTestar} fluxoId={fluxoId} unidadeId={fluxo.unidadeId} onIniciado={invalidateAll} />
    </div>
  );
}

// ─── Canvas + painel lateral ────────────────────────────────────────────────
function FluxoCanvas({
  fluxoId, fluxo, nos, cliquesPorNo, selectedNoId, setSelectedNoId, showAddMenu, setShowAddMenu,
  createNoMut, updateNoMut, updateFluxoMut, deleteNoMut, invalidateAll,
}: {
  fluxoId: number;
  fluxo: any;
  nos: FluxoNo[];
  cliquesPorNo: Map<number, Record<number, number>>;
  selectedNoId: number | null;
  setSelectedNoId: (id: number | null) => void;
  showAddMenu: boolean;
  setShowAddMenu: (v: boolean) => void;
  createNoMut: ReturnType<typeof trpc.fluxos.nos.create.useMutation>;
  updateNoMut: ReturnType<typeof trpc.fluxos.nos.update.useMutation>;
  updateFluxoMut: ReturnType<typeof trpc.fluxos.update.useMutation>;
  deleteNoMut: ReturnType<typeof trpc.fluxos.nos.excluir.useMutation>;
  invalidateAll: () => Promise<any>;
}) {
  const entradaOrdem = fluxo.entradaNoOrdem ?? (nos.length > 0 ? Math.min(...nos.map((n) => n.ordem)) : null);

  const nodesIniciais = useMemo<Node[]>(() => nos.map((no) => ({
    id: String(no.id),
    type: "fluxoNo",
    position: { x: no.posX ?? 0, y: no.posY ?? 0 },
    data: { no, isEntrada: no.ordem === entradaOrdem, cliques: cliquesPorNo.get(no.id) },
  })), [nos, entradaOrdem, cliquesPorNo]);

  const edgesIniciais = useMemo(() => derivarArestas(nos), [nos]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(nodesIniciais);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(edgesIniciais);

  const layoutRodadoRef = useRef<Set<number>>(new Set());

  // Reconcilia o estado local com os dados frescos da query a cada refetch
  // (nó criado, aresta conectada, config editada) — preserva posição/seleção
  // dos nós já existentes (não re-semeia do zero), só adiciona/atualiza o que
  // mudou. Arestas não têm estado local próprio, então são sempre substituídas.
  useEffect(() => {
    setRfNodes((atuais) => {
      const porId = new Map(atuais.map((n) => [n.id, n]));
      return nodesIniciais.map((novo) => {
        const existente = porId.get(novo.id);
        return existente ? { ...existente, data: novo.data } : novo;
      });
    });
    setRfEdges(edgesIniciais);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nos, entradaOrdem]);

  // Ao carregar um fluxo com algum nó sem posição, roda o auto-layout uma vez.
  useEffect(() => {
    if (layoutRodadoRef.current.has(fluxoId)) return;
    if (nos.length === 0) return;
    const semPosicao = nos.some((n) => n.posX == null || n.posY == null);
    if (!semPosicao || entradaOrdem == null) return;
    layoutRodadoRef.current.add(fluxoId);
    const posicoes = autoLayout(nos, entradaOrdem);
    setRfNodes((atuais) => atuais.map((n) => {
      const pos = posicoes[Number(n.id)];
      return pos ? { ...n, position: pos } : n;
    }));
    // Persiste as posições calculadas.
    for (const no of nos) {
      const pos = posicoes[no.id];
      if (pos) updateNoMut.mutate({ id: no.id, posX: Math.round(pos.x), posY: Math.round(pos.y) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fluxoId, nos.length]);

  const nosPorId = useMemo(() => new Map(nos.map((n) => [n.id, n])), [nos]);

  const onConnect = useCallback((conn: Connection) => {
    const sourceId = Number(conn.source);
    const targetId = Number(conn.target);
    const source = nosPorId.get(sourceId);
    const target = nosPorId.get(targetId);
    if (!source || !target) return;
    if (source.tipo === "condicional") {
      const handle = conn.sourceHandle === "falso" ? "ordemSeFalso" : "ordemSeVerdadeiro";
      updateNoMut.mutate({
        id: sourceId,
        config: { ...source.config, [handle]: target.ordem },
      }, { onSuccess: invalidateAll });
    } else if (source.tipo === "randomizador" && conn.sourceHandle?.startsWith("ramo-")) {
      const i = Number(conn.sourceHandle.slice("ramo-".length));
      const ramos = [...(source.config?.ramos ?? [])];
      if (ramos[i]) {
        ramos[i] = { ...ramos[i], ordemDestino: target.ordem };
        updateNoMut.mutate({ id: sourceId, config: { ...source.config, ramos } }, { onSuccess: invalidateAll });
      }
    } else if (source.tipo === "webhook" && conn.sourceHandle === "erro") {
      updateNoMut.mutate({
        id: sourceId,
        config: { ...source.config, ordemSeErro: target.ordem },
      }, { onSuccess: invalidateAll });
    } else if (source.tipo === "menu" && conn.sourceHandle?.startsWith("opcao-")) {
      const i = Number(conn.sourceHandle.slice("opcao-".length));
      const opcoes = [...(source.config?.opcoes ?? [])];
      if (opcoes[i]) {
        opcoes[i] = { ...opcoes[i], ordemDestino: target.ordem };
        updateNoMut.mutate({ id: sourceId, config: { ...source.config, opcoes } }, { onSuccess: invalidateAll });
      }
    } else if (source.tipo === "menu" && conn.sourceHandle === "nao_entendeu") {
      updateNoMut.mutate({
        id: sourceId,
        config: { ...source.config, ordemSeNaoEntendeu: target.ordem },
      }, { onSuccess: invalidateAll });
    } else {
      updateNoMut.mutate({ id: sourceId, proximoNoOrdem: target.ordem }, { onSuccess: invalidateAll });
    }
  }, [nosPorId, updateNoMut, invalidateAll]);

  // Apagar uma aresta no canvas (selecionar + Delete) só mexia no estado
  // local do React Flow — a aresta é só uma representação visual de um
  // campo do nó de origem (proximoNoOrdem/ordemSeVerdadeiro/ordemSeFalso/
  // ramo.ordemDestino/opcao.ordemDestino/ordemSeErro/ordemSeNaoEntendeu),
  // sem persistir nada, o próximo refetch recalculava as arestas a partir
  // dos dados antigos do servidor e a conexão "voltava". Espelha o inverso
  // exato de onConnect, zerando o campo de origem certo.
  const onEdgesDelete = useCallback((arestasRemovidas: Edge[]) => {
    for (const aresta of arestasRemovidas) {
      const sourceId = Number(aresta.source);
      const source = nosPorId.get(sourceId);
      if (!source) continue;
      if (source.tipo === "condicional") {
        const handle = aresta.sourceHandle === "falso" ? "ordemSeFalso" : "ordemSeVerdadeiro";
        updateNoMut.mutate({ id: sourceId, config: { ...source.config, [handle]: null } }, { onSuccess: invalidateAll });
      } else if (source.tipo === "randomizador" && aresta.sourceHandle?.startsWith("ramo-")) {
        const i = Number(aresta.sourceHandle.slice("ramo-".length));
        const ramos = [...(source.config?.ramos ?? [])];
        if (ramos[i]) {
          ramos[i] = { ...ramos[i], ordemDestino: null };
          updateNoMut.mutate({ id: sourceId, config: { ...source.config, ramos } }, { onSuccess: invalidateAll });
        }
      } else if (source.tipo === "webhook" && aresta.sourceHandle === "erro") {
        updateNoMut.mutate({ id: sourceId, config: { ...source.config, ordemSeErro: null } }, { onSuccess: invalidateAll });
      } else if (source.tipo === "menu" && aresta.sourceHandle?.startsWith("opcao-")) {
        const i = Number(aresta.sourceHandle.slice("opcao-".length));
        const opcoes = [...(source.config?.opcoes ?? [])];
        if (opcoes[i]) {
          opcoes[i] = { ...opcoes[i], ordemDestino: null };
          updateNoMut.mutate({ id: sourceId, config: { ...source.config, opcoes } }, { onSuccess: invalidateAll });
        }
      } else if (source.tipo === "menu" && aresta.sourceHandle === "nao_entendeu") {
        updateNoMut.mutate({ id: sourceId, config: { ...source.config, ordemSeNaoEntendeu: null } }, { onSuccess: invalidateAll });
      } else {
        updateNoMut.mutate({ id: sourceId, proximoNoOrdem: null }, { onSuccess: invalidateAll });
      }
    }
  }, [nosPorId, updateNoMut, invalidateAll]);

  // Mesmo problema do lado dos nós: apagar pelo teclado (Delete/Backspace
  // com o nó selecionado) só removia do estado local — nunca chamava a
  // mutation de exclusão (só o botão de lixeira no painel lateral fazia
  // isso). O próximo refetch trazia o nó de volta.
  const onNodesDelete = useCallback((nosRemovidos: Node[]) => {
    for (const node of nosRemovidos) {
      deleteNoMut.mutate({ id: Number(node.id) });
    }
  }, [deleteNoMut]);

  const onNodeDragStop = useCallback((_e: any, node: Node) => {
    updateNoMut.mutate({ id: Number(node.id), posX: Math.round(node.position.x), posY: Math.round(node.position.y) });
  }, [updateNoMut]);

  const onNodeClick = useCallback((_e: any, node: Node) => {
    setSelectedNoId(Number(node.id));
  }, [setSelectedNoId]);

  const adicionarNo = (tipo: NoTipo) => {
    const proximaOrdem = nos.length > 0 ? Math.max(...nos.map((n) => n.ordem)) + 1 : 1;
    const maxY = nos.reduce((m, n) => Math.max(m, n.posY ?? 0), -ROW_HEIGHT);
    createNoMut.mutate(
      { fluxoId, tipo, ordem: proximaOrdem, config: configPadrao(tipo), posX: 40, posY: maxY + ROW_HEIGHT },
      {
        onSuccess: ({ id }) => {
          invalidateAll();
          setShowAddMenu(false);
          if (id) setSelectedNoId(id);
          toast.success("Passo adicionado — configure ao lado");
        },
      }
    );
  };

  const noSelecionado = selectedNoId != null ? nos.find((n) => n.id === selectedNoId) ?? null : null;

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        nodeTypes={NODE_TYPES}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable className="!bg-muted" />
        <Panel position="top-right">
          <div className="relative">
            <Button size="sm" onClick={() => setShowAddMenu(!showAddMenu)}>
              <Plus size={14} className="mr-1" /> Adicionar passo
            </Button>
            {showAddMenu && (
              <div className="absolute right-0 mt-1 w-48 max-h-80 overflow-y-auto bg-background border rounded-md shadow-lg py-1 z-10">
                {TIPOS_CRIAVEIS.map((tipo) => {
                  const info = TIPO_INFO[tipo];
                  const Icon = info.icon;
                  return (
                    <button
                      key={tipo}
                      type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 text-left"
                      onClick={() => adicionarNo(tipo)}
                    >
                      <Icon size={14} /> {info.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Panel>
      </ReactFlow>

      <Sheet open={noSelecionado !== null} onOpenChange={(v) => !v && setSelectedNoId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {noSelecionado && (
            <NoPainel
              key={noSelecionado.id}
              no={noSelecionado}
              nos={nos}
              isEntrada={noSelecionado.ordem === entradaOrdem}
              onSalvar={(config) => {
                updateNoMut.mutate({ id: noSelecionado.id, config }, {
                  onSuccess: async () => { await invalidateAll(); toast.success("Passo atualizado"); setSelectedNoId(null); },
                });
              }}
              onDefinirComoInicio={() => {
                updateFluxoMut.mutate({ id: fluxoId, entradaNoOrdem: noSelecionado.ordem });
              }}
              salvando={updateNoMut.isPending}
              onFechar={() => setSelectedNoId(null)}
              deleteNoMut={deleteNoMut}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Painel lateral de edição ───────────────────────────────────────────────
type CondicaoForm = { variavel: string; operador: string; valor: string };
const CONDICAO_VAZIA: CondicaoForm = { variavel: "", operador: "existe", valor: "" };

const VARIAVEIS_BUILTIN = [
  { nome: "nome", dica: "nome do cliente/contato" },
  { nome: "first_name", dica: "primeiro nome do cliente" },
  { nome: "telefone", dica: "telefone do contato" },
  { nome: "email", dica: "email do cliente" },
  { nome: "campanha_do_mes", dica: "texto atual da Campanha do Mês da unidade" },
];

/** Botão que abre uma lista das variáveis conhecidas (cliente + salvar_variavel do fluxo) e insere `{{nome}}` no texto ao clicar. */
function VariavelPicker({ nos, onInserir }: { nos: FluxoNo[]; onInserir: (nome: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const doFluxo = nos
    .filter((n) => n.tipo === "salvar_variavel" && n.config?.nome)
    .map((n) => ({ nome: n.config.nome as string, dica: "definida por 'Salvar Variável'" }));
  const opcoes = [...VARIAVEIS_BUILTIN, ...doFluxo];

  return (
    <div className="relative inline-block">
      <Button type="button" size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setAberto((v) => !v)}>
        {"{ }"} inserir variável
      </Button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 mt-1 w-56 max-h-60 overflow-y-auto bg-background border rounded-md shadow-lg py-1 z-20">
            {opcoes.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3 py-2">Nenhuma variável ainda — crie uma com o passo "Salvar Variável".</p>
            ) : (
              opcoes.map((o) => (
                <button
                  key={o.nome}
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50"
                  onClick={() => { onInserir(o.nome); setAberto(false); }}
                >
                  <span className="font-mono">{"{{" + o.nome + "}}"}</span>
                  <span className="text-muted-foreground ml-1.5">{o.dica}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function NoPainel({
  no, nos, isEntrada, onSalvar, onDefinirComoInicio, onFechar, salvando, deleteNoMut,
}: {
  no: FluxoNo;
  nos: FluxoNo[];
  isEntrada: boolean;
  onSalvar: (config: any) => void;
  onDefinirComoInicio: () => void;
  onFechar: () => void;
  salvando: boolean;
  deleteNoMut: ReturnType<typeof trpc.fluxos.nos.excluir.useMutation>;
}) {
  const info = TIPO_INFO[no.tipo];
  const Icon = info.icon;

  const [texto, setTexto] = useState(no.config?.texto ?? "");
  const [valorEspera, setValorEspera] = useState(String(no.config?.valor ?? 10));
  const [unidade, setUnidade] = useState<"segundos" | "minutos" | "horas" | "dias">(no.config?.unidade ?? "minutos");
  const [mostrarDigitando, setMostrarDigitando] = useState(!!no.config?.mostrarDigitando);
  // "Digitando..." só faz sentido pra espera curta: a Z-API só aceita até
  // 15s de delayTyping, e esse tempo passa a SER a própria espera (ver
  // fluxos.ts, case "aguardar") — não faz sentido pra minutos/horas/dias.
  const digitandoDisponivel = unidade === "segundos" && (parseInt(valorEspera) || 0) >= 1 && (parseInt(valorEspera) || 0) <= 15;
  useEffect(() => {
    if (!digitandoDisponivel && mostrarDigitando) setMostrarDigitando(false);
  }, [digitandoDisponivel, mostrarDigitando]);
  const [logica, setLogica] = useState<"E" | "OU">(no.config?.logica ?? "E");
  const [condicoes, setCondicoes] = useState<CondicaoForm[]>(
    (no.config?.condicoes ?? [{ ...CONDICAO_VAZIA }]).map((c: any) => ({
      variavel: c.variavel ?? "", operador: c.operador ?? "existe", valor: c.valor ?? "",
    }))
  );
  const [nomeVar, setNomeVar] = useState(no.config?.nome ?? "");
  const [origem, setOrigem] = useState<"fixo" | "ia">(no.config?.origem ?? "fixo");
  const [valorFixo, setValorFixo] = useState(no.config?.valorFixo ?? "");
  const [promptIa, setPromptIa] = useState(no.config?.promptIa ?? "");
  const [ramos, setRamos] = useState<Array<{ pesoPercentual: number; ordemDestino: number | null }>>(
    no.config?.ramos ?? [{ pesoPercentual: 50, ordemDestino: null }, { pesoPercentual: 50, ordemDestino: null }]
  );
  const [webhookUrl, setWebhookUrl] = useState(no.config?.url ?? "");
  const [variavelResposta, setVariavelResposta] = useState(no.config?.variavelResposta ?? "");
  const [campoResposta, setCampoResposta] = useState(no.config?.campoResposta ?? "");
  const [tipoMidia, setTipoMidia] = useState<"imagem" | "audio" | "documento">(no.config?.tipoMidia ?? "imagem");
  const [storageKey, setStorageKey] = useState(no.config?.storageKey ?? "");
  const [nomeArquivoMidia, setNomeArquivoMidia] = useState(no.config?.nomeArquivo ?? "");
  const [legenda, setLegenda] = useState(no.config?.legenda ?? "");
  const [textoMenu, setTextoMenu] = useState(no.config?.texto ?? "Escolha uma opção:");
  const [opcoesMenu, setOpcoesMenu] = useState<Array<{ label: string; ordemDestino: number | null; descricao?: string }>>(
    no.config?.opcoes ?? [{ label: "Opção 1", ordemDestino: null }]
  );
  const [timeoutMenu, setTimeoutMenu] = useState(String(no.config?.diasTimeoutSemResposta ?? 3));
  const [estiloMenu, setEstiloMenu] = useState<"texto" | "botoes" | "lista">(no.config?.estilo ?? "texto");
  const [etiquetaNome, setEtiquetaNome] = useState(no.config?.etiquetaNome ?? "");
  const [campoNome, setCampoNome] = useState(no.config?.campoNome ?? "");
  const [incremento, setIncremento] = useState(String(no.config?.incremento ?? 1));
  const etiquetasQuery = trpc.etiquetas.list.useQuery(undefined, { enabled: no.tipo === "aplicar_etiqueta" });
  const camposPersonalizadosQuery = trpc.camposPersonalizados.list.useQuery(undefined, { enabled: no.tipo === "incrementar_campo" });

  const uploadMidiaMut = trpc.fluxos.nos.uploadMidia.useMutation({
    onSuccess: (r) => toast.success("Arquivo enviado — " + r.storageKey.split("/").pop()),
    onError: (e) => toast.error(e.message),
  });
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1] ?? "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  async function handleUploadMidia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) { toast.error("Arquivo muito grande (máx. 16 MB)"); return; }
    const conteudoBase64 = await fileToBase64(file);
    const result = await uploadMidiaMut.mutateAsync({ nomeArquivo: file.name, conteudoBase64, mimeType: file.type || "application/octet-stream" });
    setStorageKey(result.storageKey);
    setNomeArquivoMidia(file.name);
  }

  const salvar = () => {
    let config: any;
    switch (no.tipo) {
      case "mensagem": config = { texto }; break;
      case "aguardar": config = { valor: parseInt(valorEspera) || 1, unidade, mostrarDigitando: mostrarDigitando || undefined }; break;
      case "condicional":
        config = {
          logica,
          condicoes: condicoes.filter((c) => c.variavel.trim()),
          ordemSeVerdadeiro: no.config?.ordemSeVerdadeiro ?? null,
          ordemSeFalso: no.config?.ordemSeFalso ?? null,
        };
        break;
      case "salvar_variavel": config = { nome: nomeVar, origem, valorFixo: valorFixo || undefined, promptIa: promptIa || undefined }; break;
      case "fim": config = {}; break;
      case "randomizador":
        config = { ramos };
        break;
      case "webhook":
        config = {
          url: webhookUrl.trim(),
          variavelResposta: variavelResposta.trim() || undefined,
          campoResposta: campoResposta.trim() || undefined,
          ordemSeErro: no.config?.ordemSeErro ?? null,
        };
        break;
      case "midia":
        config = {
          tipoMidia,
          storageKey,
          nomeArquivo: nomeArquivoMidia || undefined,
          legenda: legenda.trim() || undefined,
        };
        break;
      case "menu": {
        const limiteOpcoes = estiloMenu === "botoes" ? 3 : estiloMenu === "lista" ? 10 : Infinity;
        config = {
          texto: textoMenu,
          opcoes: opcoesMenu
            .filter((o) => o.label.trim())
            .slice(0, limiteOpcoes)
            .map((o) => ({ label: o.label, ordemDestino: o.ordemDestino, descricao: o.descricao?.trim() || undefined })),
          ordemSeNaoEntendeu: no.config?.ordemSeNaoEntendeu ?? null,
          diasTimeoutSemResposta: parseInt(timeoutMenu) || 3,
          estilo: estiloMenu,
        };
        break;
      }
      case "aplicar_etiqueta": config = { etiquetaNome: etiquetaNome.trim() }; break;
      case "incrementar_campo": config = { campoNome: campoNome.trim(), incremento: parseInt(incremento) || 1 }; break;
    }
    onSalvar(config);
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <span className={`p-1.5 rounded ${info.cor}`}><Icon size={14} /></span>
          {info.label}
          {isEntrada && <Badge variant="outline" className="text-[10px]">Início</Badge>}
        </SheetTitle>
      </SheetHeader>

      <div className="px-4 space-y-4 flex-1">
        {!isEntrada && (
          <Button size="sm" variant="outline" onClick={onDefinirComoInicio}>
            <Star size={13} className="mr-1" /> Definir como início do fluxo
          </Button>
        )}

        {no.tipo === "mensagem" && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-muted-foreground">Texto da mensagem</label>
              <VariavelPicker nos={nos} onInserir={(nome) => setTexto(texto + `{{${nome}}}`)} />
            </div>
            <Textarea rows={5} placeholder="Ex: Oi {{nome}}, tudo bem?" value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
        )}

        {no.tipo === "aguardar" && (
          <div className="flex items-end gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Duração</label>
              <Input type="number" min="1" className="w-28" value={valorEspera} onChange={(e) => setValorEspera(e.target.value)} />
            </div>
            <Select value={unidade} onValueChange={(v) => setUnidade(v as any)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="segundos">Segundos</SelectItem>
                <SelectItem value="minutos">Minutos</SelectItem>
                <SelectItem value="horas">Horas</SelectItem>
                <SelectItem value="dias">Dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {no.tipo === "aguardar" && unidade !== "segundos" && (
          <p className="text-[11px] text-muted-foreground">
            A retomada roda pelo cron a cada ~5s — durações curtas podem levar até 5s a mais pra retomar.
          </p>
        )}
        {no.tipo === "aguardar" && (
          digitandoDisponivel ? (
            <div className="flex items-center gap-2" title={`Aplica os ${valorEspera}s no próximo passo, sem espera extra. Se o próximo passo for Mensagem, mostra "Digitando..." pro cliente durante esse tempo; se for Mídia (imagem/documento), a Z-API não tem indicador visual — só atrasa o envio em silêncio pelo mesmo tempo; áudio mostra "Gravando áudio...".`}>
              <Switch checked={mostrarDigitando} onCheckedChange={setMostrarDigitando} />
              <span className="text-xs text-muted-foreground">Mostrar "Digitando..." durante a espera</span>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              "Digitando..." só está disponível pra Aguardar em segundos, até 15s (limite da Z-API).
            </p>
          )
        )}

        {no.tipo === "condicional" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">As saídas "Sim"/"Não" são definidas arrastando uma conexão a partir dos pontos verde/vermelho do card no canvas.</p>
            <Select value={logica} onValueChange={(v) => setLogica(v as "E" | "OU")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="E">Corresponde a TODAS as condições</SelectItem>
                <SelectItem value="OU">Corresponde a QUALQUER condição</SelectItem>
              </SelectContent>
            </Select>

            {condicoes.map((c, i) => (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <Input
                  placeholder="variável" className="w-28" value={c.variavel}
                  onChange={(e) => { const arr = [...condicoes]; arr[i] = { ...c, variavel: e.target.value }; setCondicoes(arr); }}
                />
                <Select value={c.operador} onValueChange={(v) => { const arr = [...condicoes]; arr[i] = { ...c, operador: v }; setCondicoes(arr); }}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="existe">existe</SelectItem>
                    <SelectItem value="nao_existe">não existe</SelectItem>
                    <SelectItem value="igual">é igual a</SelectItem>
                    <SelectItem value="diferente">é diferente de</SelectItem>
                    <SelectItem value="contem">contém</SelectItem>
                  </SelectContent>
                </Select>
                {(c.operador === "igual" || c.operador === "diferente" || c.operador === "contem") && (
                  <Input
                    placeholder="valor" className="w-24" value={c.valor}
                    onChange={(e) => { const arr = [...condicoes]; arr[i] = { ...c, valor: e.target.value }; setCondicoes(arr); }}
                  />
                )}
                <Button
                  size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive shrink-0"
                  onClick={() => setCondicoes(condicoes.filter((_, idx) => idx !== i))}
                  disabled={condicoes.length <= 1}
                >
                  <X size={13} />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setCondicoes([...condicoes, { ...CONDICAO_VAZIA }])}>
              <Plus size={13} className="mr-1" /> Adicionar condição
            </Button>
          </div>
        )}

        {no.tipo === "salvar_variavel" && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome da variável</label>
              <Input placeholder="Ex: respondeu" value={nomeVar} onChange={(e) => setNomeVar(e.target.value)} />
            </div>
            <Select value={origem} onValueChange={(v) => setOrigem(v as "fixo" | "ia")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixo">Valor fixo</SelectItem>
                <SelectItem value="ia">Extrair da conversa via IA</SelectItem>
              </SelectContent>
            </Select>
            {origem === "fixo" ? (
              <div>
                <div className="flex justify-end mb-1">
                  <VariavelPicker nos={nos} onInserir={(nome) => setValorFixo(valorFixo + `{{${nome}}}`)} />
                </div>
                <Input placeholder="Valor" value={valorFixo} onChange={(e) => setValorFixo(e.target.value)} />
              </div>
            ) : (
              <Textarea rows={3} placeholder="Ex: Extraia se o cliente confirmou o horário. Responda apenas sim ou não." value={promptIa} onChange={(e) => setPromptIa(e.target.value)} />
            )}
          </div>
        )}

        {no.tipo === "fim" && (
          <p className="text-sm text-muted-foreground">Este passo encerra a execução do fluxo — não precisa de configuração.</p>
        )}

        {no.tipo === "randomizador" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Sorteia um dos ramos abaixo pelo peso configurado. Os destinos de cada ramo são definidos arrastando uma conexão a partir dos pontos laranja do card no canvas.
            </p>
            {ramos.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-14 shrink-0">Ramo {i + 1}</span>
                <Input
                  type="number" min="1" className="w-20" value={r.pesoPercentual}
                  onChange={(e) => {
                    const arr = [...ramos];
                    arr[i] = { ...r, pesoPercentual: Number(e.target.value) || 1 };
                    setRamos(arr);
                  }}
                />
                <span className="text-xs text-muted-foreground">%</span>
                <Button
                  size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive shrink-0 ml-auto"
                  onClick={() => setRamos(ramos.filter((_, idx) => idx !== i))}
                  disabled={ramos.length <= 2}
                >
                  <X size={13} />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setRamos([...ramos, { pesoPercentual: 10, ordemDestino: null }])}>
              <Plus size={13} className="mr-1" /> Adicionar ramo
            </Button>
          </div>
        )}

        {no.tipo === "webhook" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Chama a URL abaixo (POST) com as variáveis do fluxo como corpo. A saída "Sucesso" (ponto padrão) e "Erro" (ponto vermelho, ligar arrastando no canvas) definem o que roda depois em cada caso.
            </p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">URL</label>
              <Input placeholder="https://..." value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
            </div>
            <div className="flex items-end gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Salvar resposta na variável (opcional)</label>
                <Input placeholder="minha_variavel" className="w-40" value={variavelResposta} onChange={(e) => setVariavelResposta(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Campo no JSON de resposta</label>
                <Input placeholder="Ex: data.status" className="w-40" value={campoResposta} onChange={(e) => setCampoResposta(e.target.value)} disabled={!variavelResposta.trim()} />
              </div>
            </div>
          </div>
        )}

        {no.tipo === "midia" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Envia um arquivo em vez de texto — sem vídeo (não suportado pela Z-API nesse projeto).</p>
            <Select value={tipoMidia} onValueChange={(v) => setTipoMidia(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="imagem">Imagem</SelectItem>
                <SelectItem value="audio">Áudio</SelectItem>
                <SelectItem value="documento">Documento</SelectItem>
              </SelectContent>
            </Select>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Arquivo</label>
              <Input type="file" onChange={handleUploadMidia} disabled={uploadMidiaMut.isPending} />
              {storageKey && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  {uploadMidiaMut.isPending ? "Enviando..." : `Enviado: ${nomeArquivoMidia || storageKey.split("/").pop()}`}
                </p>
              )}
            </div>
            {tipoMidia === "imagem" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Legenda (opcional)</label>
                <Input value={legenda} onChange={(e) => setLegenda(e.target.value)} />
              </div>
            )}
          </div>
        )}

        {no.tipo === "menu" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Manda o texto + opções e espera a resposta do cliente. Os destinos de cada opção e o de "não entendeu" (ponto vermelho) são definidos arrastando uma conexão a partir dos pontos do card no canvas.
            </p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Estilo do menu</label>
              <Select value={estiloMenu} onValueChange={(v) => setEstiloMenu(v as "texto" | "botoes" | "lista")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="texto">Texto numerado (padrão, mais compatível)</SelectItem>
                  <SelectItem value="botoes">Botões (até 3 opções, formato nativo do WhatsApp)</SelectItem>
                  <SelectItem value="lista">Lista (até 10 opções, formato nativo do WhatsApp)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">Texto</label>
                <VariavelPicker nos={nos} onInserir={(nome) => setTextoMenu(textoMenu + `{{${nome}}}`)} />
              </div>
              <Textarea rows={3} value={textoMenu} onChange={(e) => setTextoMenu(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground block">
                Opções {estiloMenu === "botoes" && `(máx. 3 — ${opcoesMenu.length}/3)`}{estiloMenu === "lista" && `(máx. 10 — ${opcoesMenu.length}/10)`}
              </label>
              {opcoesMenu.map((o, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                    <Input
                      value={o.label}
                      onChange={(e) => { const arr = [...opcoesMenu]; arr[i] = { ...o, label: e.target.value }; setOpcoesMenu(arr); }}
                    />
                    <Button
                      size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive shrink-0"
                      onClick={() => setOpcoesMenu(opcoesMenu.filter((_, idx) => idx !== i))}
                      disabled={opcoesMenu.length <= 1}
                    >
                      <X size={13} />
                    </Button>
                  </div>
                  {estiloMenu === "lista" && (
                    <Input
                      className="ml-7 h-7 text-xs"
                      placeholder="Descrição (opcional)"
                      value={o.descricao ?? ""}
                      onChange={(e) => { const arr = [...opcoesMenu]; arr[i] = { ...o, descricao: e.target.value }; setOpcoesMenu(arr); }}
                    />
                  )}
                </div>
              ))}
              <Button
                size="sm" variant="outline"
                disabled={(estiloMenu === "botoes" && opcoesMenu.length >= 3) || (estiloMenu === "lista" && opcoesMenu.length >= 10)}
                onClick={() => setOpcoesMenu([...opcoesMenu, { label: `Opção ${opcoesMenu.length + 1}`, ordemDestino: null }])}
              >
                <Plus size={13} className="mr-1" /> Adicionar opção
              </Button>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Timeout sem resposta (dias)</label>
              <Input type="number" min="1" className="w-24" value={timeoutMenu} onChange={(e) => setTimeoutMenu(e.target.value)} />
            </div>
          </div>
        )}

        {no.tipo === "aplicar_etiqueta" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Marca o cliente da conversa com esta etiqueta ao passar por este ponto do fluxo. Se a etiqueta ainda não existir no catálogo, é criada automaticamente (tipo "sistema").
            </p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Etiqueta</label>
              <Input
                list="fluxo-etiquetas-existentes"
                placeholder="Ex: Disparo: Zen Friday Novembro"
                value={etiquetaNome}
                onChange={(e) => setEtiquetaNome(e.target.value)}
              />
              <datalist id="fluxo-etiquetas-existentes">
                {(etiquetasQuery.data ?? []).map((et) => <option key={et.id} value={et.nome} />)}
              </datalist>
            </div>
          </div>
        )}

        {no.tipo === "incrementar_campo" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Soma o valor abaixo ao campo numérico do cliente da conversa (pode ser negativo). Se o campo ainda não existir, é criado automaticamente.
            </p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Campo</label>
                <Input
                  list="fluxo-campos-existentes"
                  placeholder="Ex: Respostas a disparo"
                  value={campoNome}
                  onChange={(e) => setCampoNome(e.target.value)}
                />
                <datalist id="fluxo-campos-existentes">
                  {(camposPersonalizadosQuery.data ?? []).map((c) => <option key={c.id} value={c.nome} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Incremento</label>
                <Input type="number" className="w-24" value={incremento} onChange={(e) => setIncremento(e.target.value)} />
              </div>
            </div>
          </div>
        )}
      </div>

      <SheetFooter className="flex-row justify-between">
        <Button
          variant="ghost" size="sm" className="text-destructive"
          onClick={() => { if (confirm("Remover este passo do fluxo?")) deleteNoMut.mutate({ id: no.id }); }}
        >
          <Trash2 size={13} className="mr-1" /> Excluir passo
        </Button>
        <Button size="sm" onClick={salvar} disabled={salvando}>
          <Save size={13} className="mr-1" /> Salvar
        </Button>
      </SheetFooter>
    </>
  );
}

// ─── Gatilho automático (mensagem recebida / dias sem contato / cliente novo)
// — sem gatilho, o fluxo só inicia pelo botão "Testar com uma conversa"
// (padrão "manual"). Salva a cada mudança, sem botão de confirmar.
const GATILHO_LABELS: Record<string, string> = {
  manual: "Manual (só pelo botão)",
  mensagem_recebida: "Mensagem recebida",
  dias_sem_contato: "Dias sem contato",
  cliente_novo: "Cliente novo",
};

function GatilhoAutomaticoBar({
  fluxo, updateFluxoMut,
}: {
  fluxo: any;
  updateFluxoMut: ReturnType<typeof trpc.fluxos.update.useMutation>;
}) {
  const tipo: string = fluxo.gatilhoTipo ?? "manual";
  const config = fluxo.gatilhoConfig ?? {};
  const [diasLocal, setDiasLocal] = useState<string>(config.dias != null ? String(config.dias) : "7");

  useEffect(() => {
    setDiasLocal(config.dias != null ? String(config.dias) : "7");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fluxo.id, config.dias]);

  const salvar = (gatilhoTipo: string, gatilhoConfig: Record<string, unknown>) => {
    updateFluxoMut.mutate({ id: fluxo.id, gatilhoTipo: gatilhoTipo as any, gatilhoConfig });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap shrink-0">
      <Zap size={14} className="text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground shrink-0">Gatilho automático:</span>
      <Select value={tipo} onValueChange={(v) => salvar(v, {})}>
        <SelectTrigger className="h-8 text-xs w-52"><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(GATILHO_LABELS).map(([valor, label]) => (
            <SelectItem key={valor} value={valor}>{label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {tipo === "dias_sem_contato" && (
        <div className="flex items-center gap-1.5">
          <Input
            type="number" min={1} className="h-8 text-xs w-20"
            value={diasLocal}
            onChange={(e) => setDiasLocal(e.target.value)}
            onBlur={() => salvar(tipo, { dias: Math.max(1, Number(diasLocal) || 1) })}
          />
          <span className="text-xs text-muted-foreground">dias sem contato</span>
        </div>
      )}
    </div>
  );
}

type ConversaSugestao = { id: number; nome: string; telefone: string; clienteId: number | null };

function TestarComConversaDialog({
  open, onOpenChange, fluxoId, unidadeId, onIniciado,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fluxoId: number;
  unidadeId: number;
  onIniciado: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [selecionado, setSelecionado] = useState<ConversaSugestao | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: conversas = [] } = trpc.inbox.conversas.list.useQuery({ unidadeId }, { enabled: open });
  const termo = texto.trim().toLowerCase();
  const sugestoes: ConversaSugestao[] = termo.length < 2 ? [] : (conversas as any[])
    .filter((c) => (c.clienteNome ?? c.nomeContato ?? "").toLowerCase().includes(termo) || (c.telefone ?? "").includes(termo))
    .slice(0, 8)
    .map((c) => ({ id: c.id, nome: c.clienteNome ?? c.nomeContato ?? c.telefone, telefone: c.telefone, clienteId: c.clienteId ?? null }));

  const iniciarMut = trpc.fluxos.iniciar.useMutation({
    onSuccess: () => {
      toast.success("Execução iniciada — acompanhe no painel de execuções");
      onIniciado();
      onOpenChange(false);
      setSelecionado(null);
      setTexto("");
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (!open) { setSelecionado(null); setTexto(""); }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Testar fluxo com uma conversa</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {selecionado ? (
            <div className="flex items-center gap-2 border rounded-md px-3 py-2 bg-muted/40">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selecionado.nome}</p>
                <p className="text-xs text-muted-foreground">{selecionado.telefone}</p>
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSelecionado(null)}>
                <X size={14} />
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input ref={inputRef} className="pl-9" placeholder="Digite o nome ou telefone..." value={texto} onChange={(e) => setTexto(e.target.value)} />
              {sugestoes.length > 0 && (
                <div className="border rounded-md mt-1 max-h-56 overflow-y-auto divide-y">
                  {sugestoes.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
                      onClick={() => { setSelecionado(c); setTexto(""); }}
                    >
                      <p className="font-medium">{c.nome}</p>
                      <p className="text-xs text-muted-foreground">{c.telefone}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!selecionado || iniciarMut.isPending}
            onClick={() => selecionado && iniciarMut.mutate({ fluxoId, conversaId: selecionado.id, clienteId: selecionado.clienteId ?? undefined })}
          >
            <Play size={14} className="mr-1" /> Iniciar teste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
