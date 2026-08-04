import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useUnidade } from "@/contexts/UnidadeContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Search, MessageCircle, Phone, Clock, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Mensagem = {
  id: number;
  direcao: "recebida" | "enviada";
  tipo: string;
  conteudo: string | null;
  lida: boolean;
  enviadaPorIa: boolean;
  transcricao: string | null;
  createdAt: Date;
};

export default function Inbox() {
  const { unidadeSelecionada } = useUnidade();
  const [conversaSelecionada, setConversaSelecionada] = useState<number | null>(null);
  const [mensagemTexto, setMensagemTexto] = useState("");
  const [busca, setBusca] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversas, isLoading: loadingConversas, refetch } = trpc.inbox.list.useQuery({
    unidadeId: unidadeSelecionada?.id,
    status: "all",
  });

  const { data: mensagens, refetch: refetchMensagens } = trpc.inbox.mensagens.useQuery(
    { conversaId: conversaSelecionada ?? 0 },
    { enabled: !!conversaSelecionada, refetchInterval: 5000 }
  );

  const { data: totalNaoLidas } = trpc.inbox.totalNaoLidas.useQuery(
    { unidadeId: unidadeSelecionada?.id },
    { refetchInterval: 10000 }
  );

  const marcarLida = trpc.inbox.marcarLida.useMutation({
    onSuccess: () => refetch(),
  });

  const enviarMensagem = trpc.inbox.enviar.useMutation({
    onSuccess: () => {
      setMensagemTexto("");
      refetchMensagens();
      refetch();
    },
    onError: (err) => toast.error("Erro ao enviar: " + err.message),
  });

  const conversaAtual = conversas?.find((c: any) => c.id === conversaSelecionada);

  useEffect(() => {
    if (conversaSelecionada && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens, conversaSelecionada]);

  useEffect(() => {
    if (conversaSelecionada) {
      marcarLida.mutate({ id: conversaSelecionada });
    }
  }, [conversaSelecionada]);

  const handleEnviar = useCallback(() => {
    if (!mensagemTexto.trim() || !conversaSelecionada) return;
    enviarMensagem.mutate({
      conversaId: conversaSelecionada,
      mensagem: mensagemTexto.trim(),
    });
  }, [mensagemTexto, conversaSelecionada, enviarMensagem]);

  const conversasFiltradas = conversas?.filter((c: any) =>
    !busca || c.nomeContato?.toLowerCase().includes(busca.toLowerCase()) || c.telefone.includes(busca)
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0">
      {/* Lista de conversas */}
      <div className="w-80 border-r border-border/40 flex flex-col bg-card/30">
        <div className="p-4 border-b border-border/40">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-serif font-light text-foreground flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-[hsl(var(--primary))]" />
              Inbox
            </h2>
            {totalNaoLidas && totalNaoLidas > 0 && (
              <Badge className="bg-red-500 text-white">{totalNaoLidas} não lidas</Badge>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversa..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          {loadingConversas ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : !conversasFiltradas || conversasFiltradas.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <MessageCircle className="h-10 w-10 mx-auto mb-2 opacity-30" />
              Nenhuma conversa ainda
            </div>
          ) : (
            <div className="space-y-0">
              {conversasFiltradas.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => setConversaSelecionada(c.id)}
                  className={cn(
                    "w-full flex items-start gap-3 p-3 text-left hover:bg-accent/50 transition-colors border-b border-border/20",
                    conversaSelecionada === c.id && "bg-accent"
                  )}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    {c.fotoUrl ? (
                      <img src={c.fotoUrl} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : null}
                    <AvatarFallback className="bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] text-sm">
                      {(c.nomeContato || c.telefone || "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">
                        {c.nomeContato || c.telefone}
                      </span>
                      {c.naoLidas > 0 && (
                        <Badge className="bg-[hsl(var(--primary))] text-white text-xs shrink-0 ml-1">
                          {c.naoLidas}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {c.ultimaMensagemTexto || "Sem mensagens"}
                    </p>
                    <span className="text-xs text-muted-foreground/60">
                      {new Date(c.ultimaMensagemEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Área de mensagens */}
      <div className="flex-1 flex flex-col">
        {conversaSelecionada && conversaAtual ? (
          <>
            <div className="p-4 border-b border-border/40 flex items-center gap-3 bg-card/30">
              <Avatar className="h-10 w-10">
                {conversaAtual.fotoUrl ? (
                  <img src={conversaAtual.fotoUrl} alt="" className="h-full w-full rounded-full object-cover" />
                ) : null}
                <AvatarFallback className="bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))]">
                  {(conversaAtual.nomeContato || conversaAtual.telefone || "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 className="text-sm font-medium">{conversaAtual.nomeContato || conversaAtual.telefone}</h3>
                <p className="text-xs text-muted-foreground">{conversaAtual.telefone}</p>
              </div>
              <Badge
                variant={conversaAtual.status === "respondida" ? "default" : "secondary"}
                className="text-xs"
              >
                {conversaAtual.status}
              </Badge>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-background">
              {mensagens?.map((msg: Mensagem) => (
                <div
                  key={msg.id}
                  className={cn("flex", msg.direcao === "enviada" ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[70%] rounded-lg px-3 py-2 text-sm",
                      msg.direcao === "enviada"
                        ? "bg-[hsl(var(--primary))] text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {msg.tipo === "audio" && msg.transcricao ? (
                      <div>
                        <p className="text-xs opacity-70 mb-1">Áudio transcrito:</p>
                        <p>{msg.transcricao}</p>
                      </div>
                    ) : msg.tipo === "audio" ? (
                      <p className="italic opacity-70">Áudio (sem transcrição)</p>
                    ) : (
                      <p>{msg.conteudo}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs opacity-50">
                        {new Date(msg.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {msg.direcao === "enviada" && <CheckCheck className="h-3 w-3 opacity-50" />}
                      {msg.enviadaPorIa && (
                        <span className="text-xs opacity-50">IA</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {(!mensagens || mensagens.length === 0) && (
                <div className="text-center text-sm text-muted-foreground py-8">
                  Nenhuma mensagem ainda. Envie a primeira!
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border/40 bg-card/30">
              <div className="flex gap-2">
                <Input
                  placeholder="Digite sua mensagem..."
                  value={mensagemTexto}
                  onChange={(e) => setMensagemTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleEnviar();
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={handleEnviar}
                  disabled={!mensagemTexto.trim() || enviarMensagem.isPending}
                  size="icon"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageCircle className="h-16 w-16 mx-auto mb-4 text-muted-foreground/20" />
              <p className="text-muted-foreground">Selecione uma conversa para começar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
