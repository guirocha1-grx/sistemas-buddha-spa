import { useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Send, Search, Loader2 } from "lucide-react";

export default function Copilot() {
  const { unidadeSelecionada } = useUnidade();
  const [searchCpf, setSearchCpf] = useState("");
  const [cliente, setCliente] = useState<any>(null);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const { refetch } = trpc.clientes.buscar.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0, cpf: searchCpf.replace(/\D/g, "") },
    { enabled: false }
  );

  const buscarCliente = async () => {
    if (!searchCpf || searchCpf.length < 3) return;
    setLoading(true);
    try {
      const result = await refetch();
      if (result.data) {
        setCliente(result.data);
        setMessages([{
          role: "assistant",
          content: `Cliente encontrado: ${result.data.nome}. Temperatura: ${result.data.temperatura || "Não definida"}. Rating: ${result.data.rating || 0} estrelas. Como posso ajudar com este atendimento?`,
        }]);
      } else {
        setMessages([{ role: "assistant", content: "Cliente não encontrado no Belle Software." }]);
      }
    } catch {
      setMessages([{ role: "assistant", content: "Erro ao buscar cliente. Verifique o token do Belle." }]);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Copilot de Atendimento
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Assistente com IA que consulta dados do cliente em tempo real
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
          </CardContent>
        </Card>

        {/* Chat */}
        <Card className="border-border/50 shadow-sm lg:col-span-2 flex flex-col" style={{ minHeight: "500px" }}>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              <Sparkles className="h-4 w-4" /> Conversa
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto mb-4" style={{ maxHeight: "400px" }}>
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
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Digite sua mensagem..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && input.trim()) {
                    setMessages(prev => [...prev, { role: "user", content: input }]);
                    setInput("");
                  }
                }}
              />
              <Button size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
