import { useEffect, useRef, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Search, Send, Paperclip, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

function canalLabel(canal: string) {
  return canal === "buddha_mkt" ? "Buddha Mkt" : "Z-API";
}

function canalBadgeClass(canal: string) {
  return canal === "buddha_mkt"
    ? "border-amber-300 text-amber-700 bg-amber-50"
    : "border-emerald-300 text-emerald-700 bg-emerald-50";
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
  const [busca, setBusca] = useState("");
  const [conversaSelecionadaId, setConversaSelecionadaId] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const { data: conversas, isLoading: carregandoConversas } = trpc.inbox.conversas.list.useQuery(
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

  const enviarMutation = trpc.inbox.mensagens.enviar.useMutation({
    onSuccess: () => {
      setTexto("");
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens]);

  const conversasFiltradas = (conversas ?? []).filter((c) => {
    if (!busca) return true;
    const alvo = `${c.nomeContato ?? ""} ${c.telefone}`.toLowerCase();
    return alvo.includes(busca.toLowerCase());
  });

  function handleEnviar() {
    if (!texto.trim() || !conversaSelecionadaId) return;
    enviarMutation.mutate({ conversaId: conversaSelecionadaId, texto: texto.trim() });
  }

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Mensagens
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conversas de WhatsApp — Z-API por unidade e Buddha Mkt.
          </p>
        </div>
        <UnidadeSelector />
      </div>

      <Card className="grid grid-cols-[320px_1fr] h-[calc(100vh-220px)] overflow-hidden p-0">
        {/* Lista de conversas */}
        <div className="border-r flex flex-col min-h-0">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa..."
                className="pl-8 h-9"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {carregandoConversas && (
              <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
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
                className={`w-full text-left p-3 border-b hover:bg-muted/50 transition-colors flex gap-3 items-start ${
                  conversaSelecionadaId === c.id ? "bg-muted" : ""
                }`}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback>{(c.nomeContato ?? c.telefone).slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-sm truncate">{c.nomeContato || c.telefone}</span>
                    {c.naoLidas > 0 && (
                      <Badge className="h-5 min-w-5 px-1.5 justify-center">{c.naoLidas}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{c.ultimaMensagemTexto || "—"}</p>
                  <Badge variant="outline" className={`text-[10px] py-0 mt-1 ${canalBadgeClass(c.canal)}`}>
                    {canalLabel(c.canal)}
                  </Badge>
                </div>
              </button>
            ))}
          </ScrollArea>
        </div>

        {/* Thread */}
        <div className="flex flex-col min-h-0">
          {!conversaSelecionadaId && (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
              <MessageCircle className="h-10 w-10 opacity-30" />
              <p className="text-sm">Selecione uma conversa</p>
            </div>
          )}

          {conversaSelecionadaId && (
            <>
              <div className="p-3 border-b flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{conversaSelecionada?.nomeContato || conversaSelecionada?.telefone}</p>
                  <p className="text-xs text-muted-foreground">{conversaSelecionada?.telefone}</p>
                </div>
                {conversaSelecionada && (
                  <Badge variant="outline" className={canalBadgeClass(conversaSelecionada.canal)}>
                    {canalLabel(conversaSelecionada.canal)}
                  </Badge>
                )}
              </div>

              <ScrollArea className="flex-1 p-4">
                {carregandoMensagens && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando mensagens...
                  </div>
                )}
                <div className="space-y-3">
                  {(mensagens ?? []).map((m) => (
                    <div key={m.id} className={`flex ${m.direcao === "enviada" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                          m.direcao === "enviada" ? "bg-primary text-primary-foreground" : "bg-muted"
                        }`}
                      >
                        {m.tipo === "texto" && <p className="whitespace-pre-wrap">{m.conteudo}</p>}
                        {m.tipo === "imagem" && (
                          <div className="space-y-1">
                            {m.conteudo && <p>{m.conteudo}</p>}
                            <span className="text-xs opacity-70">[imagem]</span>
                          </div>
                        )}
                        {m.tipo === "audio" && (
                          <div className="space-y-1">
                            <span className="text-xs opacity-70">[áudio]</span>
                            {m.transcricao && <p className="italic">"{m.transcricao}"</p>}
                          </div>
                        )}
                        {m.tipo === "documento" && <span className="text-xs opacity-70">[documento]</span>}
                        <p className="text-[10px] opacity-60 mt-1">
                          {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              <div className="p-3 border-t flex items-end gap-2">
                <input ref={fileInputRef} type="file" accept="image/*,audio/*" className="hidden" onChange={handleAnexo} />
                <Button
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  disabled={enviarMidiaMutation.isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {enviarMidiaMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </Button>
                <Textarea
                  placeholder="Digite uma mensagem..."
                  className="min-h-9 max-h-32 resize-none"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleEnviar();
                    }
                  }}
                />
                <Button size="icon" className="shrink-0" disabled={enviarMutation.isPending || !texto.trim()} onClick={handleEnviar}>
                  {enviarMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
