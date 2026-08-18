import { useState, useRef, useEffect } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Send, Search, Loader2 } from "lucide-react";
import { Streamdown } from "streamdown";

interface Mensagem {
  role: "user" | "assistant";
  content: string;
}

export default function Copilot() {
  const { unidadeSelecionada } = useUnidade();
  const [searchCpf, setSearchCpf] = useState("");
  const [cliente, setCliente] = useState<any>(null);
  const [messages, setMessages] = useState<Mensagem[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // API de clientes do Belle está desativada (acesso negado pelo
  // franqueador) — busca na base local, importada da planilha.
  const { refetch } = trpc.clientes.buscarLocal.useQuery(
    { cpf: searchCpf.replace(/\D/g, "") },
    { enabled: false }
  );

  const chatMutation = trpc.copilot.chat.useMutation({
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    },
    onError: (error) => {
      setMessages((prev) => [...prev, { role: "assistant", content: `Erro: ${error.message}` }]);
    },
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const buscarCliente = async () => {
    if (!searchCpf || searchCpf.length < 3) return;
    setLoading(true);
    try {
      const result = await refetch();
      if (result.data) {
        setCliente(result.data);
        setMessages([{
          role: "assistant",
          content: `Cliente encontrado: **${result.data.nome}**.\n\nCelular: ${result.data.celular || "—"}\nServiços já realizados: ${result.data.qtdServicosFinalizados ?? 0}\n\nComo posso ajudar com este atendimento?`,
        }]);
      } else {
        setMessages([{ role: "assistant", content: "Cliente não encontrado na base local." }]);
      }
    } catch {
      setMessages([{ role: "assistant", content: "Erro ao buscar cliente." }]);
    }
    setLoading(false);
  };

  const handleSend = () => {
    if (!input.trim() || !unidadeSelecionada) return;

    const novaMensagem: Mensagem = { role: "user", content: input };
    setMessages((prev) => [...prev, novaMensagem]);
    setInput("");

    chatMutation.mutate({
      unidadeId: unidadeSelecionada.id,
      mensagem: input,
      clienteCpf: cliente?.cpf || searchCpf.replace(/\D/g, "") || undefined,
      clienteNome: cliente?.nome || undefined,
      historico: messages.map(m => ({ role: m.role, content: m.content })),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Copilot de Atendimento
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Assistente com IA que consulta dados do cliente em tempo real via Belle
          </p>
        </div>
        <UnidadeSelector />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Cliente search */}
        <Card className="border-border/50 shadow-sm lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Buscar Cliente
            </CardTitle>
            <CardDescription>Digite o CPF para consultar no Belle</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="000.000.000-00"
                value={searchCpf}
                onChange={(e) => setSearchCpf(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buscarCliente()}
              />
              <Button size="icon" onClick={buscarCliente} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {cliente && (
              <div className="rounded-lg border border-border/50 p-3 space-y-1 text-sm">
                <div className="font-medium">{cliente.nome}</div>
                <div className="text-muted-foreground">{cliente.celular}</div>
                <div className="text-muted-foreground">{cliente.email}</div>
                <div className="flex gap-2 pt-1">
                  {cliente.temperatura && (
                    <span className="text-xs rounded-full px-2 py-0.5 bg-accent">
                      {cliente.temperatura}
                    </span>
                  )}
                  {cliente.rating > 0 && (
                    <span className="text-xs text-amber-500">{"★".repeat(cliente.rating)}</span>
                  )}
                </div>
              </div>
            )}
            <div className="pt-2 border-t border-border/30">
              <p className="text-xs text-muted-foreground">
                O Copilot usa os dados do cliente (planos, tags, rating, temperatura) como contexto para sugerir respostas e ações de atendimento.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Chat */}
        <Card className="border-border/50 shadow-sm lg:col-span-2 flex flex-col" style={{ minHeight: "500px" }}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              <Sparkles className="h-4 w-4 text-amber-600" /> Conversa com IA
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto mb-4" style={{ maxHeight: "400px" }}>
              {messages.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-12">
                  <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                  Busque um cliente para iniciar o atendimento assistido.
                </div>
              ) : (
                messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`rounded-lg px-3 py-2 max-w-[80%] text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <Streamdown>{msg.content}</Streamdown>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))
              )}
              {chatMutation.isPending && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Digite sua mensagem..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                disabled={chatMutation.isPending}
              />
              <Button size="icon" onClick={handleSend} disabled={chatMutation.isPending || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
