import React, { useEffect, useMemo, useRef, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { useAtendenteAtual } from "@/components/AtendenteGate";
import { trpc } from "@/lib/trpc";
import { nomeSugeridoParaCadastro } from "@/lib/inboxNomeSugerido";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CampoBuscaLista } from "@/components/CampoBuscaLista";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Search, Send, Paperclip, Loader2, MessageCircle, RefreshCw, Volume2, VolumeX, Ban,
  Pencil, Check, CheckCheck, X, Trash2, AlertTriangle, Sparkles, Tag as TagIcon, CheckCircle2, Merge, ArrowLeft, Plus,
  UserPlus, SmilePlus, Users, Download, ZoomIn, FileText, Bot, BellRing, CreditCard, Menu, ListTodo,
} from "lucide-react";
import { toast } from "sonner";
import { useSearch } from "wouter";
import { telefonesCorrespondem } from "@shared/telefone";
import { getInboxAttachmentUrl, type InboxAttachmentMetadata } from "@shared/inboxMedia";
import { formatPhone, diasDesde, opcoesPreferenciaTerapeuta, SIMBOLO_NIVEL_TERAPEUTA } from "@/lib/utils";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { ScriptPicker } from "@/components/ScriptPicker";
import { ChamadoTerapeutaDialog } from "@/components/ChamadoTerapeutaDialog";
import { CobrancaLinkDialog } from "@/components/CobrancaLinkDialog";

// Portado do mobai-crm (client/src/pages/Inbox.tsx) — conversão manual
// pra BRT (UTC-3) em vez de depender do timezone do navegador, mais
// "agora"/"Nmin" pra mensagem recente e dia da semana quando não é hoje.
function formatHora(data: string | Date | number | null | undefined) {
  if (!data) return "—";
  let utcMs: number;
  if (data instanceof Date) {
    utcMs = data.getTime();
  } else if (typeof data === "number") {
    utcMs = data;
  } else {
    const normalizado = (!data.endsWith("Z") && !data.includes("+") && !/[-+]\d{2}:\d{2}$/.test(data) && data.includes("T"))
      ? data + "Z"
      : data;
    utcMs = new Date(normalizado).getTime();
  }
  if (isNaN(utcMs)) return "—";
  const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;
  const brtMs = utcMs + BRT_OFFSET_MS;
  const brtDate = new Date(brtMs);
  const nowUtcMs = Date.now();
  const nowBrtMs = nowUtcMs + BRT_OFFSET_MS;
  const nowBrtDate = new Date(nowBrtMs);
  const diff = nowUtcMs - utcMs;
  if (diff >= 0 && diff < 60_000) return "agora";
  if (diff >= 0 && diff < 3_600_000) return `${Math.floor(diff / 60_000)}min`;
  const mesmoDay =
    brtDate.getUTCFullYear() === nowBrtDate.getUTCFullYear() &&
    brtDate.getUTCMonth() === nowBrtDate.getUTCMonth() &&
    brtDate.getUTCDate() === nowBrtDate.getUTCDate();
  const hh = String(brtDate.getUTCHours()).padStart(2, "0");
  const mm = String(brtDate.getUTCMinutes()).padStart(2, "0");
  if (mesmoDay) return `${hh}:${mm}`;
  const DIAS_SEMANA_ABREV = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const MESES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const diaSemana = DIAS_SEMANA_ABREV[brtDate.getUTCDay()];
  const dd = String(brtDate.getUTCDate()).padStart(2, "0");
  const mes = MESES_ABREV[brtDate.getUTCMonth()];
  const ano = brtDate.getUTCFullYear();
  return `${diaSemana}, ${dd} ${mes} ${ano}, ${hh}:${mm}`;
}

function TickEntrega({ status }: { status?: "enviada" | "entregue" | "lida" }) {
  if (status === "lida") return <CheckCheck size={12} className="text-sky-400" />;
  if (status === "entregue") return <CheckCheck size={12} className="opacity-60" />;
  return <Check size={12} className="opacity-60" />;
}

const EMOJIS_REACAO = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
type SugestaoEmRevisao = {
  id: number;
  conversaId: number;
  textoOriginal: string;
  agente: string | null;
  acaoPendente: string | null;
  fluxoPendenteNome: string | null;
};
const CHAVE_RASCUNHO_CONVERSA = "buddha_inbox_rascunho";

function statusDotClass(status: string) {
  if (status === "encerrada") return "bg-gray-400";
  if (status === "aguardando") return "bg-amber-400";
  if (status === "respondida") return "bg-blue-400";
  return "bg-green-500"; // aberta
}

function statusLabel(status: string) {
  if (status === "encerrada") return "Encerrada";
  if (status === "aguardando") return "Aguardando";
  if (status === "respondida") return "Respondida";
  return "Aberta";
}

function formatarDataRelacao(data: string | Date | null | undefined) {
  if (!data) return "—";
  const valor = typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data)
    ? new Date(`${data}T12:00:00`)
    : new Date(data);
  if (Number.isNaN(valor.getTime())) return "—";
  return valor.toLocaleDateString("pt-BR");
}

function parseMetadados(metadados: string | null): InboxAttachmentMetadata {
  if (!metadados) return {};
  try {
    return JSON.parse(metadados);
  } catch {
    return {};
  }
}

function parseEtiquetas(etiquetas: string | null): string[] {
  if (!etiquetas) return [];
  try {
    const v = JSON.parse(etiquetas);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function resumirRastroAgente(rastro: unknown) {
  if (!rastro || typeof rastro !== "object") return null;
  const passos = (rastro as { passos?: Array<Record<string, unknown>> }).passos;
  if (!Array.isArray(passos) || passos.length === 0) return null;
  return passos.map((passo) => {
    const agente = typeof passo.agente === "string" ? passo.agente : null;
    const destino = typeof passo.destino === "string" ? `→ ${passo.destino}` : null;
    const status = typeof passo.status === "string" ? passo.status : null;
    return [agente, destino, status].filter(Boolean).join(" ");
  }).filter(Boolean).join(" · ");
}

function rotuloIntencaoAgente(intencao: string | null | undefined) {
  const rotulos: Record<string, string> = {
    informacao_terapia: "Terapia",
    day_spa_e_estrutura: "Day Spa e estrutura",
    voucher: "Voucher",
    preco_e_condicoes: "Valor e condição",
    agendamento: "Agendamento",
    pagamento_e_comprovante: "Pagamento",
    cadastro_documentos: "Cadastro e documentos",
    saudacao: "Saudação",
    pos_atendimento: "Pós-atendimento",
    pesquisa_satisfacao_belle: "Pesquisa Belle",
    atendimento_humano: "Atendimento humano",
    fora_do_escopo: "Fora do escopo",
    sem_intencao_clara: "Sem intenção clara",
  };
  return intencao ? rotulos[intencao] ?? intencao : null;
}

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

/**
 * Preferência de terapeuta compacta pro painel direito do Inbox (2026-09-03) —
 * antes só existia em texto livre nas etiquetas da conversa (ex.: "Pref
 * Larah/Cláudia"), sem padrão. Agora usa a mesma tabela estruturada da tela
 * Clientes (clientes_preferencias_terapeuta), aceitando mais de um terapeuta.
 */
function PreferenciaTerapeutaInline({ clienteId, unidadeId }: { clienteId: number; unidadeId: number }) {
  const utils = trpc.useUtils();
  const opcoesQuery = trpc.chamados.opcoes.useQuery({ unidadeId, clienteId });
  const invalidar = () => utils.chamados.opcoes.invalidate({ unidadeId, clienteId });
  const adicionarMutation = trpc.chamados.adicionarPreferenciaCliente.useMutation({
    onSuccess: invalidar,
    onError: (e) => toast.error(e.message),
  });
  const removerMutation = trpc.chamados.removerPreferenciaCliente.useMutation({
    onSuccess: invalidar,
    onError: (e) => toast.error(e.message),
  });

  const preferencias = opcoesQuery.data?.preferencias ?? [];
  const terapeutas = opcoesPreferenciaTerapeuta(opcoesQuery.data?.terapeutas ?? []);
  const disponiveis = terapeutas.filter((t) => !preferencias.some((p) => p.terapeutaId === t.id));
  // Símbolo de nível só existe pra terapeuta real (não pras opções de gênero
  // sintéticas nem pro legado "Pendente de sorteio") — daí vir da lista crua,
  // antes do opcoesPreferenciaTerapeuta acrescentar as sintéticas.
  const nivelPorTerapeutaId = new Map((opcoesQuery.data?.terapeutas ?? []).map((t) => [t.id, t.nivel]));

  return (
    <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
      <span className="text-[10px] text-muted-foreground">Pref.</span>
      {preferencias.length === 0 && <span className="text-[10px] text-muted-foreground">—</span>}
      {preferencias.map((pref) => {
        const nivel = pref.terapeutaId ? nivelPorTerapeutaId.get(pref.terapeutaId) : undefined;
        return (
          <Badge key={pref.id} variant="outline" className="text-[12.5px] h-5 gap-1 pr-1">
            {pref.terapeutaNome}
            {nivel && <span title={`Nível ${nivel}`}>{SIMBOLO_NIVEL_TERAPEUTA[nivel]}</span>}
            <button
              type="button"
              className="hover:text-destructive"
              onClick={() => pref.terapeutaId && removerMutation.mutate({ clienteId, unidadeId, terapeutaId: pref.terapeutaId })}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        );
      })}
      {disponiveis.length > 0 && (
        <Select
          value=""
          onValueChange={(valor) => {
            const terapeuta = disponiveis.find((t) => t.id.toString() === valor);
            if (!terapeuta) return;
            adicionarMutation.mutate({
              clienteId, unidadeId, terapeutaId: terapeuta.id,
              terapeutaNome: terapeuta.nomeAbreviado || terapeuta.nomeCompleto,
            });
          }}
        >
          <SelectTrigger className="h-4 px-1 gap-0.5 border-none opacity-50 hover:opacity-100" title="Adicionar terapeuta de preferência">
            <Plus className="h-2.5 w-2.5 text-muted-foreground" />
          </SelectTrigger>
          <SelectContent>
            {disponiveis.map((t) => (
              <SelectItem key={t.id} value={t.id.toString()}>{t.nomeAbreviado || t.nomeCompleto}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export default function Mensagens() {
  const { unidadeSelecionada } = useUnidade();
  const { user } = useAuth();
  const { atendente } = useAtendenteAtual();
  const search = useSearch();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "aberta" | "encerrada">("todos");
  const [conversaSelecionadaId, setConversaSelecionadaId] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [somAtivo, setSomAtivo] = useState(() => localStorage.getItem("buddha_inbox_som") !== "false");
  const [buscaMensagemAtiva, setBuscaMensagemAtiva] = useState(false);
  const [buscaMensagem, setBuscaMensagem] = useState("");
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeEditavel, setNomeEditavel] = useState("");
  const [modalKillSwitch, setModalKillSwitch] = useState(false);
  const [modalExcluir, setModalExcluir] = useState(false);
  const [modalUnificar, setModalUnificar] = useState(false);
  const [unificarBusca, setUnificarBusca] = useState("");
  const [unificarDestinoId, setUnificarDestinoId] = useState<number | null>(null);
  const [nomeCriarCliente, setNomeCriarCliente] = useState("");
  const conversaNomePreenchidoRef = useRef<number | null>(null);
  const [modalNovoCliente, setModalNovoCliente] = useState(false);
  const [novoClienteNome, setNovoClienteNome] = useState("");
  const [novoClienteTelefone, setNovoClienteTelefone] = useState("");
  const [scriptPickerOpen, setScriptPickerOpen] = useState(false);
  const [modalSugestaoIa, setModalSugestaoIa] = useState(false);
  const [sugestaoIa, setSugestaoIa] = useState("");
  const [sugestaoEmRevisao, setSugestaoEmRevisao] = useState<SugestaoEmRevisao | null>(null);
  const [modalRejeitarSugestao, setModalRejeitarSugestao] = useState(false);
  const [comentarioRejeicao, setComentarioRejeicao] = useState("");
  const [sugestaoDispensadaId, setSugestaoDispensadaId] = useState<number | null>(null);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const [modalChamadoTerapeuta, setModalChamadoTerapeuta] = useState(false);
  const [modalCobrancaLink, setModalCobrancaLink] = useState(false);
  const [midiasComFalha, setMidiasComFalha] = useState<Set<number>>(() => new Set());
  // Autocomplete de @menção em grupo — mentionInicio é o índice do "@" no
  // texto (null = não está em meio a uma menção); mentionados guarda os
  // telefones já inseridos nesta digitação, pra mandar no campo
  // "mentioned" da Z-API junto com o envio.
  const [mentionInicio, setMentionInicio] = useState<number | null>(null);
  const [mentionados, setMentionados] = useState<Set<string>>(new Set());
  // Anexo escolhido, ainda não enviado — dá chance de escrever legenda
  // (imagem) antes, igual mobai-crm.
  const [anexoPendente, setAnexoPendente] = useState<{ file: File; tipo: "imagem" | "audio" | "documento"; previewUrl?: string; legenda: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversaRoladaRef = useRef<number | null>(null);
  const preservarPosicaoAoCarregarAntigasRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversaDonaDoTextoRef = useRef<number | null>(null);
  // Qual conversa uma aprovação/rejeição de sugestão em voo pertence —
  // sem isso, aceitar/rejeitar numa conversa e trocar pra outra ANTES da
  // resposta do servidor voltar fazia o onSuccess limpar o texto que já
  // estava sendo digitado na conversa nova (2026-09-02).
  const conversaDaAcaoSugestaoRef = useRef<number | null>(null);
  const utils = trpc.useUtils();

  const { data: conversas, isLoading: carregandoConversas, refetch: refetchConversas } = trpc.inbox.conversas.list.useQuery(
    { unidadeId: unidadeSelecionada?.id },
    { enabled: !!unidadeSelecionada, refetchInterval: 15000 },
  );

  const { data: conversaSelecionada } = trpc.inbox.conversas.get.useQuery(
    { id: conversaSelecionadaId ?? 0 },
    { enabled: !!conversaSelecionadaId },
  );

  useEffect(() => {
    if (!conversaSelecionadaId || !conversaSelecionada || conversaSelecionada.clienteId) return;
    if (conversaNomePreenchidoRef.current === conversaSelecionadaId) return;
    const nome = nomeSugeridoParaCadastro(conversaSelecionada);
    if (nome) setNomeCriarCliente(nome);
    conversaNomePreenchidoRef.current = conversaSelecionadaId;
  }, [conversaSelecionada, conversaSelecionadaId]);

  const [cursorMensagensAntigas, setCursorMensagensAntigas] = useState<string | null>(null);
  const [cursorAntigasAplicado, setCursorAntigasAplicado] = useState<string | null>(null);
  const [mensagensAntigas, setMensagensAntigas] = useState<any[]>([]);
  // Carga inicial reduzida de 120 pra 15 (2026-09-02, performance — ver
  // índice novo em inbox_mensagens). Só busca "as N mais recentes" uma vez
  // por conversa (semeia a tela) — o acompanhamento contínuo é o poll de
  // "mensagens novas desde X" abaixo, que só ADICIONA, nunca redefine a
  // janela visível. Isso existe justamente pra mensagem nunca sumir da
  // tela (2026-09-02): reconsultar "top N" a cada 8s soltava uma mensagem
  // do meio numa conversa ativa antes do "carregar mais antigas" ter
  // puxado ela pro lado antigo.
  const { data: paginaMensagensRecentes, isLoading: carregandoMensagens } = trpc.inbox.mensagens.listPaginada.useQuery(
    { conversaId: conversaSelecionadaId ?? 0, limit: 15 },
    { enabled: !!conversaSelecionadaId },
  );
  const { data: paginaMensagensAntigas, isFetching: carregandoMensagensAntigas } = trpc.inbox.mensagens.listPaginada.useQuery(
    { conversaId: conversaSelecionadaId ?? 0, limit: 15, antesDe: cursorMensagensAntigas ?? undefined },
    { enabled: !!conversaSelecionadaId && !!cursorMensagensAntigas && cursorMensagensAntigas !== cursorAntigasAplicado },
  );
  const [cursorMensagensNovas, setCursorMensagensNovas] = useState<string | null>(null);
  const [mensagensNovas, setMensagensNovas] = useState<any[]>([]);
  const { data: paginaMensagensNovas } = trpc.inbox.mensagens.mensagensDesde.useQuery(
    { conversaId: conversaSelecionadaId ?? 0, desde: cursorMensagensNovas ?? "" },
    { enabled: !!conversaSelecionadaId && !!cursorMensagensNovas, refetchInterval: 8000 },
  );
  const mensagensRecentes = paginaMensagensRecentes?.mensagens ?? [];
  const mensagens = useMemo(() => [...mensagensAntigas, ...mensagensRecentes, ...mensagensNovas]
    .filter((mensagem, indice, lista) => lista.findIndex((item) => item.id === mensagem.id) === indice)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [mensagensAntigas, mensagensRecentes, mensagensNovas]);
  const haMensagensAntigas = cursorAntigasAplicado
    ? Boolean(paginaMensagensAntigas?.hasMore)
    : Boolean(paginaMensagensRecentes?.hasMore);

  const diagnosticoAgentes = trpc.agentes.diagnostico.conversa.useQuery(
    { conversaId: conversaSelecionadaId ?? 0, limite: 25 },
    { enabled: user?.role === "admin" && !!conversaSelecionadaId, refetchInterval: 8000 },
  );
  const sugestaoPendenteAgente = trpc.agentes.fila.pendenteConversa.useQuery(
    { conversaId: conversaSelecionadaId ?? 0 },
    { enabled: !!conversaSelecionadaId, refetchInterval: 3000 },
  );

  const ehGrupo = conversaSelecionada?.isGrupo === "true";
  const { data: membrosGrupo } = trpc.inbox.conversas.membrosGrupo.useQuery(
    { conversaId: conversaSelecionadaId ?? 0 },
    { enabled: !!conversaSelecionadaId && ehGrupo },
  );

  // wouter's useLocation() só devolve o pathname, nunca a query string
  // (existe um hook separado, useSearch(), pra isso) — usar
  // location.split("?") aqui sempre resultava em query vazia, e o link
  // de WhatsApp de Clientes/Reativação (rotaInboxConversa) nunca abria
  // a conversa certa, caindo na última conversa que já estava
  // selecionada. Bug real encontrado 2026-08-17.
  const conversaIdSolicitada = useMemo(() => {
    const valor = Number(new URLSearchParams(search).get("conversaId"));
    return Number.isInteger(valor) && valor > 0 ? valor : null;
  }, [search]);

  const telefoneSolicitado = useMemo(() => {
    return new URLSearchParams(search).get("telefone")?.trim() ?? "";
  }, [search]);

  const { data: mensageriaStatus } = trpc.mensageria.status.useQuery();
  const setMensageriaStatus = trpc.mensageria.setStatus.useMutation({
    onSuccess: () => {
      utils.mensageria.status.invalidate();
      setModalKillSwitch(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const enviarMutation = trpc.inbox.mensagens.enviar.useMutation({
    onSuccess: () => {
      setTexto("");
      setMentionados(new Set());
      utils.inbox.mensagens.listPaginada.invalidate({ conversaId: conversaSelecionadaId ?? 0 });
      utils.inbox.conversas.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const reagirMutation = trpc.inbox.mensagens.reagir.useMutation({
    onSuccess: () => utils.inbox.mensagens.listPaginada.invalidate({ conversaId: conversaSelecionadaId ?? 0 }),
    onError: (error) => toast.error(error.message),
  });

  const aprovarSugestaoAgenteMutation = trpc.agentes.fila.aprovarEEnviar.useMutation({
    onSuccess: () => {
      const conversaDaAcao = conversaDaAcaoSugestaoRef.current;
      toast.success("Sugestão enviada ao cliente.");
      // Só mexe na caixa de texto se ainda for a mesma conversa dessa
      // aprovação — senão apagaria o que já foi digitado depois de trocar.
      if (conversaDaAcao === conversaSelecionadaId) {
        setTexto("");
        setSugestaoEmRevisao(null);
        setSugestaoDispensadaId(sugestaoEmRevisao?.id ?? null);
      }
      utils.agentes.diagnostico.conversa.invalidate({ conversaId: conversaDaAcao ?? 0 });
      utils.agentes.fila.pendenteConversa.invalidate({ conversaId: conversaDaAcao ?? 0 });
      utils.inbox.mensagens.listPaginada.invalidate({ conversaId: conversaDaAcao ?? 0 });
      utils.inbox.conversas.list.invalidate();
    },
    // Sem o refetch aqui, um card com estado desatualizado (avaliado em
    // outra aba/sessão, ou pela própria pessoa clicando duas vezes)
    // ficava "grudado" na tela repetindo o mesmo erro "já foi avaliado"
    // pra sempre — o refetch traz o estado real e some com o card
    // (2026-09-02, mesmo padrão já usado em liberarSugestaoParaEdicaoMutation).
    onError: (error) => {
      toast.error(error.message);
      utils.agentes.fila.pendenteConversa.invalidate({ conversaId: conversaDaAcaoSugestaoRef.current ?? 0 });
    },
  });

  const reprovarSugestaoAgenteMutation = trpc.agentes.fila.reprovar.useMutation({
    onSuccess: () => {
      const conversaDaAcao = conversaDaAcaoSugestaoRef.current;
      toast.success("Sugestão reprovada.");
      setModalRejeitarSugestao(false);
      setMotivoRejeicao("");
      setComentarioRejeicao("");
      if (conversaDaAcao === conversaSelecionadaId) {
        setTexto("");
        setSugestaoEmRevisao(null);
        setSugestaoDispensadaId(sugestaoEmRevisao?.id ?? null);
      }
      utils.agentes.diagnostico.conversa.invalidate({ conversaId: conversaDaAcao ?? 0 });
      utils.agentes.fila.pendenteConversa.invalidate({ conversaId: conversaDaAcao ?? 0 });
    },
    onError: (error) => {
      toast.error(error.message);
      utils.agentes.fila.pendenteConversa.invalidate({ conversaId: conversaDaAcaoSugestaoRef.current ?? 0 });
    },
  });

  const liberarSugestaoParaEdicaoMutation = trpc.agentes.fila.liberarParaEdicao.useMutation({
    onSuccess: () => {
      setSugestaoEmRevisao(null);
      setSugestaoDispensadaId(null);
      utils.agentes.diagnostico.conversa.invalidate({ conversaId: conversaSelecionadaId ?? 0 });
      utils.agentes.fila.pendenteConversa.invalidate({ conversaId: conversaSelecionadaId ?? 0 });
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    onError: (error) => {
      toast.error(error.message);
      utils.agentes.fila.pendenteConversa.invalidate({ conversaId: conversaSelecionadaId ?? 0 });
    },
  });

  const sugerirMensagemIaMutation = trpc.inbox.mensagens.sugerir.useMutation({
    onSuccess: ({ sugestao }) => setSugestaoIa(sugestao),
    onError: (error) => {
      setModalSugestaoIa(false);
      toast.error(error.message);
    },
  });

  const enviarMidiaMutation = trpc.inbox.mensagens.enviarMidia.useMutation({
    onSuccess: () => {
      cancelarAnexo();
      utils.inbox.mensagens.listPaginada.invalidate({ conversaId: conversaSelecionadaId ?? 0 });
      utils.inbox.conversas.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const atualizarNomeMutation = trpc.inbox.conversas.atualizarNome.useMutation({
    onSuccess: () => {
      setEditandoNome(false);
      utils.inbox.conversas.get.invalidate({ id: conversaSelecionadaId ?? 0 });
      utils.inbox.conversas.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const [editandoProximoAtendimento, setEditandoProximoAtendimento] = useState(false);
  const [modoFormProximoAtendimento, setModoFormProximoAtendimento] = useState<"editar" | "incluir">("editar");
  const [formProximoAtendimento, setFormProximoAtendimento] = useState({ data: "", horario: "", servico: "" });
  const [formListaEspera, setFormListaEspera] = useState<{ data: string; horarioDesejado: string; terapiaDesejada: string; observacao: string } | null>(null);
  const criarListaEsperaMutation = trpc.listaEspera.criar.useMutation({
    onSuccess: () => {
      toast.success("Adicionado à lista de espera.");
      setFormListaEspera(null);
    },
    onError: (e) => toast.error(e.message),
  });
  // Serviço do próximo atendimento vem da Tabela de Preços — evita
  // digitar um nome de terapia que já existe cadastrado. Busca quando
  // qualquer um dos dois diálogos que usam CampoBuscaLista abre (achado
  // real: lista de espera ficava com "Nenhuma opção encontrada" porque só
  // checava editandoProximoAtendimento, nunca formListaEspera).
  const tabelaPrecosQuery = trpc.tabelaPrecos.list.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0 },
    { enabled: !!unidadeSelecionada?.id && (editandoProximoAtendimento || !!formListaEspera) },
  );
  // No Belle, domingo/feriado normalmente é um serviço À PARTE no
  // catálogo (nome próprio, geralmente "<nome da semana> Dom" — nem
  // sempre no padrão, ver exceções tipo "Relaxante Mencare Dom"), não
  // um preço diferente do mesmo serviço. Os 2 filtros são independentes
  // (união, não escolha exclusiva) — o Set dedupe cuida de quando o
  // nome derivado bate com um nome "Dom" que já existe de verdade.
  const [filtroServicoSegSab, setFiltroServicoSegSab] = useState(true);
  const [filtroServicoDomFer, setFiltroServicoDomFer] = useState(false);
  const nomesServicosProximoAtendimento = useMemo(() => {
    const nomes = new Set<string>();
    for (const item of tabelaPrecosQuery.data ?? []) {
      const ehDom = /\bdom\.?$/i.test(item.servico.trim());
      if (filtroServicoSegSab && !ehDom) nomes.add(item.servico);
      if (filtroServicoDomFer) nomes.add(ehDom ? item.servico : `${item.servico} Dom`);
    }
    return Array.from(nomes);
  }, [tabelaPrecosQuery.data, filtroServicoSegSab, filtroServicoDomFer]);
  const cancelarProximoAtendimentoMutation = trpc.inbox.conversas.cancelarProximoAtendimento.useMutation({
    onSuccess: () => {
      toast.success("Agendamento cancelado");
      utils.inbox.conversas.get.invalidate({ id: conversaSelecionadaId ?? 0 });
    },
    onError: (error) => toast.error(error.message),
  });
  const editarProximoAtendimentoMutation = trpc.inbox.conversas.editarProximoAtendimento.useMutation({
    onSuccess: () => {
      toast.success("Agendamento atualizado");
      setEditandoProximoAtendimento(false);
      utils.inbox.conversas.get.invalidate({ id: conversaSelecionadaId ?? 0 });
    },
    onError: (error) => toast.error(error.message),
  });
  const criarProximoAtendimentoMutation = trpc.inbox.conversas.criarProximoAtendimento.useMutation({
    onSuccess: () => {
      toast.success("Próximo atendimento incluído no CRM");
      setEditandoProximoAtendimento(false);
      utils.inbox.conversas.get.invalidate({ id: conversaSelecionadaId ?? 0 });
    },
    onError: (error) => toast.error(error.message),
  });
  const sugerirProximoAtendimentoMutation = trpc.inbox.conversas.sugerirProximoAtendimento.useMutation({
    onSuccess: (sugestao) => {
      const atual = conversaSelecionada?.resumoRelacionamento?.proximoAtendimento;
      setModoFormProximoAtendimento(atual ? "editar" : "incluir");
      setFormProximoAtendimento({
        data: sugestao.dataAtendimento ?? atual?.dataAtendimento ?? "",
        horario: sugestao.horario ?? atual?.horario ?? "",
        servico: sugestao.servicoNome ?? atual?.servicoNome ?? "",
      });
      setEditandoProximoAtendimento(true);
      toast.success("Prévia atualizada pela conversa. Revise antes de salvar.");
    },
    onError: (error) => toast.error(error.message),
  });

  const alterarStatusMutation = trpc.inbox.conversas.alterarStatus.useMutation({
    onSuccess: () => {
      utils.inbox.conversas.get.invalidate({ id: conversaSelecionadaId ?? 0 });
      utils.inbox.conversas.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const definirAutomacaoAgentesMutation = trpc.inbox.conversas.definirAutomacaoAgentes.useMutation({
    onSuccess: () => {
      utils.inbox.conversas.get.invalidate({ id: conversaSelecionadaId ?? 0 });
      utils.inbox.conversas.list.invalidate();
      utils.agentes.fila.pendenteConversa.invalidate({ conversaId: conversaSelecionadaId ?? 0 });
      toast.success("Configuração de automação atualizada.");
    },
    onError: (error) => toast.error(error.message),
  });

  // Catálogo compartilhado com Clientes.tsx e o construtor de segmentação de
  // Disparos (2026-09-03) — etiqueta aplicada aqui também vira filtro de
  // segmento. Criar/editar/excluir etiqueta do catálogo é só em Configuração
  // do Inbox (admin) — aqui só se atribui uma já existente.
  const catalogoEtiquetasQuery = trpc.etiquetas.list.useQuery();
  const atribuirEtiquetaClienteMutation = trpc.etiquetas.atribuir.useMutation({
    onSuccess: () => utils.etiquetas.list.invalidate(),
  });
  const removerEtiquetaClienteMutation = trpc.etiquetas.remover.useMutation();

  const definirEtiquetasMutation = trpc.inbox.conversas.definirEtiquetas.useMutation({
    onSuccess: () => {
      utils.inbox.conversas.get.invalidate({ id: conversaSelecionadaId ?? 0 });
      utils.inbox.conversas.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const excluirMutation = trpc.inbox.conversas.excluir.useMutation({
    onSuccess: () => {
      setModalExcluir(false);
      setConversaSelecionadaId(null);
      utils.inbox.conversas.list.invalidate();
      toast.success("Conversa apagada.");
    },
    onError: (error) => toast.error(error.message),
  });

  const unificarMutation = trpc.inbox.unificarConversas.useMutation({
    onSuccess: () => {
      setModalUnificar(false);
      setConversaSelecionadaId(unificarDestinoId);
      utils.inbox.conversas.list.invalidate();
      toast.success("Conversas unificadas.");
    },
    onError: (error) => toast.error(error.message),
  });

  // Aviso de celular já cadastrado noutro cliente — ver ResultadoCriarCliente
  // em server/db.ts. `origem` diz qual fluxo disparou, pra "Criar mesmo
  // assim" saber qual mutation re-chamar com forcarDuplicata: true.
  const [conflitoDuplicata, setConflitoDuplicata] = useState<{ origem: "rapido" | "novo"; candidatos: { id: number; nome: string }[] } | null>(null);

  const criarClienteRapidoMutation = trpc.inbox.conversas.criarClienteRapido.useMutation({
    onSuccess: (data) => {
      if (data.status === "conflito") {
        setConflitoDuplicata({ origem: "rapido", candidatos: data.candidatos });
        return;
      }
      toast.success("Cliente criado no CRM!");
      setConflitoDuplicata(null);
      utils.inbox.conversas.get.invalidate({ id: conversaSelecionadaId ?? 0 });
      utils.inbox.conversas.list.invalidate();
    },
    onError: (error) => toast.error(`Erro ao criar cliente: ${error.message}`),
  });

  const vincularClienteMutation = trpc.inbox.conversas.vincularCliente.useMutation({
    onSuccess: () => {
      toast.success("Conversa vinculada ao cliente!");
      utils.inbox.conversas.get.invalidate({ id: conversaSelecionadaId ?? 0 });
      utils.inbox.conversas.list.invalidate();
    },
    onError: (error) => toast.error(`Erro ao vincular cliente: ${error.message}`),
  });

  const iniciarConversaComClienteMutation = trpc.inbox.iniciarConversaComCliente.useMutation({
    onSuccess: (data) => {
      if (data.status === "conflito") {
        setConflitoDuplicata({ origem: "novo", candidatos: data.candidatos });
        return;
      }
      toast.success("Cliente e conversa criados!");
      setConflitoDuplicata(null);
      setModalNovoCliente(false);
      setNovoClienteNome("");
      setNovoClienteTelefone("");
      utils.inbox.conversas.list.invalidate();
      setConversaSelecionadaId(data.conversaId);
    },
    onError: (error) => toast.error(`Erro ao criar cliente: ${error.message}`),
  });

  function confirmarDuplicata() {
    if (!conflitoDuplicata) return;
    if (conflitoDuplicata.origem === "rapido") {
      if (!conversaSelecionadaId) return;
      criarClienteRapidoMutation.mutate({ conversaId: conversaSelecionadaId, nome: nomeCriarCliente.trim(), forcarDuplicata: true });
    } else {
      if (!unidadeSelecionada?.id) return;
      iniciarConversaComClienteMutation.mutate({
        unidadeId: unidadeSelecionada.id,
        nome: novoClienteNome.trim(),
        telefone: novoClienteTelefone.trim(),
        forcarDuplicata: true,
      });
    }
  }

  // Aplica o deep-link (?conversaId=/?telefone=) só uma vez por URL —
  // sem o ref, esse efeito reabria a conversa solicitada a cada refetch
  // em segundo plano da lista (poll de novas mensagens), arrancando
  // quem estava digitando numa OUTRA conversa de volta pra essa aqui,
  // sem aviso (bug real relatado 2026-09-02: recepção quase mandou
  // mensagem pro cliente errado porque a tela trocou sozinha no meio
  // da digitação).
  const solicitacaoAplicadaRef = useRef<string | null>(null);
  useEffect(() => {
    const chave = `${conversaIdSolicitada ?? ""}|${telefoneSolicitado}`;
    if (!conversaIdSolicitada && !telefoneSolicitado) return;
    if (solicitacaoAplicadaRef.current === chave) return;
    if (conversaIdSolicitada) {
      setBusca("");
      selecionarConversa(conversaIdSolicitada);
      solicitacaoAplicadaRef.current = chave;
      return;
    }
    setBusca(telefoneSolicitado);
    const conversa = (conversas ?? []).find((item) => telefonesCorrespondem(item.telefone, telefoneSolicitado));
    if (conversa) {
      selecionarConversa(conversa.id);
      setBusca("");
      solicitacaoAplicadaRef.current = chave;
    }
  }, [conversas, conversaIdSolicitada, telefoneSolicitado]);

  function selecionarConversa(conversaId: number) {
    if (conversaDonaDoTextoRef.current !== conversaId) {
      conversaDonaDoTextoRef.current = conversaId;
      setTexto(sessionStorage.getItem(`${CHAVE_RASCUNHO_CONVERSA}:${conversaId}`) ?? "");
      setSugestaoEmRevisao(null);
      setSugestaoDispensadaId(null);
    }
    setConversaSelecionadaId(conversaId);
  }

  useEffect(() => {
    setCursorMensagensAntigas(null);
    setCursorAntigasAplicado(null);
    setMensagensAntigas([]);
    setCursorMensagensNovas(null);
    setMensagensNovas([]);
    conversaRoladaRef.current = null;
  }, [conversaSelecionadaId]);

  // Acumula o que o poll de "novas desde X" trouxe — nunca substitui,
  // só soma (mesmo padrão de mensagensAntigas, na direção oposta).
  useEffect(() => {
    if (!paginaMensagensNovas?.mensagens.length) return;
    setMensagensNovas((atuais) => [...atuais, ...paginaMensagensNovas.mensagens]
      .filter((mensagem, indice, lista) => lista.findIndex((item) => item.id === mensagem.id) === indice));
  }, [paginaMensagensNovas]);

  // Avança o cursor do poll pra sempre a mensagem mais nova já visível,
  // não importa se ela chegou pela semeadura inicial, pelo próprio poll,
  // ou por um refetch manual (ex.: depois de eu mesma enviar algo) — assim
  // o poll nunca perde o rastro nem duplica trabalho.
  useEffect(() => {
    const maisRecente = mensagens.at(-1)?.createdAt;
    if (maisRecente) {
      const iso = new Date(maisRecente).toISOString();
      if (!cursorMensagensNovas || iso > cursorMensagensNovas) setCursorMensagensNovas(iso);
      return;
    }
    // Conversa sem nenhuma mensagem carregada ainda — assim que a
    // semeadura inicial responder (mesmo vazia), começa a escutar a
    // partir de agora. Sem isso, a primeira mensagem de uma conversa
    // nova nunca aparecia sozinha na tela (cursor nunca nascia).
    if (!cursorMensagensNovas && paginaMensagensRecentes !== undefined) {
      setCursorMensagensNovas(new Date().toISOString());
    }
  }, [mensagens, cursorMensagensNovas, paginaMensagensRecentes]);

  useEffect(() => {
    if (!paginaMensagensAntigas || !cursorMensagensAntigas || paginaMensagensAntigas.cursorConsultado !== cursorMensagensAntigas) return;
    setMensagensAntigas((anteriores) => [...paginaMensagensAntigas.mensagens, ...anteriores]
      .filter((mensagem, indice, lista) => lista.findIndex((item) => item.id === mensagem.id) === indice));
    setCursorAntigasAplicado(cursorMensagensAntigas);
    preservarPosicaoAoCarregarAntigasRef.current = true;
  }, [paginaMensagensAntigas, cursorMensagensAntigas]);

  useEffect(() => {
    if (!conversaSelecionadaId || !mensagens.length || preservarPosicaoAoCarregarAntigasRef.current) {
      preservarPosicaoAoCarregarAntigasRef.current = false;
      return;
    }
    const comportamento: ScrollBehavior = conversaRoladaRef.current === conversaSelecionadaId ? "smooth" : "auto";
    const rolar = () => bottomRef.current?.scrollIntoView({ behavior: comportamento, block: "end" });
    requestAnimationFrame(rolar);
    const timer = window.setTimeout(rolar, 180);
    conversaRoladaRef.current = conversaSelecionadaId;
    return () => window.clearTimeout(timer);
  }, [conversaSelecionadaId, mensagens.length, mensagens.at(-1)?.id]);

  useEffect(() => {
    const conversaAnterior = conversaDonaDoTextoRef.current;
    if (conversaAnterior === conversaSelecionadaId) return;
    conversaDonaDoTextoRef.current = conversaSelecionadaId;
    const rascunho = conversaSelecionadaId
      ? sessionStorage.getItem(`${CHAVE_RASCUNHO_CONVERSA}:${conversaSelecionadaId}`) ?? ""
      : "";
    setTexto(rascunho);
    setEditandoNome(false);
    setBuscaMensagemAtiva(false);
    setBuscaMensagem("");
    setNomeCriarCliente(conversaSelecionada?.nomeContato || "");
    setMentionInicio(null);
    setMentionados(new Set());
    setSugestaoEmRevisao(null);
    setSugestaoDispensadaId(null);
  }, [conversaSelecionadaId, conversaSelecionada?.nomeContato]);

  useEffect(() => {
    const conversaId = conversaDonaDoTextoRef.current;
    if (!conversaId) return;
    const chave = `${CHAVE_RASCUNHO_CONVERSA}:${conversaId}`;
    if (texto) sessionStorage.setItem(chave, texto);
    else sessionStorage.removeItem(chave);
  }, [texto]);

  useEffect(() => {
    const sugestao = sugestaoPendenteAgente.data;
    if (!sugestao && sugestaoEmRevisao?.conversaId === conversaSelecionadaId) {
      setSugestaoEmRevisao(null);
      setTexto("");
      return;
    }
    if (!conversaSelecionadaId || !sugestao || sugestao.conversaId !== conversaSelecionadaId || !sugestao.texto.trim()) return;
    if (sugestaoDispensadaId === sugestao.id || sugestaoEmRevisao?.id === sugestao.id || texto.trim()) return;
    setTexto(sugestao.texto);
    setSugestaoEmRevisao({
      id: sugestao.id,
      conversaId: sugestao.conversaId,
      textoOriginal: sugestao.texto,
      agente: sugestao.agenteNome,
      acaoPendente: sugestao.acaoPendente ?? null,
      fluxoPendenteNome: sugestao.fluxoPendenteNome ?? null,
    });
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(sugestao.texto.length, sugestao.texto.length);
    });
  }, [conversaSelecionadaId, sugestaoPendenteAgente.data, sugestaoDispensadaId, sugestaoEmRevisao?.id, sugestaoEmRevisao?.conversaId, texto]);

  function toggleSom() {
    const novo = !somAtivo;
    setSomAtivo(novo);
    localStorage.setItem("buddha_inbox_som", novo ? "true" : "false");
  }

  const conversasFiltradas = (conversas ?? []).filter((c) => {
    if (filtroStatus !== "todos" && c.status !== filtroStatus) return false;
    if (!busca) return true;
    const alvo = `${c.clienteNome ?? ""} ${c.nomeContato ?? ""} ${c.telefone}`.toLowerCase();
    return alvo.includes(busca.toLowerCase());
  });

  const mensagensFiltradas = useMemo(() => {
    if (!buscaMensagem.trim()) return mensagens;
    const termo = buscaMensagem.toLowerCase();
    return mensagens.filter((m) => (m.conteudo ?? "").toLowerCase().includes(termo));
  }, [mensagens, buscaMensagem]);

  const etiquetasAtuais = parseEtiquetas(conversaSelecionada?.etiquetas ?? null);
  const sugestaoFoiEditada = !!sugestaoEmRevisao && texto.trim() !== sugestaoEmRevisao.textoOriginal.trim();
  const fluxoPendenteNome = sugestaoEmRevisao?.acaoPendente?.startsWith("script_fluxo:")
    ? sugestaoEmRevisao.fluxoPendenteNome ?? "Fluxo configurado"
    : null;
  const modoAutomacaoAgentes = conversaSelecionada?.automacaoAgentesEfetiva ?? "ativa";
  const automacaoBloqueadaAte = conversaSelecionada?.automacaoAgentesBloqueadaAte
    ? formatHora(conversaSelecionada.automacaoAgentesBloqueadaAte)
    : null;

  function enviarRascunhoRevisado() {
    if (!sugestaoEmRevisao || !texto.trim()) return;
    conversaDaAcaoSugestaoRef.current = sugestaoEmRevisao.conversaId;
    aprovarSugestaoAgenteMutation.mutate({
      sugestaoId: sugestaoEmRevisao.id,
      textoFinal: texto.trim(),
      tipoRevisao: sugestaoFoiEditada ? "editada" : "aceita_como_esta",
      atendenteId: atendente?.id,
    });
  }

  function editarSugestaoLivremente() {
    if (!sugestaoEmRevisao) return;
    const sugestaoId = sugestaoEmRevisao.id;
    setSugestaoEmRevisao(null);
    setSugestaoDispensadaId(sugestaoId);
    liberarSugestaoParaEdicaoMutation.mutate({ sugestaoId, textoBase: texto.trim(), atendenteId: atendente?.id });
  }

  function abrirRejeicaoSugestao() {
    if (!sugestaoEmRevisao) return;
    setComentarioRejeicao("");
    setModalRejeitarSugestao(true);
  }

  function confirmarRejeicaoSugestao() {
    if (!sugestaoEmRevisao) return;
    conversaDaAcaoSugestaoRef.current = sugestaoEmRevisao.conversaId;
    reprovarSugestaoAgenteMutation.mutate({
      sugestaoId: sugestaoEmRevisao.id,
      comentario: comentarioRejeicao.trim() || undefined,
      atendenteId: atendente?.id,
    });
  }

  function handleEnviar() {
    if (!texto.trim() || !conversaSelecionadaId) return;
    // O botão de enviar já ficava desabilitado durante o envio, mas o
    // atalho de Enter chama esta função direto, sem passar pelo `disabled`
    // do botão — Enter duas vezes rápido (comum em quem usa muito chat)
    // mandava a mesma mensagem duas vezes pro cliente (2026-09-02).
    if (enviarMutation.isPending || aprovarSugestaoAgenteMutation.isPending) return;
    if (sugestaoEmRevisao) {
      // O envio pelo botão principal também é uma decisão: se mudou o texto,
      // registra como editada; se não mudou, aceita como está. Assim o rascunho
      // não fica preso depois que a recepção responde por conta própria.
      conversaDaAcaoSugestaoRef.current = sugestaoEmRevisao.conversaId;
      aprovarSugestaoAgenteMutation.mutate({
        sugestaoId: sugestaoEmRevisao.id,
        textoFinal: texto.trim(),
        tipoRevisao: texto.trim() === sugestaoEmRevisao.textoOriginal.trim() ? "aceita_como_esta" : "editada",
        atendenteId: atendente?.id,
      });
      return;
    }
    enviarMutation.mutate({
      conversaId: conversaSelecionadaId,
      texto: texto.trim(),
      mentioned: ehGrupo && mentionados.size > 0 ? Array.from(mentionados) : undefined,
    });
  }

  function abrirSugestaoIa() {
    if (!conversaSelecionadaId || !texto.trim()) {
      toast.error("Escreva uma mensagem antes de pedir uma sugestão.");
      return;
    }
    setSugestaoIa("");
    setModalSugestaoIa(true);
    sugerirMensagemIaMutation.mutate({ conversaId: conversaSelecionadaId, rascunho: texto.trim() });
  }

  function aceitarSugestaoIa() {
    if (!conversaSelecionadaId || !sugestaoIa.trim()) return;
    setModalSugestaoIa(false);
    enviarMutation.mutate({ conversaId: conversaSelecionadaId, texto: sugestaoIa.trim() });
  }

  /**
   * Detecta se o cursor está em meio a uma @menção (só em grupo) —
   * procura o último "@" antes do cursor sem espaço entre os dois.
   * Chamado a cada tecla no composer pra abrir/fechar o autocomplete.
   */
  function detectarMencao(valor: string, cursor: number) {
    if (!ehGrupo) { setMentionInicio(null); return; }
    const antesDoCursor = valor.slice(0, cursor);
    const arroba = antesDoCursor.lastIndexOf("@");
    if (arroba === -1 || /\s/.test(antesDoCursor.slice(arroba + 1))) {
      setMentionInicio(null);
      return;
    }
    setMentionInicio(arroba);
  }

  function selecionarMencao(membro: { telefone: string; telefoneMencao: string | null; nome: string | null }) {
    if (mentionInicio === null || !membro.telefoneMencao) return;
    const telefoneMencao = membro.telefoneMencao;
    const cursor = textareaRef.current?.selectionStart ?? texto.length;
    const rotulo = membro.nome || membro.telefone;
    const novoTexto = `${texto.slice(0, mentionInicio)}@${rotulo} ${texto.slice(cursor)}`;
    setTexto(novoTexto);
    setMentionados((prev) => new Set(prev).add(telefoneMencao));
    setMentionInicio(null);
    // Foco de volta no textarea, cursor logo depois do espaço inserido —
    // sem isso, o clique no item do autocomplete tira o foco da caixa.
    requestAnimationFrame(() => {
      const novaPos = mentionInicio + rotulo.length + 2;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(novaPos, novaPos);
    });
  }

  const mentionQuery = mentionInicio !== null ? texto.slice(mentionInicio + 1, textareaRef.current?.selectionStart ?? texto.length).toLowerCase() : "";
  const mentionSugestoes = mentionInicio !== null
    ? (membrosGrupo ?? []).filter((m) => Boolean(m.telefoneMencao) && (m.nome ?? m.telefone).toLowerCase().includes(mentionQuery)).slice(0, 8)
    : [];

  // Anexo fica "em espera" pra dar chance de escrever legenda (imagem)
  // antes de enviar, igual mobai-crm — não sobe/envia no instante em
  // que o arquivo é escolhido.
  function stageFile(file: File) {
    const tipo = file.type.startsWith("image/") ? "imagem" : file.type.startsWith("audio/") ? "audio" : "documento";
    const previewUrl = tipo === "imagem" ? URL.createObjectURL(file) : undefined;
    setAnexoPendente((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { file, tipo, previewUrl, legenda: "" };
    });
  }

  function handleAnexo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    stageFile(file);
  }

  function handlePasteTextarea(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (!file) return;
    e.preventDefault();
    stageFile(file);
  }

  async function handleEnviarAnexo() {
    if (!anexoPendente || !conversaSelecionadaId || enviarMidiaMutation.isPending) return;
    let arquivoBase64: string;
    try {
      arquivoBase64 = await fileToBase64(anexoPendente.file);
    } catch {
      // FileReader falhando aqui não passava pelo onError da mutation (nem
      // chegava a existir mutation) — ficava sem nenhum aviso, exatamente
      // como um envio "que não vai".
      toast.error("Não foi possível ler esse arquivo.");
      return;
    }
    enviarMidiaMutation.mutate({
      conversaId: conversaSelecionadaId,
      tipo: anexoPendente.tipo,
      arquivoBase64,
      contentType: anexoPendente.file.type || "application/octet-stream",
      fileName: anexoPendente.file.name,
      legenda: anexoPendente.legenda.trim() || undefined,
    });
  }

  function cancelarAnexo() {
    if (anexoPendente?.previewUrl) URL.revokeObjectURL(anexoPendente.previewUrl);
    setAnexoPendente(null);
  }

  function marcarMidiaComFalha(mensagemId: number) {
    setMidiasComFalha((atuais) => {
      if (atuais.has(mensagemId)) return atuais;
      const proximas = new Set(atuais);
      proximas.add(mensagemId);
      return proximas;
    });
  }

  function abrirEdicaoNome() {
    setNomeEditavel(conversaSelecionada?.nomeContato || "");
    setEditandoNome(true);
  }

  function salvarNome() {
    if (!nomeEditavel.trim() || !conversaSelecionadaId) return;
    atualizarNomeMutation.mutate({ id: conversaSelecionadaId, nome: nomeEditavel.trim() });
  }

  // Só aplica etiqueta já existente no catálogo (criar fica restrito a admin,
  // na tela Configuração do Inbox — ver ConfigInbox.tsx). Grava tanto na
  // conversa (exibição/histórico local, como sempre foi) quanto no catálogo
  // compartilhado de etiquetas do cliente, que já fica disponível como
  // filtro em Disparos.
  function adicionarEtiqueta(etiquetaCatalogo: { id: number; nome: string }) {
    if (!conversaSelecionadaId || etiquetasAtuais.includes(etiquetaCatalogo.nome)) return;
    definirEtiquetasMutation.mutate({ id: conversaSelecionadaId, etiquetas: [...etiquetasAtuais, etiquetaCatalogo.nome] });
    const clienteId = conversaSelecionada?.clienteId;
    if (clienteId) atribuirEtiquetaClienteMutation.mutate({ clienteId, etiquetaId: etiquetaCatalogo.id });
  }

  function removerEtiqueta(etq: string) {
    if (!conversaSelecionadaId) return;
    definirEtiquetasMutation.mutate({ id: conversaSelecionadaId, etiquetas: etiquetasAtuais.filter((e) => e !== etq) });
    const clienteId = conversaSelecionada?.clienteId;
    const etiquetaCatalogo = catalogoEtiquetasQuery.data?.find((e) => e.nome === etq);
    if (clienteId && etiquetaCatalogo) {
      removerEtiquetaClienteMutation.mutate({ clienteId, etiquetaId: etiquetaCatalogo.id });
    }
  }

  const mensageriaAtiva = mensageriaStatus?.ativa ?? true;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            WhatsApp
          </h1>
        </div>
        <UnidadeSelector />
      </div>

      {!mensageriaAtiva && (
        <div className="bg-destructive text-destructive-foreground text-xs px-3 py-1.5 rounded-md flex items-center justify-center gap-2">
          <Ban size={12} className="flex-shrink-0" />
          <span>Envio de mensagens pausado{user?.role === "admin" ? "" : " pelo administrador"}</span>
          {user?.role === "admin" && (
            <button onClick={() => setModalKillSwitch(true)} className="underline font-semibold flex-shrink-0">
              Reativar
            </button>
          )}
        </div>
      )}

      <Card className="flex flex-row h-[calc(100vh-150px)] overflow-hidden p-0">
        {/* Coluna 1: Lista de conversas — tela cheia no mobile quando nenhuma conversa está aberta */}
        <div className={`${conversaSelecionadaId ? "hidden" : "flex"} md:flex w-full md:w-[280px] flex-shrink-0 border-r flex-col min-h-0 overflow-hidden`}>
          <div className="p-3 border-b space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Inbox WhatsApp</h2>
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => { setModalNovoCliente(true); setNovoClienteNome(""); setNovoClienteTelefone(""); }}
                  title="Incluir cliente e iniciar conversa"
                >
                  <UserPlus size={13} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetchConversas()} title="Atualizar">
                  <RefreshCw size={13} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={toggleSom}
                  title={somAtivo ? "Som de notificação ativado (em breve)" : "Som de notificação desativado (em breve)"}
                >
                  {somAtivo ? <Volume2 size={13} className="text-primary" /> : <VolumeX size={13} className="text-muted-foreground" />}
                </Button>
                {user?.role === "admin" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 ${!mensageriaAtiva ? "text-destructive" : "text-muted-foreground"}`}
                    onClick={() => setModalKillSwitch(true)}
                    title={mensageriaAtiva ? "Pausar envio de mensagens (kill switch)" : "Mensageria pausada — clique pra reativar"}
                  >
                    <Ban size={13} />
                  </Button>
                )}
              </div>
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa..."
                className="pl-8 h-8 text-xs"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            <div className="flex gap-1">
              {(["todos", "aberta", "encerrada"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltroStatus(f)}
                  className={`flex-1 text-[10px] py-1 rounded font-medium transition-colors ${
                    filtroStatus === f ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {f === "todos" ? "Todos" : f === "aberta" ? "Aberto" : "Fechado"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {carregandoConversas && (
              <div className="p-3 space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            )}
            {!carregandoConversas && conversasFiltradas.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground text-center">
                Nenhuma conversa ainda.
              </div>
            )}
            {conversasFiltradas.map((c) => (
              <button
                key={c.id}
                  onClick={() => selecionarConversa(c.id)}
                className={`w-full min-w-0 text-left px-3 py-2.5 border-b hover:bg-muted/50 transition-colors flex gap-2 items-start overflow-hidden ${
                  conversaSelecionadaId === c.id ? "bg-muted" : ""
                }`}
              >
                <div className="relative shrink-0">
                  {c.isGrupo === "true" ? (
                    <Avatar className="h-8 w-8">
                      {c.fotoUrl && <AvatarImage src={c.fotoUrl} alt={c.nomeContato ?? c.telefone} className="object-cover" />}
                      <AvatarFallback className="text-xs bg-muted"><Users className="h-3.5 w-3.5" /></AvatarFallback>
                    </Avatar>
                  ) : (
                    <Avatar className="h-8 w-8">
                      {c.fotoUrl && <AvatarImage src={c.fotoUrl} alt={c.clienteNome ?? c.nomeContato ?? c.telefone} className="object-cover" />}
                      <AvatarFallback className="text-xs">{(c.clienteNome ?? c.nomeContato ?? c.telefone).slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  )}
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background ${statusDotClass(c.status)}`} />
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-xs truncate min-w-0 flex-1">{c.clienteNome || c.nomeContato || formatPhone(c.telefone)}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{formatHora(c.ultimaMensagemEm)}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <p className="text-[11px] text-muted-foreground truncate min-w-0 flex-1">{c.ultimaMensagemTexto || "—"}</p>
                    {c.naoLidas > 0 && (
                      <span className="shrink-0 bg-primary text-primary-foreground text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {c.naoLidas > 9 ? "9+" : c.naoLidas}
                      </span>
                    )}
                  </div>
                  {c.isLidPendente === "true" && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      <Badge variant="outline" className="text-[10px] py-0 border-orange-300 text-orange-700 bg-orange-50">
                        sem número confirmado
                      </Badge>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Coluna 2: Thread — tela cheia no mobile só quando uma conversa está aberta */}
        <div className={`${conversaSelecionadaId ? "flex" : "hidden"} md:flex flex-1 flex-col min-w-0 min-h-0 border-r`}>
          {!conversaSelecionadaId && (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <MessageCircle className="h-10 w-10 opacity-30" />
              <p className="text-sm">Selecione uma conversa</p>
            </div>
          )}

          {conversaSelecionadaId && (
            <>
              <div className="p-3 border-b flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConversaSelecionadaId(null)}
                  className="md:hidden -ml-1 p-1.5 rounded-md hover:bg-muted text-muted-foreground flex-shrink-0"
                  title="Voltar"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{conversaSelecionada?.clienteNome || conversaSelecionada?.nomeContato || (conversaSelecionada?.isGrupo === "true" ? "Grupo" : formatPhone(conversaSelecionada?.telefone))}</p>
                  {conversaSelecionada?.isGrupo === "true" ? (
                    <p className="text-xs text-muted-foreground">Grupo</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{formatPhone(conversaSelecionada?.telefone)}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant={buscaMensagemAtiva ? "secondary" : "ghost"}
                    size="icon"
                    className="h-7 w-7"
                    title="Buscar nas mensagens"
                    onClick={() => { setBuscaMensagemAtiva((v) => !v); setBuscaMensagem(""); }}
                  >
                    <Search size={13} />
                  </Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="relative h-7 w-7"
                        title={`Automação ${modoAutomacaoAgentes === "ativa" ? "ativa" : modoAutomacaoAgentes === "bloqueada_temporariamente" ? "pausada por 2 horas" : "pausada permanentemente"}. Clique para ajustar.`}
                        aria-label="Configurar automação da conversa"
                      >
                        <Bot size={13} />
                        <span className={`absolute right-1 top-1 h-1.5 w-1.5 rounded-full ${modoAutomacaoAgentes === "ativa" ? "bg-emerald-500" : modoAutomacaoAgentes === "bloqueada_temporariamente" ? "bg-amber-500" : "bg-rose-500"}`} />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2.5" align="end">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold">Automação</p>
                          <span className={`h-1.5 w-1.5 rounded-full ${modoAutomacaoAgentes === "ativa" ? "bg-emerald-500" : modoAutomacaoAgentes === "bloqueada_temporariamente" ? "bg-amber-500" : "bg-rose-500"}`} />
                        </div>
                        <div className="grid grid-cols-3 gap-1" role="group" aria-label="Controle de automação da conversa">
                          <Button type="button" variant={modoAutomacaoAgentes === "ativa" ? "default" : "outline"} size="sm" className="h-7 px-1 text-[9px]" title="Ativa: novas mensagens podem receber sugestões dos agentes." onClick={() => conversaSelecionadaId && definirAutomacaoAgentesMutation.mutate({ id: conversaSelecionadaId, modo: "ativa" })} disabled={definirAutomacaoAgentesMutation.isPending}>Ativa</Button>
                          <Button type="button" variant={modoAutomacaoAgentes === "bloqueada_temporariamente" ? "secondary" : "outline"} size="sm" className="h-7 px-1 text-[9px]" title="Pausar por 2 horas: não serão geradas novas sugestões até o prazo expirar." onClick={() => conversaSelecionadaId && definirAutomacaoAgentesMutation.mutate({ id: conversaSelecionadaId, modo: "bloqueada_temporariamente" })} disabled={definirAutomacaoAgentesMutation.isPending}>2 horas</Button>
                          <Button type="button" variant={modoAutomacaoAgentes === "bloqueada_permanentemente" ? "destructive" : "outline"} size="sm" className="h-7 px-1 text-[9px]" title="Pausar permanentemente e reiniciar o contexto operacional dos agentes." onClick={() => conversaSelecionadaId && definirAutomacaoAgentesMutation.mutate({ id: conversaSelecionadaId, modo: "bloqueada_permanentemente" })} disabled={definirAutomacaoAgentesMutation.isPending}>Permanente</Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  {conversaSelecionada && conversaSelecionada.isGrupo !== "true" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-primary hover:bg-primary/10 hover:text-primary"
                      title="Cobrar cliente por Link de Pagamento"
                      aria-label="Cobrar cliente por Link de Pagamento"
                      onClick={() => setModalCobrancaLink(true)}
                    >
                      <CreditCard size={13} />
                    </Button>
                  )}
                  {conversaSelecionada && (
                    <Button
                      size="sm"
                      variant={conversaSelecionada.status === "encerrada" ? "outline" : "secondary"}
                      className="h-7 px-2 gap-1 text-[10px]"
                      title={`Status: ${statusLabel(conversaSelecionada.status)}. Clique para ${conversaSelecionada.status === "encerrada" ? "reabrir" : "concluir"}.`}
                      onClick={() => alterarStatusMutation.mutate({
                        id: conversaSelecionadaId,
                        status: conversaSelecionada.status === "encerrada" ? "aberta" : "encerrada",
                      })}
                      disabled={alterarStatusMutation.isPending}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(conversaSelecionada.status)}`} />
                      {statusLabel(conversaSelecionada.status)}
                    </Button>
                  )}
                  {user?.role === "admin" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Apagar conversa"
                      onClick={() => setModalExcluir(true)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  )}
                </div>
              </div>

              {buscaMensagemAtiva && (
                <div className="px-3 py-2 border-b bg-muted/20 flex items-center gap-2">
                  <Search size={12} className="text-muted-foreground flex-shrink-0" />
                  <input
                    autoFocus
                    className="flex-1 text-xs bg-transparent focus:outline-none placeholder:text-muted-foreground"
                    placeholder="Buscar nas mensagens..."
                    value={buscaMensagem}
                    onChange={(e) => setBuscaMensagem(e.target.value)}
                  />
                  {buscaMensagem && (
                    <span className="text-[10px] text-muted-foreground flex-shrink-0">
                      {mensagensFiltradas.length} resultado{mensagensFiltradas.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  <button className="text-muted-foreground hover:text-foreground" onClick={() => { setBuscaMensagemAtiva(false); setBuscaMensagem(""); }}>
                    <X size={12} />
                  </button>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                {carregandoMensagens && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando mensagens...
                  </div>
                )}
                {haMensagensAntigas && !buscaMensagem && (
                  <div className="mb-3 flex justify-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      disabled={carregandoMensagensAntigas || !mensagens[0]?.createdAt}
                      onClick={() => setCursorMensagensAntigas(new Date(mensagens[0].createdAt).toISOString())}
                    >
                      {carregandoMensagensAntigas ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ArrowLeft className="mr-1.5 h-3.5 w-3.5 rotate-90" />}
                      Carregar mensagens mais antigas
                    </Button>
                  </div>
                )}
                <div className="space-y-3">
                  {mensagensFiltradas.map((m) => {
                    const meta = parseMetadados(m.metadados);
                    const attachmentUrl = getInboxAttachmentUrl(meta);
                    const imagemComFalha = midiasComFalha.has(m.id);
                    const enviada = m.direcao === "enviada";
                    return (
                    <div key={m.id} className={`group flex ${enviada ? "justify-end" : "justify-start"}`}>
                      <div className="relative max-w-[70%]">
                      <div
                        className={`absolute top-0 ${enviada ? "-left-8" : "-right-8"} opacity-0 group-hover:opacity-100 transition-opacity`}
                      >
                        <Popover>
                          <PopoverTrigger asChild>
                            <button type="button" className="p-1.5 rounded-full hover:bg-muted text-muted-foreground" title="Reagir">
                              <SmilePlus size={14} />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-1 flex gap-0.5" side="top">
                            {EMOJIS_REACAO.map((e) => (
                              <button
                                key={e}
                                type="button"
                                className="text-lg p-1 rounded hover:bg-muted hover:scale-110 transition-transform"
                                onClick={() => reagirMutation.mutate({ mensagemId: m.id, emoji: m.reacaoEmoji === e ? "" : e })}
                                title={m.reacaoEmoji === e ? "Remover reação" : "Reagir"}
                              >
                                {e}
                              </button>
                            ))}
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div
                        className={`rounded-lg px-3 py-2 text-sm ${
                          enviada ? "bg-primary text-primary-foreground" : "bg-muted"
                        }`}
                      >
                        {conversaSelecionada?.isGrupo === "true" && m.direcao === "recebida" && m.participanteNome && (
                          <p className="text-[11px] font-semibold text-primary mb-0.5">{m.participanteNome}</p>
                        )}
                        {m.tipo === "texto" && <p className="whitespace-pre-wrap">{m.conteudo}</p>}
                        {m.tipo === "imagem" && (
                          <div className="space-y-1">
                            {attachmentUrl && !imagemComFalha ? (
                              <img
                                src={attachmentUrl}
                                alt={meta.legenda || "imagem"}
                                className="rounded-md max-w-full max-h-64 min-w-40 bg-black/10 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => setPreviewModalUrl(attachmentUrl)}
                                onError={() => marcarMidiaComFalha(m.id)}
                              />
                            ) : (
                              <a
                                href={attachmentUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex min-w-52 items-center gap-2 rounded-md bg-black/10 px-2.5 py-2 text-left transition-colors hover:bg-black/20"
                              >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-background/20">
                                  <FileText className="h-4 w-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-medium">{meta.fileName || "Imagem anexada"}</span>
                                  <span className="block text-[10px] opacity-70">Imagem anexada</span>
                                </span>
                                <Download className="h-3.5 w-3.5 shrink-0 opacity-80" />
                              </a>
                            )}
                            {(meta.legenda || m.conteudo) && <p>{meta.legenda || m.conteudo}</p>}
                          </div>
                        )}
                        {m.tipo === "audio" && (
                          <div className="space-y-1">
                            {attachmentUrl ? (
                              <audio controls src={attachmentUrl} className="max-w-full h-9" />
                            ) : (
                              <span className="text-xs opacity-70">[áudio indisponível]</span>
                            )}
                            {m.transcricao && <p className="italic">"{m.transcricao}"</p>}
                          </div>
                        )}
                        {m.tipo === "documento" && (
                          attachmentUrl ? (
                            <a
                              href={attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex min-w-52 items-center gap-2 rounded-md bg-black/10 px-2.5 py-2 text-left transition-colors hover:bg-black/20"
                              title="Abrir documento"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-background/20">
                                <FileText className="h-4 w-4" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium">{meta.fileName || "Documento"}</span>
                                <span className="block text-[10px] opacity-70">Documento anexado</span>
                              </span>
                              <Download className="h-3.5 w-3.5 shrink-0 opacity-80" />
                            </a>
                          ) : (
                            <span className="text-xs opacity-70">[documento indisponível]</span>
                          )
                        )}
                        <p className="flex items-center justify-end gap-1 text-[10px] opacity-60 mt-1">
                          <span>
                            {formatHora(m.createdAt)}
                            {m.direcao === "enviada" && m.enviadaPorAtendenteNome && (
                              <> · {m.enviadaPorAtendenteNome}</>
                            )}
                          </span>
                          {m.direcao === "enviada" && <TickEntrega status={m.statusEntrega} />}
                        </p>
                      </div>
                      {m.reacaoEmoji && (
                        <span
                          className={`absolute -bottom-2 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-xs shadow ${
                            enviada ? "left-1" : "right-1"
                          }`}
                        >
                          {m.reacaoEmoji}
                        </span>
                      )}
                      </div>
                    </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </div>

              <div className="border-t">
              {anexoPendente && (
                <div className="px-3 pt-3 flex items-start gap-2">
                  {anexoPendente.tipo === "imagem" && anexoPendente.previewUrl ? (
                    <button
                      type="button"
                      className="relative h-16 w-16 rounded shrink-0 group"
                      onClick={() => setPreviewModalUrl(anexoPendente.previewUrl!)}
                      title="Ampliar imagem"
                    >
                      <img src={anexoPendente.previewUrl} alt={anexoPendente.file.name} className="h-16 w-16 rounded object-cover" />
                      <span className="absolute inset-0 rounded bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-colors">
                        <ZoomIn className="h-4 w-4 text-white opacity-0 group-hover:opacity-100" />
                      </span>
                    </button>
                  ) : (
                    <div className="h-16 w-16 rounded bg-muted flex items-center justify-center shrink-0">
                      {anexoPendente.tipo === "audio" ? <Volume2 className="h-5 w-5 text-muted-foreground" /> : <Paperclip className="h-5 w-5 text-muted-foreground" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs text-muted-foreground truncate">{anexoPendente.file.name}</p>
                    <Input
                      autoFocus
                      placeholder="Adicionar legenda (opcional)..."
                      className="h-8 text-sm"
                      value={anexoPendente.legenda}
                      onChange={(e) => setAnexoPendente((prev) => (prev ? { ...prev, legenda: e.target.value } : prev))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); handleEnviarAnexo(); }
                        if (e.key === "Escape") { e.preventDefault(); cancelarAnexo(); }
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="icon" className="h-8 w-8" disabled={enviarMidiaMutation.isPending} onClick={handleEnviarAnexo} title="Enviar">
                      {enviarMidiaMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" disabled={enviarMidiaMutation.isPending} onClick={cancelarAnexo} title="Cancelar">
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
              <div className="p-3 space-y-2">
                <input ref={fileInputRef} type="file" accept="image/*,audio/*,application/pdf" className="hidden" onChange={handleAnexo} />
                <div className="relative flex-1">
                  {mentionInicio !== null && mentionSugestoes.length > 0 && (
                    <div className="absolute bottom-full left-0 mb-1 w-64 max-h-48 overflow-y-auto rounded-lg border bg-popover shadow-md z-10">
                      {mentionSugestoes.map((m) => (
                        <button
                          key={m.telefone}
                          type="button"
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center justify-between gap-2"
                          onMouseDown={(e) => { e.preventDefault(); selecionarMencao(m); }}
                        >
                          <span className="truncate">{m.nome || formatPhone(m.telefone)}</span>
                          {m.isAdmin && <span className="text-[10px] text-muted-foreground shrink-0">admin</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  <Textarea
                    ref={textareaRef}
                    placeholder={ehGrupo ? "Digite uma mensagem... (@ pra mencionar)" : "Digite uma mensagem, / para scripts ou cole um print..."}
                    className="min-h-[78px] max-h-40 resize-none"
                    value={texto}
                    onPaste={handlePasteTextarea}
                    onChange={(e) => {
                      setTexto(e.target.value);
                      detectarMencao(e.target.value, e.target.selectionStart);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape" && mentionInicio !== null) {
                        e.preventDefault();
                        setMentionInicio(null);
                        return;
                      }
                      if (e.key === "Enter" && !e.shiftKey && mentionInicio !== null && mentionSugestoes.length > 0) {
                        e.preventDefault();
                        selecionarMencao(mentionSugestoes[0]);
                        return;
                      }
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleEnviar();
                        return;
                      }
                      const target = e.target as HTMLTextAreaElement;
                      const cursorNoInicio = target.selectionStart === 0 || /\s$/.test(texto.slice(0, target.selectionStart));
                      if (e.key === "/" && cursorNoInicio) {
                        e.preventDefault();
                        setScriptPickerOpen(true);
                      }
                    }}
                  />
                  {sugestaoEmRevisao?.conversaId === conversaSelecionadaId && (
                    <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50/70 p-2.5 dark:bg-amber-950/20">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">Sugestão em revisão</p>
                          <p className="mt-0.5 text-[11px] text-amber-800/80 dark:text-amber-200/75">{sugestaoFoiEditada ? "Texto alterado pela equipe: a edição será registrada para aperfeiçoar os prompts." : "Revise o texto antes do envio. A decisão será registrada para aperfeiçoar os prompts."}</p>
                        </div>
                        <Badge variant="outline" className="shrink-0 border-amber-300 bg-white/70 text-[10px] text-amber-800">{sugestaoFoiEditada ? "Editada" : "Original"}</Badge>
                      </div>
                      {fluxoPendenteNome && (
                        <div className="mt-2.5 flex items-start gap-2 rounded-md border border-[#b89445]/35 bg-[#fff9e8] px-2.5 py-2 text-[11px] text-[#6f4b14] dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-100">
                          <Sparkles className="mt-0.5 shrink-0" size={14} aria-hidden="true" />
                          <div>
                            <p><strong>Sugestão:</strong> Texto abaixo + Fluxo <strong>“{fluxoPendenteNome}”</strong></p>
                            <p className="mt-0.5 opacity-80">Ao aceitar, a mensagem e o fluxo serão enviados.</p>
                          </div>
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="sm" className="h-7 text-xs bg-emerald-700 hover:bg-emerald-800" disabled={!texto.trim() || aprovarSugestaoAgenteMutation.isPending || reprovarSugestaoAgenteMutation.isPending} onClick={enviarRascunhoRevisado}>
                          {aprovarSugestaoAgenteMutation.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1.5 h-3.5 w-3.5" />}
                          {sugestaoFoiEditada ? "Enviar edição" : "Aceitar como está e enviar"}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={aprovarSugestaoAgenteMutation.isPending || reprovarSugestaoAgenteMutation.isPending || liberarSugestaoParaEdicaoMutation.isPending} onClick={editarSugestaoLivremente}>
                          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 border-rose-300 text-xs text-rose-700 hover:bg-rose-50" disabled={aprovarSugestaoAgenteMutation.isPending || reprovarSugestaoAgenteMutation.isPending} onClick={abrirRejeicaoSugestao}>
                          <X className="mr-1.5 h-3.5 w-3.5" /> Rejeitar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      disabled={enviarMidiaMutation.isPending || !!anexoPendente}
                      onClick={() => fileInputRef.current?.click()}
                      title="Anexar arquivo"
                    >
                      {enviarMidiaMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    </Button>
                    <ScriptPicker
                      open={scriptPickerOpen}
                      onOpenChange={setScriptPickerOpen}
                      onSelect={(s) => setTexto((prev) => (prev ? `${prev}\n${s}` : s))}
                      disabled={!conversaSelecionadaId}
                      conversaId={conversaSelecionadaId ?? undefined}
                      clienteId={conversaSelecionada?.clienteId ?? undefined}
                      unidadeId={unidadeSelecionada?.id}
                      variaveis={{
                        nome_atendente: atendente?.nome ?? user?.name ?? "",
                        unidade: unidadeSelecionada?.nome ?? "",
                        nome_cliente: conversaSelecionada?.clienteNome || conversaSelecionada?.nomeContato || "",
                        first_name: (conversaSelecionada?.clienteNome || conversaSelecionada?.nomeContato || "").trim().split(/\s+/)[0] ?? "",
                      }}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0 text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                      disabled={!conversaSelecionadaId || !texto.trim() || enviarMutation.isPending || sugerirMensagemIaMutation.isPending}
                      onClick={abrirSugestaoIa}
                      title="Sugestão de mensagem com IA"
                      aria-label="Sugestão de mensagem com IA"
                    >
                      {sugerirMensagemIaMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="icon" className="shrink-0" title="Inserir emoji">
                          <SmilePlus className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 border-0" side="top" align="end">
                        <EmojiPicker
                          theme={Theme.AUTO}
                          onEmojiClick={(emojiData: EmojiClickData) => setTexto((prev) => prev + emojiData.emoji)}
                          searchPlaceholder="Buscar emoji..."
                          lazyLoadEmojis
                          height={380}
                          width={320}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <Button size="icon" className="shrink-0" disabled={enviarMutation.isPending || aprovarSugestaoAgenteMutation.isPending || !texto.trim()} onClick={handleEnviar} title="Enviar mensagem">
                    {(enviarMutation.isPending || aprovarSugestaoAgenteMutation.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">Enter para enviar · Shift+Enter para nova linha · / para scripts · ✨ para sugestão da IA</p>
              </div>
              </div>
            </>
          )}
        </div>

        {/* Coluna 3: Painel do contato — escondido no mobile, só desktop */}
        <div className="hidden md:flex w-[260px] flex-shrink-0 flex-col min-h-0 bg-muted/20">
          {!conversaSelecionadaId ? (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground p-4 text-center">
              Selecione uma conversa para ver os detalhes
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="p-4 space-y-4">
                <div className="text-center">
                  <Avatar
                    className={`h-14 w-14 mx-auto mb-2 ${conversaSelecionada?.fotoUrl ? "cursor-pointer hover:opacity-80 transition-opacity" : ""}`}
                    onClick={() => conversaSelecionada?.fotoUrl && setPreviewModalUrl(conversaSelecionada.fotoUrl)}
                    title={conversaSelecionada?.fotoUrl ? "Ver foto ampliada" : undefined}
                  >
                    {conversaSelecionada?.isGrupo === "true" ? (
                      <>
                        {conversaSelecionada?.fotoUrl && (
                          <AvatarImage src={conversaSelecionada.fotoUrl} alt={conversaSelecionada.nomeContato ?? conversaSelecionada.telefone} className="object-cover" />
                        )}
                        <AvatarFallback className="bg-muted"><Users className="h-6 w-6" /></AvatarFallback>
                      </>
                    ) : (
                      <>
                        {conversaSelecionada?.fotoUrl && (
                          <AvatarImage src={conversaSelecionada.fotoUrl} alt={conversaSelecionada.clienteNome ?? conversaSelecionada.nomeContato ?? ""} className="object-cover" />
                        )}
                        <AvatarFallback className="text-lg bg-primary/10 text-primary">
                          {(conversaSelecionada?.clienteNome ?? conversaSelecionada?.nomeContato ?? conversaSelecionada?.telefone ?? "?").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </>
                    )}
                  </Avatar>

                  {editandoNome ? (
                    <div className="flex items-center gap-1 mt-1 px-1">
                      <Input
                        autoFocus
                        value={nomeEditavel}
                        onChange={(e) => setNomeEditavel(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") salvarNome();
                          if (e.key === "Escape") setEditandoNome(false);
                        }}
                        className="h-6 text-xs text-center"
                        placeholder="Nome do contato"
                      />
                      <button className="flex-shrink-0 p-1 rounded bg-primary/10 hover:bg-primary/20 transition-colors" onClick={salvarNome} title="Salvar nome">
                        <Check size={11} className="text-primary" />
                      </button>
                      <button className="flex-shrink-0 p-1 rounded hover:bg-muted transition-colors" onClick={() => setEditandoNome(false)} title="Cancelar">
                        <X size={11} className="text-muted-foreground" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-1 mt-0.5 group">
                      <p className="font-semibold text-sm">{conversaSelecionada?.clienteNome || conversaSelecionada?.nomeContato || "Contato não identificado"}</p>
                      <button className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted" onClick={abrirEdicaoNome} title="Editar nome">
                        <Pencil size={10} className="text-muted-foreground" />
                      </button>
                    </div>
                  )}

                  {conversaSelecionada?.isGrupo === "true" ? (
                    <p className="text-xs text-muted-foreground">Grupo do WhatsApp</p>
                  ) : conversaSelecionada?.isLidPendente === "true" ? (
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      <AlertTriangle size={11} className="text-orange-500" />
                      <p className="text-xs text-orange-500 font-medium">Número não confirmado</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">{formatPhone(conversaSelecionada?.telefone)}</p>
                  )}
                  {conversaSelecionada?.clienteId && conversaSelecionada?.unidadeId && conversaSelecionada.isGrupo !== "true" && (
                    <PreferenciaTerapeutaInline clienteId={conversaSelecionada.clienteId} unidadeId={conversaSelecionada.unidadeId} />
                  )}
                  {/* Também aparece com LID já resolvido — a resolução some com o
                      aviso "número não confirmado", mas não junta sozinha com uma
                      conversa que essa mesma pessoa já tinha pelo telefone real
                      (achado real 2026-09-02: Marcelo Sestari duplicado). */}
                  {!!conversaSelecionada?.chatLid && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 h-6 text-xs gap-1 w-full border-orange-300 text-orange-600 hover:bg-orange-50"
                      onClick={() => { setModalUnificar(true); setUnificarBusca(""); setUnificarDestinoId(null); }}
                    >
                      <Merge size={10} />
                      Vincular a conversa existente
                    </Button>
                  )}
                </div>

                {ehGrupo && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Users size={11} /> Membros {membrosGrupo && membrosGrupo.length > 0 ? `(${membrosGrupo.length})` : ""}
                    </p>
                    {!membrosGrupo ? (
                      <p className="text-xs text-muted-foreground">Carregando...</p>
                    ) : membrosGrupo.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Não foi possível carregar os membros.</p>
                    ) : (
                      <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border p-1.5">
                        {membrosGrupo.map((m) => (
                          <div key={m.telefone} className="flex items-center justify-between gap-2 text-xs px-1 py-0.5">
                            <span className="truncate" title={m.participanteId ?? m.telefone}>{m.nome || formatPhone(m.telefone)}</span>
                            <span className={`text-[9px] shrink-0 ${m.identidadeCadastrada ? "text-emerald-700" : "text-muted-foreground"}`}>
                              {m.tipo === "terapeuta" ? "terapeuta" : m.tipo === "cliente" ? "cliente" : "não cadastrado"}
                            </span>
                            {m.isAdmin && <span className="text-[9px] text-muted-foreground shrink-0">admin</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {conversaSelecionada?.clienteId && (
                  <div className="rounded-lg border bg-muted/30 p-2.5 flex items-center justify-around text-center">
                    <div>
                      <p className="text-sm font-semibold">{conversaSelecionada.clienteQtdServicos ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">serviços na unidade</p>
                    </div>
                    <Separator orientation="vertical" className="h-8" />
                    <div>
                      <p className="text-sm font-semibold">
                        {(() => {
                          const dias = diasDesde(conversaSelecionada.clienteUltimoAtendimento);
                          return dias === null ? "—" : dias === 0 ? "Hoje" : `${dias} dias`;
                        })()}
                      </p>
                      <p className="text-[10px] text-muted-foreground">desde a última visita</p>
                    </div>
                  </div>
                )}

                {conversaSelecionada?.resumoRelacionamento?.plano && (
                  <HoverCard openDelay={180} closeDelay={120}>
                    <HoverCardTrigger asChild>
                      <div
                        tabIndex={0}
                        aria-label="Detalhes do plano"
                        className={`cursor-help rounded-lg border p-2.5 space-y-1.5 transition-colors hover:border-[#8d6a2b]/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                          conversaSelecionada.resumoRelacionamento.plano.status === "ativo"
                            ? "border-[#8d6a2b]/35 bg-[#fffdf7]"
                            : "border-muted bg-muted/20"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Plano</p>
                          <Badge variant="outline" className={`h-5 text-[9px] ${
                            conversaSelecionada.resumoRelacionamento.plano.status === "ativo"
                              ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                              : conversaSelecionada.resumoRelacionamento.plano.status === "expirado"
                                ? "border-amber-300 text-amber-700 bg-amber-50"
                                : "border-muted-foreground/30 text-muted-foreground"
                          }`}>
                            {conversaSelecionada.resumoRelacionamento.plano.status === "ativo"
                              ? "Ativo"
                              : conversaSelecionada.resumoRelacionamento.plano.status === "expirado"
                                ? "Expirado"
                                : "Finalizado"}
                          </Badge>
                        </div>
                        {conversaSelecionada.resumoRelacionamento.plano.status === "ativo" ? (
                          <p className="text-xs font-medium">
                            {conversaSelecionada.resumoRelacionamento.plano.sessoesDisponiveis} sessão(ões) disponível(is)
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            {conversaSelecionada.resumoRelacionamento.plano.status === "expirado" ? "Validade encerrada" : "Sessões concluídas"}
                          </p>
                        )}
                        {conversaSelecionada.resumoRelacionamento.plano.validade && (
                          <p className="text-[10px] text-muted-foreground">
                            Validade: {formatarDataRelacao(conversaSelecionada.resumoRelacionamento.plano.validade)}
                          </p>
                        )}
                        <p className="text-[9px] text-muted-foreground/80">Passe o mouse para ver as terapias</p>
                      </div>
                    </HoverCardTrigger>
                    <HoverCardContent side="left" align="start" className="w-80 max-h-[420px] overflow-y-auto p-0">
                      <div className="border-b border-[#8d6a2b]/15 bg-[#fffdf7] px-3 py-2.5">
                        <p className="text-xs font-semibold text-[#6f2025]">Detalhes do plano</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Terapias, saldo e utilização registrados no Belle</p>
                      </div>
                      <div className="space-y-3 p-3">
                        {conversaSelecionada.resumoRelacionamento.plano.detalhes?.map((plano: any, indice: number) => (
                          <section key={plano.planoBelleId ?? indice} className="space-y-2 border-b border-border/60 pb-3 last:border-b-0 last:pb-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[11px] font-semibold leading-tight">{plano.tipo || `Plano ${plano.planoBelleId ? `#${plano.planoBelleId}` : ""}`}</p>
                                {(plano.campanha || plano.dataVenda) && (
                                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                                    {[plano.campanha, plano.dataVenda ? `Venda: ${formatarDataRelacao(plano.dataVenda)}` : null].filter(Boolean).join(" · ")}
                                  </p>
                                )}
                              </div>
                              <Badge variant="outline" className="h-5 shrink-0 text-[9px]">{plano.status === "ativo" ? "Ativo" : plano.status === "expirado" ? "Expirado" : "Finalizado"}</Badge>
                            </div>
                            {plano.servicos?.map((servico: any, servicoIndice: number) => (
                              <div key={`${servico.nome}-${servicoIndice}`} className="rounded-md bg-muted/45 px-2 py-1.5">
                                <p className="text-[10px] font-medium leading-snug">{servico.nome}</p>
                                <p className="mt-0.5 text-[10px] text-muted-foreground">
                                  {servico.restantes} restantes · {servico.utilizadas} utilizadas · {servico.agendados} agendada(s)
                                </p>
                                <p className="text-[9px] text-muted-foreground/80">Total contratado: {servico.sessoes}</p>
                              </div>
                            ))}
                            {plano.validade && <p className="text-[10px] text-muted-foreground">Validade: {formatarDataRelacao(plano.validade)}</p>}
                            {plano.vendedorNome && <p className="text-[10px] text-muted-foreground">Vendedor: {plano.vendedorNome}</p>}
                          </section>
                        ))}
                        {!conversaSelecionada.resumoRelacionamento.plano.detalhes?.length && (
                          <p className="text-xs text-muted-foreground">Ainda não há detalhamento de terapias no relatório importado.</p>
                        )}
                        <p className="text-[9px] leading-3 text-muted-foreground/80">Utilizadas = total contratado − restantes − agendadas.</p>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                )}

                {conversaSelecionada?.resumoRelacionamento?.ultimoAtendimento && (
                  <div className="rounded-lg border border-muted bg-background p-2.5 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Último atendimento</p>
                    <p className="text-xs font-medium">
                      {formatarDataRelacao(conversaSelecionada.resumoRelacionamento.ultimoAtendimento.dataAtendimento)}
                      {conversaSelecionada.resumoRelacionamento.ultimoAtendimento.servicoNome ? ` · ${conversaSelecionada.resumoRelacionamento.ultimoAtendimento.servicoNome}` : ""}
                    </p>
                    {conversaSelecionada.resumoRelacionamento.ultimoAtendimento.profissionalNome && (
                      <p className="text-[10px] text-muted-foreground">
                        Terapeuta: {conversaSelecionada.resumoRelacionamento.ultimoAtendimento.profissionalNome}
                      </p>
                    )}
                  </div>
                )}

                {conversaSelecionada?.resumoRelacionamento && !conversaSelecionada.resumoRelacionamento.proximoAtendimento && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 p-2.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-500">Próximo atendimento: Não há agendamentos</p>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-5 w-5 text-muted-foreground hover:text-foreground" title="Opções">
                            <Plus className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              const hojeBrt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
                              setModoFormProximoAtendimento("incluir");
                              setFormProximoAtendimento({ data: hojeBrt, horario: "", servico: "" });
                              setTimeout(() => setEditandoProximoAtendimento(true), 0);
                            }}
                          >
                            <Plus className="h-3.5 w-3.5 mr-2" /> Incluir atendimento
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              const hojeBrt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
                              setTimeout(() => setFormListaEspera({ data: hojeBrt, horarioDesejado: "", terapiaDesejada: "", observacao: "" }), 0);
                            }}
                          >
                            <ListTodo className="h-3.5 w-3.5 mr-2" /> Adicionar à lista de espera
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )}

                {conversaSelecionada?.resumoRelacionamento?.proximoAtendimento && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 p-2.5 space-y-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-500">Próximo atendimento</p>
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1 py-0 ${conversaSelecionada.resumoRelacionamento.proximoAtendimento.status === "Agendado (IA)" ? "border-amber-300 text-amber-700" : "border-emerald-300 text-emerald-700"}`}
                          title={conversaSelecionada.resumoRelacionamento.proximoAtendimento.status === "Agendado (IA)" ? "Identificado pelo CRM na conversa — ainda não confirmado pela planilha do Belle" : "Confirmado pela planilha do Belle"}
                        >
                          {conversaSelecionada.resumoRelacionamento.proximoAtendimento.status === "Agendado (IA)" ? "CRM" : "Belle"}
                        </Badge>
                      </div>
                      {/* Popover-a-partir-de-menu era pouco confiável (achado real: "editar/incluir
                          abre e fecha rápido" mesmo com preventDefault+setTimeout — Popover não é
                          modal, e a camada de fechar-por-clique-fora dele competia com o
                          DropdownMenu se fechando). Dialog é modal e lida com isso de forma
                          confiável — é o padrão que o próprio Radix recomenda pra abrir um overlay
                          a partir de um item de menu. */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-5 w-5 text-emerald-700 hover:text-emerald-800" title="Opções do agendamento">
                            <Menu className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setTimeout(() => setModalChamadoTerapeuta(true), 0); }}>
                            <BellRing className="h-3.5 w-3.5 mr-2" /> Chamar terapeuta
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={sugerirProximoAtendimentoMutation.isPending}
                            onSelect={() => conversaSelecionadaId && sugerirProximoAtendimentoMutation.mutate({ conversaId: conversaSelecionadaId })}
                          >
                            {sugerirProximoAtendimentoMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-2" />}
                            Atualizar de acordo com a conversa (IA)
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              setModoFormProximoAtendimento("editar");
                              const p = conversaSelecionada.resumoRelacionamento?.proximoAtendimento;
                              if (p) setFormProximoAtendimento({ data: p.dataAtendimento, horario: p.horario ?? "", servico: p.servicoNome ?? "" });
                              setTimeout(() => setEditandoProximoAtendimento(true), 0);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Editar agendamento
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              const hojeBrt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
                              setModoFormProximoAtendimento("incluir");
                              setFormProximoAtendimento({ data: hojeBrt, horario: "", servico: "" });
                              setTimeout(() => setEditandoProximoAtendimento(true), 0);
                            }}
                          >
                            <Plus className="h-3.5 w-3.5 mr-2" /> Incluir novo atendimento
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              const hojeBrt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
                              setTimeout(() => setFormListaEspera({ data: hojeBrt, horarioDesejado: "", terapiaDesejada: "", observacao: "" }), 0);
                            }}
                          >
                            <ListTodo className="h-3.5 w-3.5 mr-2" /> Adicionar à lista de espera
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={cancelarProximoAtendimentoMutation.isPending}
                            onSelect={() => {
                              const id = conversaSelecionada.resumoRelacionamento?.proximoAtendimento?.id;
                              if (id && confirm("Cancelar este agendamento?")) cancelarProximoAtendimentoMutation.mutate({ id });
                            }}
                          >
                            <X className="h-3.5 w-3.5 mr-2" /> Cancelar agendamento
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <p className="text-xs font-medium">
                      {formatarDataRelacao(conversaSelecionada.resumoRelacionamento.proximoAtendimento.dataAtendimento)}
                      {conversaSelecionada.resumoRelacionamento.proximoAtendimento.horario ? ` às ${conversaSelecionada.resumoRelacionamento.proximoAtendimento.horario}` : ""}
                      {conversaSelecionada.resumoRelacionamento.proximoAtendimento.servicoNome ? ` · ${conversaSelecionada.resumoRelacionamento.proximoAtendimento.servicoNome}` : ""}
                    </p>
                    {conversaSelecionada.resumoRelacionamento.proximoAtendimento.profissionalNome && (
                      <p className="text-[10px] text-muted-foreground">
                        Terapeuta: {conversaSelecionada.resumoRelacionamento.proximoAtendimento.profissionalNome}
                      </p>
                    )}
                  </div>
                )}

                {/* Dialog compartilhado de "editar/incluir próximo atendimento" — vale tanto
                    pro menu do card vazio quanto pro card já preenchido, por isso mora fora
                    dos dois blocos condicionais acima (senão some do DOM quando o outro
                    estado está ativo e o menu não teria o que abrir). */}
                <Dialog open={editandoProximoAtendimento} onOpenChange={setEditandoProximoAtendimento}>
                  <DialogContent className="max-w-xs">
                    <DialogHeader>
                      <DialogTitle className="text-sm">
                        {modoFormProximoAtendimento === "editar" ? "Editar agendamento" : "Incluir novo atendimento"}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs">Data</Label>
                        <Input type="date" className="mt-1 h-8 text-xs" value={formProximoAtendimento.data}
                          onChange={(e) => setFormProximoAtendimento((f) => ({ ...f, data: e.target.value }))} />
                      </div>
                      <div>
                        <Label className="text-xs">Horário</Label>
                        <Input type="time" className="mt-1 h-8 text-xs" value={formProximoAtendimento.horario}
                          onChange={(e) => setFormProximoAtendimento((f) => ({ ...f, horario: e.target.value }))} />
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
                          label="Serviço"
                          value={formProximoAtendimento.servico}
                          onChange={(v) => setFormProximoAtendimento((f) => ({ ...f, servico: v }))}
                          valores={nomesServicosProximoAtendimento}
                          placeholder="Selecione ou digite"
                          id="proximo-atendimento-servico"
                        />
                      </div>
                      <Button size="sm" className="w-full h-7 text-xs" disabled={editarProximoAtendimentoMutation.isPending || criarProximoAtendimentoMutation.isPending}
                        onClick={() => {
                          const id = conversaSelecionada?.resumoRelacionamento?.proximoAtendimento?.id;
                          if (modoFormProximoAtendimento === "editar") {
                            if (!id) return;
                            editarProximoAtendimentoMutation.mutate({
                              id,
                              dataAtendimento: formProximoAtendimento.data,
                              horario: formProximoAtendimento.horario || null,
                              servicoNome: formProximoAtendimento.servico || null,
                            });
                            return;
                          }
                          if (!conversaSelecionadaId || !formProximoAtendimento.data) return;
                          criarProximoAtendimentoMutation.mutate({
                            conversaId: conversaSelecionadaId,
                            dataAtendimento: formProximoAtendimento.data,
                            horario: formProximoAtendimento.horario || null,
                            servicoNome: formProximoAtendimento.servico || null,
                          });
                        }}>
                        {editarProximoAtendimentoMutation.isPending || criarProximoAtendimentoMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}{modoFormProximoAtendimento === "editar" ? "Salvar" : "Incluir"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {/* Quanto mais parecido com o form de agendamento de verdade, mais fácil
                    vira um agendamento depois — mesmo campo de serviço (CampoBuscaLista +
                    filtro Seg-Sáb/Dom-Fer) usado acima. Observação é livre, pra recepção
                    anotar o que precisar pra organizar a fila (ex.: "a partir das 15h",
                    "pode ser com a Larah"). */}
                <Dialog open={!!formListaEspera} onOpenChange={(aberto) => !aberto && setFormListaEspera(null)}>
                  <DialogContent className="max-w-xs">
                    <DialogHeader>
                      <DialogTitle className="text-sm">Adicionar à lista de espera</DialogTitle>
                    </DialogHeader>
                    {formListaEspera && (
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs">Dia desejado</Label>
                          <Input type="date" className="mt-1 h-8 text-xs" value={formListaEspera.data}
                            onChange={(e) => setFormListaEspera({ ...formListaEspera, data: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Horário desejado (opcional)</Label>
                          <Input type="time" className="mt-1 h-8 text-xs"
                            value={formListaEspera.horarioDesejado}
                            onChange={(e) => setFormListaEspera({ ...formListaEspera, horarioDesejado: e.target.value })} />
                          <p className="mt-0.5 text-[10px] text-muted-foreground">Sem horário exato ("de tarde", "qualquer horário")? Deixa em branco e usa a Observação.</p>
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
                            value={formListaEspera.terapiaDesejada}
                            onChange={(v) => setFormListaEspera({ ...formListaEspera, terapiaDesejada: v })}
                            valores={nomesServicosProximoAtendimento}
                            placeholder="Selecione ou digite"
                            id="lista-espera-servico"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Observação</Label>
                          <Textarea rows={2} className="mt-1 text-xs" placeholder="Ex: a partir das 15h, pode ser com a Larah, aceita sábado..."
                            value={formListaEspera.observacao}
                            onChange={(e) => setFormListaEspera({ ...formListaEspera, observacao: e.target.value })} />
                        </div>
                        <Button size="sm" className="w-full h-7 text-xs" disabled={!formListaEspera.data || criarListaEsperaMutation.isPending}
                          onClick={() => {
                            if (!conversaSelecionadaId) return;
                            criarListaEsperaMutation.mutate({
                              conversaId: conversaSelecionadaId,
                              data: formListaEspera.data,
                              horarioDesejado: formListaEspera.horarioDesejado.trim() || undefined,
                              terapiaDesejada: formListaEspera.terapiaDesejada.trim() || undefined,
                              observacao: formListaEspera.observacao.trim() || undefined,
                            });
                          }}>
                          {criarListaEsperaMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}Adicionar
                        </Button>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>

                <ChamadoTerapeutaDialog
                  open={modalChamadoTerapeuta}
                  onOpenChange={setModalChamadoTerapeuta}
                  unidadeId={unidadeSelecionada?.id}
                  conversa={conversaSelecionada}
                  atendimento={conversaSelecionada?.resumoRelacionamento?.proximoAtendimento}
                />
                <CobrancaLinkDialog
                  open={modalCobrancaLink}
                  onOpenChange={setModalCobrancaLink}
                  conversaId={conversaSelecionadaId}
                  unidadeId={unidadeSelecionada?.id}
                  clienteNome={conversaSelecionada?.nomeContato ?? "Cliente"}
                  ehGrupo={conversaSelecionada?.isGrupo === "true"}
                />

                {conversaSelecionada && !conversaSelecionada.clienteId && conversaSelecionada.isGrupo !== "true" && (conversaSelecionada.candidatosCliente?.length ?? 0) > 0 && (
                  <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-500">
                      <UserPlus size={13} />
                      <p className="text-xs font-semibold">Esse número já está em {conversaSelecionada.candidatosCliente!.length} cadastros</p>
                    </div>
                    <p className="text-[11px] text-amber-700/80 dark:text-amber-500/80">
                      Comum quando um cliente usa o mesmo celular pra outra pessoa (ex.: mãe e filha). Qual é o cliente dessa conversa?
                    </p>
                    <div className="space-y-1">
                      {conversaSelecionada.candidatosCliente!.map((c) => (
                        <Button
                          key={c.id}
                          size="sm"
                          variant="outline"
                          className="w-full h-7 text-xs justify-start"
                          disabled={vincularClienteMutation.isPending}
                          onClick={() => conversaSelecionadaId && vincularClienteMutation.mutate({ conversaId: conversaSelecionadaId, clienteId: c.id })}
                        >
                          Vincular a {c.nome}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {conversaSelecionada && !conversaSelecionada.clienteId && conversaSelecionada.isGrupo !== "true" && (
                  <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-500">
                      <UserPlus size={13} />
                      <p className="text-xs font-semibold">
                        {(conversaSelecionada.candidatosCliente?.length ?? 0) > 0 ? "Nenhum desses? Criar novo cliente" : "Criar cliente no CRM"}
                      </p>
                    </div>
                    <p className="text-[11px] text-amber-700/80 dark:text-amber-500/80">
                      Este contato ainda não está cadastrado. Confira/edite o nome e clique em criar.
                    </p>
                    <Input
                      value={nomeCriarCliente}
                      onChange={(e) => setNomeCriarCliente(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && nomeCriarCliente.trim() && conversaSelecionadaId) {
                          criarClienteRapidoMutation.mutate({ conversaId: conversaSelecionadaId, nome: nomeCriarCliente.trim() });
                        }
                      }}
                      placeholder="Nome do cliente"
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      className="w-full h-7 text-xs"
                      disabled={!nomeCriarCliente.trim() || criarClienteRapidoMutation.isPending}
                      onClick={() => {
                        if (nomeCriarCliente.trim() && conversaSelecionadaId) {
                          criarClienteRapidoMutation.mutate({ conversaId: conversaSelecionadaId, nome: nomeCriarCliente.trim() });
                        }
                      }}
                    >
                      {criarClienteRapidoMutation.isPending ? "Criando..." : "Criar cliente"}
                    </Button>
                  </div>
                )}

                <Separator />

                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Etiquetas</p>
                  <div className="flex flex-wrap items-center gap-1">
                    {etiquetasAtuais.length === 0 && (
                      <p className="text-[10px] text-muted-foreground/60 italic">Nenhuma etiqueta ainda.</p>
                    )}
                    {etiquetasAtuais.map((etq) => (
                      <Badge key={etq} variant="outline" className="text-[10px] gap-1 pr-1">
                        <TagIcon size={9} />
                        {etq}
                        <button onClick={() => removerEtiqueta(etq)} className="hover:text-destructive">
                          <X size={9} />
                        </button>
                      </Badge>
                    ))}
                    {(() => {
                      const disponiveis = (catalogoEtiquetasQuery.data ?? []).filter((e) => !etiquetasAtuais.includes(e.nome));
                      if (disponiveis.length === 0) return null;
                      return (
                        <Select value="" onValueChange={(valor) => {
                          const etiqueta = disponiveis.find((e) => e.id.toString() === valor);
                          if (etiqueta) adicionarEtiqueta(etiqueta);
                        }}>
                          <SelectTrigger className="h-4 px-1 gap-0.5 border-none opacity-50 hover:opacity-100" title="Adicionar etiqueta">
                            <Plus className="h-2.5 w-2.5 text-muted-foreground" />
                          </SelectTrigger>
                          <SelectContent>
                            {disponiveis.map((e) => (
                              <SelectItem key={e.id} value={e.id.toString()}>{e.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    })()}
                  </div>
                </div>

                {user?.role === "admin" && (
                  <div className="rounded-lg border border-[#d9c7a1] bg-[#fffdfa] overflow-hidden">
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[#eadfca]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Sparkles size={11} className="text-[#8a6227]" />
                        <span className="text-[10px] font-semibold text-[#6c2330] uppercase tracking-wide">Log dos agentes</span>
                      </div>
                      <Badge variant="outline" className="text-[9px] h-4">Admin</Badge>
                    </div>
                    <div className="max-h-52 overflow-y-auto p-2 space-y-2">
                      {diagnosticoAgentes.isLoading && <p className="px-1 text-[10px] text-muted-foreground">Carregando diagnósticos...</p>}
                      {!diagnosticoAgentes.isLoading && (diagnosticoAgentes.data?.length ?? 0) === 0 && (
                        <p className="px-1 text-[10px] text-muted-foreground">Ainda não há execução registrada para esta conversa.</p>
                      )}
                      {diagnosticoAgentes.data?.map((evento) => {
                        const rota = [evento.receptor?.nome, evento.especialista?.nome].filter(Boolean).join(" → ");
                        const rastro = resumirRastroAgente(evento.rastro);
                        return (
                          <div key={evento.id} className="rounded-md border border-[#eadfca] bg-white/70 p-2 text-[10px] space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-medium truncate">{rota || "Execução sem rota definida"}</span>
                              <Badge variant="outline" className={evento.status === "erro" ? "border-red-300 text-red-700 text-[9px]" : evento.status === "ignorada" ? "border-amber-300 text-amber-700 text-[9px]" : "text-[9px]"}>{evento.status}</Badge>
                            </div>
                            <p className="text-muted-foreground">{formatHora(evento.createdAt)}{evento.intencao ? ` · Intenção: ${rotuloIntencaoAgente(evento.intencao)}` : evento.classificacao ? ` · ${evento.classificacao}` : ""}{evento.confianca !== null ? ` · ${evento.confianca}%` : ""}</p>
                            {evento.detalheIntencao && <p className="text-muted-foreground">{evento.detalheIntencao}</p>}
                            {rastro && <p className="text-muted-foreground break-words">{rastro}</p>}
                            {evento.sugestao && evento.sugestao.avaliacao === "pendente" && !evento.sugestao.enviadaEm ? (
                              <div className="rounded border border-emerald-200 bg-emerald-50/60 p-1.5 space-y-1.5">
                                <p className="text-emerald-900 whitespace-pre-wrap">{evento.sugestao.texto || "(sem texto)"}</p>
                                <p className="text-[9px] text-emerald-800">Disponibilizada automaticamente no compositor da conversa.</p>
                              </div>
                            ) : evento.sugestao && (
                              <p className="text-emerald-700">Sugestão: {evento.sugestao.avaliacao}{evento.sugestao.acaoPendente ? ` · ação ${evento.sugestao.acaoPendente}` : ""}</p>
                            )}
                            {evento.erro && <p className="text-red-700 break-words">Falha: {evento.erro}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Modal de preview ampliado (imagens do chat e foto do contato) */}
      {previewModalUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setPreviewModalUrl(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={previewModalUrl} alt="Preview" className="max-w-[90vw] max-h-[85vh] rounded-lg object-contain shadow-2xl" />
            <a
              href={previewModalUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              title="Baixar imagem"
              className="absolute top-2 right-12 bg-black/60 hover:bg-black/80 text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors"
            >
              <Download size={16} />
            </a>
            <button
              className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors"
              onClick={() => setPreviewModalUrl(null)}
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <Dialog open={modalSugestaoIa} onOpenChange={(open) => !open && setModalSugestaoIa(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              <Sparkles className="h-5 w-5 text-amber-600" /> Sugestão de mensagem
            </DialogTitle>
            <DialogDescription>
              A IA ajustou seu rascunho para uma comunicação calorosa, acolhedora e profissional.
            </DialogDescription>
          </DialogHeader>
          {sugerirMensagemIaMutation.isPending ? (
            <div className="py-10 flex flex-col items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-amber-700" />
              Preparando a sugestão...
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 whitespace-pre-wrap text-sm leading-6 text-foreground">
              {sugestaoIa}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalSugestaoIa(false)} disabled={sugerirMensagemIaMutation.isPending || enviarMutation.isPending}>
              Descartar
            </Button>
            <Button onClick={aceitarSugestaoIa} disabled={!sugestaoIa.trim() || enviarMutation.isPending}>
              {enviarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Aceitar e enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modalRejeitarSugestao} onOpenChange={setModalRejeitarSugestao}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-700">
              <X className="h-4 w-4" /> Rejeitar sugestão do agente
            </DialogTitle>
            <DialogDescription>O texto sugerido e o que você enviar depois já ficam registrados para comparação.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="comentario-rejeicao-agente">Comentário para aprendizado <span className="text-muted-foreground">(opcional)</span></Label>
              <Textarea id="comentario-rejeicao-agente" className="mt-1 min-h-24" value={comentarioRejeicao} onChange={(event) => setComentarioRejeicao(event.target.value)} placeholder="Explique o que deveria ter sido diferente, se necessário." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalRejeitarSugestao(false)} disabled={reprovarSugestaoAgenteMutation.isPending}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmarRejeicaoSugestao} disabled={reprovarSugestaoAgenteMutation.isPending}>
              {reprovarSugestaoAgenteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Confirmar rejeição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kill switch */}
      <Dialog open={modalKillSwitch} onOpenChange={setModalKillSwitch}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban size={16} className={mensageriaAtiva ? "text-destructive" : "text-emerald-600"} />
              {mensageriaAtiva ? "Pausar envio de mensagens?" : "Reativar envio de mensagens?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {mensageriaAtiva
              ? "Nenhuma mensagem de WhatsApp sairá do CRM (manual ou automática) até você reativar. Use em caso de bug ou envio indevido em massa."
              : "O envio de mensagens volta a funcionar normalmente para todos os usuários."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalKillSwitch(false)} disabled={setMensageriaStatus.isPending}>
              Cancelar
            </Button>
            <Button
              variant={mensageriaAtiva ? "destructive" : "default"}
              onClick={() => setMensageriaStatus.mutate({ ativa: !mensageriaAtiva })}
              disabled={setMensageriaStatus.isPending}
            >
              {setMensageriaStatus.isPending ? "Salvando..." : mensageriaAtiva ? "Pausar mensageria" : "Reativar mensageria"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excluir conversa */}
      <Dialog open={modalExcluir} onOpenChange={setModalExcluir}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 size={16} />
              Apagar conversa
            </DialogTitle>
            <DialogDescription>
              Confirma a exclusão de todas as mensagens da conversa com{" "}
              <span className="font-semibold text-foreground">{conversaSelecionada?.clienteNome || conversaSelecionada?.nomeContato || (conversaSelecionada?.isGrupo === "true" ? "este grupo" : formatPhone(conversaSelecionada?.telefone))}</span>?
              <br />
              <span className="text-destructive text-xs">Esta ação não pode ser desfeita.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalExcluir(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={excluirMutation.isPending}
              onClick={() => conversaSelecionadaId && excluirMutation.mutate({ id: conversaSelecionadaId })}
            >
              {excluirMutation.isPending ? "Apagando..." : "Apagar tudo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unificar conversa @lid */}
      <Dialog open={modalUnificar} onOpenChange={setModalUnificar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Merge size={16} className="text-orange-500" />
              Vincular a conversa existente
            </DialogTitle>
            <DialogDescription>
              Busque a conversa real deste cliente e mova as mensagens para ela. A conversa temporária será removida.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full pl-8 pr-3 py-2 text-sm rounded-md border bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Buscar por nome ou telefone..."
                value={unificarBusca}
                onChange={(e) => setUnificarBusca(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {(conversas ?? [])
                .filter((c) => c.id !== conversaSelecionadaId && c.isLidPendente !== "true" && c.isGrupo !== "true" && (
                  unificarBusca === "" ||
                  (c.clienteNome ?? "").toLowerCase().includes(unificarBusca.toLowerCase()) ||
                  (c.nomeContato ?? "").toLowerCase().includes(unificarBusca.toLowerCase()) ||
                  c.telefone.includes(unificarBusca)
                ))
                .slice(0, 20)
                .map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setUnificarDestinoId(c.id)}
                    className={`w-full text-left px-3 py-2 rounded-md border text-sm transition-colors ${
                      unificarDestinoId === c.id ? "border-primary bg-primary/10 text-primary" : "border-transparent hover:bg-muted/60"
                    }`}
                  >
                    <div className="font-medium text-xs">{c.clienteNome || c.nomeContato || formatPhone(c.telefone)}</div>
                    <div className="text-[10px] text-muted-foreground">{formatPhone(c.telefone)} · {c.ultimaMensagemTexto?.slice(0, 40)}</div>
                  </button>
                ))}
              {(conversas ?? []).filter((c) => c.id !== conversaSelecionadaId && c.isLidPendente !== "true" && c.isGrupo !== "true").length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma conversa encontrada.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setModalUnificar(false)}>Cancelar</Button>
            <Button
              size="sm"
              disabled={!unificarDestinoId || unificarMutation.isPending}
              onClick={() => {
                if (unificarDestinoId && conversaSelecionadaId) {
                  unificarMutation.mutate({ idOrigemLid: conversaSelecionadaId, idDestinoReal: unificarDestinoId });
                }
              }}
            >
              {unificarMutation.isPending ? "Unificando..." : "Unificar conversas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Novo cliente + conversa (sem mensagem prévia) */}
      <Dialog open={modalNovoCliente} onOpenChange={setModalNovoCliente}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus size={16} />
              Incluir cliente
            </DialogTitle>
            <DialogDescription>
              Cria o cliente e abre a conversa — útil quando alguém chega no balcão e ainda não mandou mensagem.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input
                autoFocus
                value={novoClienteNome}
                onChange={(e) => setNovoClienteNome(e.target.value)}
                placeholder="Nome do cliente"
              />
            </div>
            <div>
              <Label className="text-xs">WhatsApp</Label>
              <Input
                value={novoClienteTelefone}
                onChange={(e) => setNovoClienteTelefone(e.target.value)}
                placeholder="(16) 99999-9999"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalNovoCliente(false)}>Cancelar</Button>
            <Button
              disabled={!novoClienteNome.trim() || !novoClienteTelefone.trim() || !unidadeSelecionada?.id || iniciarConversaComClienteMutation.isPending}
              onClick={() => {
                if (novoClienteNome.trim() && novoClienteTelefone.trim() && unidadeSelecionada?.id) {
                  iniciarConversaComClienteMutation.mutate({
                    unidadeId: unidadeSelecionada.id,
                    nome: novoClienteNome.trim(),
                    telefone: novoClienteTelefone.trim(),
                  });
                }
              }}
            >
              {iniciarConversaComClienteMutation.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Aviso de celular já cadastrado noutro cliente — não deixa
          duplicar sem confirmação explícita (ver ResultadoCriarCliente
          em server/db.ts). */}
      <Dialog open={!!conflitoDuplicata} onOpenChange={(open) => !open && setConflitoDuplicata(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle size={16} />
              Celular já cadastrado
            </DialogTitle>
            <DialogDescription>
              {conflitoDuplicata?.candidatos.length === 1 ? (
                <>Cliente <span className="font-medium text-foreground">{conflitoDuplicata.candidatos[0].nome}</span> já usa esse número.</>
              ) : (
                <>Os clientes <span className="font-medium text-foreground">{conflitoDuplicata?.candidatos.map((c) => c.nome).join(", ")}</span> já usam esse número.</>
              )}
              {" "}Tem certeza que deseja usar o mesmo número para dois clientes distintos?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConflitoDuplicata(null)}>Cancelar</Button>
            <Button
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
              disabled={criarClienteRapidoMutation.isPending || iniciarConversaComClienteMutation.isPending}
              onClick={confirmarDuplicata}
            >
              Criar mesmo assim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
