import React, { useEffect, useMemo, useRef, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
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
import {
  Search, Send, Paperclip, Loader2, MessageCircle, RefreshCw, Volume2, VolumeX, Ban,
  Pencil, Check, X, Trash2, AlertTriangle, Sparkles, Tag as TagIcon, CheckCircle2, Merge, ArrowLeft,
  UserPlus, SmilePlus, Users, Download,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { telefonesCorrespondem } from "@shared/telefone";
import { formatPhone, diasDesde } from "@/lib/utils";
import EmojiPicker, { EmojiClickData, Theme } from "emoji-picker-react";
import { ScriptPicker } from "@/components/ScriptPicker";

function formatHora(data: string | Date | null | undefined) {
  if (!data) return "";
  const d = new Date(data);
  const hoje = new Date();
  const mesmoDay = d.toDateString() === hoje.toDateString();
  if (mesmoDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

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

function parseMetadados(metadados: string | null): { url?: string; legenda?: string; fileName?: string } {
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

export default function Mensagens() {
  const { unidadeSelecionada } = useUnidade();
  const { user } = useAuth();
  const [location] = useLocation();
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "aberta" | "encerrada">("todos");
  const [conversaSelecionadaId, setConversaSelecionadaId] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [somAtivo, setSomAtivo] = useState(() => localStorage.getItem("buddha_inbox_som") !== "false");
  const [buscaMensagemAtiva, setBuscaMensagemAtiva] = useState(false);
  const [buscaMensagem, setBuscaMensagem] = useState("");
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeEditavel, setNomeEditavel] = useState("");
  const [novaEtiqueta, setNovaEtiqueta] = useState("");
  const [modalKillSwitch, setModalKillSwitch] = useState(false);
  const [modalExcluir, setModalExcluir] = useState(false);
  const [modalUnificar, setModalUnificar] = useState(false);
  const [unificarBusca, setUnificarBusca] = useState("");
  const [unificarDestinoId, setUnificarDestinoId] = useState<number | null>(null);
  const [nomeCriarCliente, setNomeCriarCliente] = useState("");
  const [modalNovoCliente, setModalNovoCliente] = useState(false);
  const [novoClienteNome, setNovoClienteNome] = useState("");
  const [novoClienteTelefone, setNovoClienteTelefone] = useState("");
  const [scriptPickerOpen, setScriptPickerOpen] = useState(false);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  // Autocomplete de @menção em grupo — mentionInicio é o índice do "@" no
  // texto (null = não está em meio a uma menção); mentionados guarda os
  // telefones já inseridos nesta digitação, pra mandar no campo
  // "mentioned" da Z-API junto com o envio.
  const [mentionInicio, setMentionInicio] = useState<number | null>(null);
  const [mentionados, setMentionados] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const utils = trpc.useUtils();

  const { data: conversas, isLoading: carregandoConversas, refetch: refetchConversas } = trpc.inbox.conversas.list.useQuery(
    { unidadeId: unidadeSelecionada?.id },
    { enabled: !!unidadeSelecionada, refetchInterval: 15000 },
  );

  const { data: conversaSelecionada } = trpc.inbox.conversas.get.useQuery(
    { id: conversaSelecionadaId ?? 0 },
    { enabled: !!conversaSelecionadaId },
  );

  const { data: mensagens, isLoading: carregandoMensagens } = trpc.inbox.mensagens.list.useQuery(
    { conversaId: conversaSelecionadaId ?? 0 },
    { enabled: !!conversaSelecionadaId, refetchInterval: 8000 },
  );

  const ehGrupo = conversaSelecionada?.isGrupo === "true";
  const { data: membrosGrupo } = trpc.inbox.conversas.membrosGrupo.useQuery(
    { conversaId: conversaSelecionadaId ?? 0 },
    { enabled: !!conversaSelecionadaId && ehGrupo },
  );

  const conversaIdSolicitada = useMemo(() => {
    const query = location.split("?")[1] ?? "";
    const valor = Number(new URLSearchParams(query).get("conversaId"));
    return Number.isInteger(valor) && valor > 0 ? valor : null;
  }, [location]);

  const telefoneSolicitado = useMemo(() => {
    const query = location.split("?")[1] ?? "";
    return new URLSearchParams(query).get("telefone")?.trim() ?? "";
  }, [location]);

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
      utils.inbox.mensagens.list.invalidate({ conversaId: conversaSelecionadaId ?? 0 });
      utils.inbox.conversas.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const enviarMidiaMutation = trpc.inbox.mensagens.enviarMidia.useMutation({
    onSuccess: () => {
      utils.inbox.mensagens.list.invalidate({ conversaId: conversaSelecionadaId ?? 0 });
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

  const alterarStatusMutation = trpc.inbox.conversas.alterarStatus.useMutation({
    onSuccess: () => {
      utils.inbox.conversas.get.invalidate({ id: conversaSelecionadaId ?? 0 });
      utils.inbox.conversas.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

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

  useEffect(() => {
    if (conversaIdSolicitada) {
      setBusca("");
      setConversaSelecionadaId(conversaIdSolicitada);
      return;
    }
    if (!telefoneSolicitado) return;
    setBusca(telefoneSolicitado);
    const conversa = (conversas ?? []).find((item) => telefonesCorrespondem(item.telefone, telefoneSolicitado));
    if (conversa) {
      setConversaSelecionadaId(conversa.id);
      setBusca("");
    }
  }, [conversas, conversaIdSolicitada, telefoneSolicitado]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  useEffect(() => {
    setEditandoNome(false);
    setBuscaMensagemAtiva(false);
    setBuscaMensagem("");
    setNomeCriarCliente(conversaSelecionada?.nomeContato || "");
    setMentionInicio(null);
    setMentionados(new Set());
  }, [conversaSelecionadaId, conversaSelecionada?.nomeContato]);

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
    if (!buscaMensagem.trim()) return mensagens ?? [];
    const termo = buscaMensagem.toLowerCase();
    return (mensagens ?? []).filter((m) => (m.conteudo ?? "").toLowerCase().includes(termo));
  }, [mensagens, buscaMensagem]);

  const etiquetasAtuais = parseEtiquetas(conversaSelecionada?.etiquetas ?? null);

  function handleEnviar() {
    if (!texto.trim() || !conversaSelecionadaId) return;
    enviarMutation.mutate({
      conversaId: conversaSelecionadaId,
      texto: texto.trim(),
      mentioned: ehGrupo && mentionados.size > 0 ? Array.from(mentionados) : undefined,
    });
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

  function selecionarMencao(membro: { telefone: string; nome: string | null }) {
    if (mentionInicio === null) return;
    const cursor = textareaRef.current?.selectionStart ?? texto.length;
    const rotulo = membro.nome || membro.telefone;
    const novoTexto = `${texto.slice(0, mentionInicio)}@${rotulo} ${texto.slice(cursor)}`;
    setTexto(novoTexto);
    setMentionados((prev) => new Set(prev).add(membro.telefone));
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
    ? (membrosGrupo ?? []).filter((m) => (m.nome ?? m.telefone).toLowerCase().includes(mentionQuery)).slice(0, 8)
    : [];

  async function handleAnexo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !conversaSelecionadaId) return;
    const tipo = file.type.startsWith("image/") ? "imagem" : file.type.startsWith("audio/") ? "audio" : "documento";
    const arquivoBase64 = await fileToBase64(file);
    enviarMidiaMutation.mutate({
      conversaId: conversaSelecionadaId,
      tipo,
      arquivoBase64,
      contentType: file.type || "application/octet-stream",
      fileName: file.name,
    });
    e.target.value = "";
  }

  function abrirEdicaoNome() {
    setNomeEditavel(conversaSelecionada?.nomeContato || "");
    setEditandoNome(true);
  }

  function salvarNome() {
    if (!nomeEditavel.trim() || !conversaSelecionadaId) return;
    atualizarNomeMutation.mutate({ id: conversaSelecionadaId, nome: nomeEditavel.trim() });
  }

  function adicionarEtiqueta() {
    if (!novaEtiqueta.trim() || !conversaSelecionadaId) return;
    if (etiquetasAtuais.includes(novaEtiqueta.trim())) {
      setNovaEtiqueta("");
      return;
    }
    definirEtiquetasMutation.mutate({ id: conversaSelecionadaId, etiquetas: [...etiquetasAtuais, novaEtiqueta.trim()] });
    setNovaEtiqueta("");
  }

  function removerEtiqueta(etq: string) {
    if (!conversaSelecionadaId) return;
    definirEtiquetasMutation.mutate({ id: conversaSelecionadaId, etiquetas: etiquetasAtuais.filter((e) => e !== etq) });
  }

  const mensageriaAtiva = mensageriaStatus?.ativa ?? true;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Mensagens
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conversas de WhatsApp.
          </p>
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

      <Card className="flex flex-row h-[calc(100vh-220px)] overflow-hidden p-0">
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
                onClick={() => setConversaSelecionadaId(c.id)}
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
                <div className="space-y-3">
                  {mensagensFiltradas.map((m) => {
                    const meta = parseMetadados(m.metadados);
                    return (
                    <div key={m.id} className={`flex ${m.direcao === "enviada" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                          m.direcao === "enviada" ? "bg-primary text-primary-foreground" : "bg-muted"
                        }`}
                      >
                        {conversaSelecionada?.isGrupo === "true" && m.direcao === "recebida" && m.participanteNome && (
                          <p className="text-[11px] font-semibold text-primary mb-0.5">{m.participanteNome}</p>
                        )}
                        {m.tipo === "texto" && <p className="whitespace-pre-wrap">{m.conteudo}</p>}
                        {m.tipo === "imagem" && (
                          <div className="space-y-1">
                            {meta.url ? (
                              <img
                                src={meta.url}
                                alt={meta.legenda || "imagem"}
                                className="rounded max-w-full max-h-64 object-contain cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => setPreviewModalUrl(meta.url ?? null)}
                              />
                            ) : (
                              <span className="text-xs opacity-70">[imagem indisponível]</span>
                            )}
                            {(meta.legenda || m.conteudo) && <p>{meta.legenda || m.conteudo}</p>}
                          </div>
                        )}
                        {m.tipo === "audio" && (
                          <div className="space-y-1">
                            {meta.url ? (
                              <audio controls src={meta.url} className="max-w-full h-9" />
                            ) : (
                              <span className="text-xs opacity-70">[áudio indisponível]</span>
                            )}
                            {m.transcricao && <p className="italic">"{m.transcricao}"</p>}
                          </div>
                        )}
                        {m.tipo === "documento" && (
                          meta.url ? (
                            <a href={meta.url} target="_blank" rel="noreferrer" className="text-xs underline opacity-90">
                              {meta.fileName || "documento"}
                            </a>
                          ) : (
                            <span className="text-xs opacity-70">[documento indisponível]</span>
                          )
                        )}
                        <p className="text-[10px] opacity-60 mt-1">
                          {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          {m.direcao === "enviada" && m.enviadaPorAtendenteNome && (
                            <> · {m.enviadaPorAtendenteNome}</>
                          )}
                        </p>
                      </div>
                    </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </div>

              <div className="p-3 border-t flex items-end gap-2">
                <input ref={fileInputRef} type="file" accept="image/*,audio/*,application/pdf" className="hidden" onChange={handleAnexo} />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  disabled={enviarMidiaMutation.isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {enviarMidiaMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </Button>
                <ScriptPicker
                  open={scriptPickerOpen}
                  onOpenChange={setScriptPickerOpen}
                  onSelect={(s) => setTexto((prev) => (prev ? `${prev}\n${s}` : s))}
                  disabled={!conversaSelecionadaId}
                />
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
                    placeholder={ehGrupo ? "Digite uma mensagem... (@ pra mencionar)" : "Digite uma mensagem..."}
                    className="min-h-9 max-h-32 resize-none"
                    value={texto}
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
                </div>
                <Button size="icon" className="shrink-0" disabled={enviarMutation.isPending || !texto.trim()} onClick={handleEnviar}>
                  {enviarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
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
                  {conversaSelecionada?.isLidPendente === "true" && (
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
                            <span className="truncate">{m.nome || formatPhone(m.telefone)}</span>
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
                          return dias === null ? "—" : dias === 0 ? "Hoje" : `${dias}d`;
                        })()}
                      </p>
                      <p className="text-[10px] text-muted-foreground">desde a última visita</p>
                    </div>
                  </div>
                )}

                {conversaSelecionada && !conversaSelecionada.clienteId && conversaSelecionada.isGrupo !== "true" && (
                  <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
                    <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-500">
                      <UserPlus size={13} />
                      <p className="text-xs font-semibold">Criar cliente no CRM</p>
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
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${statusDotClass(conversaSelecionada?.status || "")}`} />
                      <span className="text-xs">{statusLabel(conversaSelecionada?.status || "")}</span>
                    </div>
                    {conversaSelecionada && (
                      <Button
                        size="sm"
                        variant={conversaSelecionada.status === "encerrada" ? "outline" : "default"}
                        className="h-6 text-[10px] px-2 gap-1"
                        onClick={() => alterarStatusMutation.mutate({
                          id: conversaSelecionadaId,
                          status: conversaSelecionada.status === "encerrada" ? "aberta" : "encerrada",
                        })}
                        disabled={alterarStatusMutation.isPending}
                      >
                        <CheckCircle2 size={10} />
                        {conversaSelecionada.status === "encerrada" ? "Reabrir" : "Concluir"}
                      </Button>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Etiquetas</p>
                  <div className="flex flex-wrap gap-1">
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
                  </div>
                  <div className="flex gap-1">
                    <Input
                      value={novaEtiqueta}
                      onChange={(e) => setNovaEtiqueta(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") adicionarEtiqueta(); }}
                      placeholder="Nova etiqueta"
                      className="h-6 text-[11px]"
                    />
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={adicionarEtiqueta} disabled={!novaEtiqueta.trim()}>
                      +
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="rounded-lg border border-primary/20 bg-primary/5 overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 py-2">
                    <Sparkles size={11} className="text-primary" />
                    <span className="text-[10px] font-semibold text-primary">Análise IA</span>
                  </div>
                  <div className="px-3 pb-2.5">
                    {conversaSelecionada?.resumoConversa ? (
                      <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{conversaSelecionada.resumoConversa}</p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground/60 italic">Sem análise ainda — recurso em breve.</p>
                    )}
                  </div>
                </div>
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
