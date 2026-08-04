import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useUnidade } from "@/contexts/UnidadeContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { ArrowLeft, Phone, Mail, MessageCircle, Calendar, Star, Tag, Save, History, FileText, User } from "lucide-react";
import { useRoute, useLocation } from "wouter";

export default function ClienteDetalhe() {
  const [routeMatch] = useRoute("/clientes/:id");
  const [, navigate] = useLocation();
  const clienteId = routeMatch && typeof routeMatch === "object" && "id" in routeMatch ? parseInt((routeMatch as any).id) : null;
  const { unidadeSelecionada } = useUnidade();
  const [nome, setNome] = useState("");
  const [celular, setCelular] = useState("");
  const [email, setEmail] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [novoAtendimento, setNovoAtendimento] = useState("");
  const [tipoAtendimento, setTipoAtendimento] = useState("contato_inicial");
  const [tipoContato, setTipoContato] = useState("whatsapp");

  // Buscar cliente local
  const { data: clienteLocal } = trpc.clientesLocais.get.useQuery(
    { id: clienteId ?? 0 },
    { enabled: !!clienteId }
  );

  // Buscar dados do Belle se a unidade tem token
  const { data: clienteBelle, isLoading: loadingBelle } = trpc.clientes.buscar.useQuery(
    {
      unidadeId: unidadeSelecionada?.id ?? 0,
      cpf: clienteLocal?.cpfCnpj || "",
    },
    {
      enabled: !!unidadeSelecionada?.belleToken && !!clienteLocal?.cpfCnpj,
      retry: false,
    }
  );

  const { data: planosBelle } = trpc.clientes.planos.useQuery(
    {
      unidadeId: unidadeSelecionada?.id ?? 0,
      codCliente: clienteBelle?.codigo ?? 0,
    },
    {
      enabled: !!clienteBelle?.codigo,
      retry: false,
    }
  );

  const { data: historicoBelle } = trpc.clientes.historico.useQuery(
    {
      unidadeId: unidadeSelecionada?.id ?? 0,
      codCliente: clienteBelle?.codigo ?? 0,
    },
    {
      enabled: !!clienteBelle?.codigo,
      retry: false,
    }
  );

  const { data: atendimentos } = trpc.atendimentos.listByCliente.useQuery(
    { clienteId: clienteId ?? 0 },
    { enabled: !!clienteId }
  );

  const updateCliente = trpc.clientesLocais.update.useMutation({
    onSuccess: () => toast.success("Cliente atualizado"),
    onError: (err) => toast.error(err.message),
  });

  const createAtendimento = trpc.atendimentos.create.useMutation({
    onSuccess: () => {
      toast.success("Atendimento registrado");
      setNovoAtendimento("");
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (clienteLocal) {
      setNome(clienteLocal.nome || "");
      setCelular(clienteLocal.celular || "");
      setEmail(clienteLocal.email || "");
      setObservacoes(clienteLocal.observacoesGerais || "");
    }
  }, [clienteLocal]);

  const handleSave = () => {
    if (!clienteId) return;
    updateCliente.mutate({
      id: clienteId,
      nome,
      celular,
      email,
      observacoesGerais: observacoes,
    });
  };

  const handleRegistrarAtendimento = () => {
    if (!clienteId || !novoAtendimento.trim()) return;
    createAtendimento.mutate({
      clienteId,
      unidadeId: unidadeSelecionada?.id,
      tipoAtendimento: tipoAtendimento as any,
      tipoContato: tipoContato as any,
      observacoes: novoAtendimento,
    });
  };

  const fmtCurrency = (v: any) => {
    const n = Number(v);
    return isNaN(n) ? "R$ 0,00" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const cliente = clienteBelle || clienteLocal;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/clientes")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3 flex-1">
          <Avatar className="h-12 w-12">
            <AvatarFallback className="bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] text-lg">
              {(cliente?.nome || "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-xl font-serif font-light">{cliente?.nome || "Carregando..."}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {clienteBelle?.temperatura && (
                <Badge variant="secondary" className="text-xs">
                  {clienteBelle.temperatura}
                </Badge>
              )}
              {(clienteBelle?.rating ?? 0) > 0 && (
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={cn("h-3 w-3",                     i < ((clienteBelle as any)?.rating ?? 0) ? "text-amber-500 fill-amber-500" : "text-muted-foreground/30")}
                    />
                  ))}
                </div>
              )}
              {clienteLocal?.tagClienteVip && <Badge className="bg-amber-500/20 text-amber-700 text-xs">VIP</Badge>}
              {clienteLocal?.tagPremium && <Badge className="bg-purple-500/20 text-purple-700 text-xs">Premium</Badge>}
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="perfil">
        <TabsList>
          <TabsTrigger value="perfil"><User className="h-4 w-4 mr-2" />Perfil</TabsTrigger>
          <TabsTrigger value="planos"><Tag className="h-4 w-4 mr-2" />Planos & Sessões</TabsTrigger>
          <TabsTrigger value="historico"><History className="h-4 w-4 mr-2" />Histórico</TabsTrigger>
          <TabsTrigger value="atendimentos"><FileText className="h-4 w-4 mr-2" />Atendimentos</TabsTrigger>
        </TabsList>

        {/* Perfil */}
        <TabsContent value="perfil" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base font-serif">Dados do Cliente</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Nome</Label>
                  <Input value={nome} onChange={(e) => setNome(e.target.value)} />
                </div>
                <div>
                  <Label>CPF/CNPJ</Label>
                  <Input value={clienteLocal?.cpfCnpj || ""} disabled className="bg-muted/50" />
                </div>
                <div>
                  <Label>Celular</Label>
                  <Input value={celular} onChange={(e) => setCelular(e.target.value)} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label>Observações Gerais</Label>
                  <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} />
                </div>
                <Button onClick={handleSave} disabled={updateCliente.isPending}>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Alterações
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base font-serif">Dados do Belle Software</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {loadingBelle ? (
                  <p className="text-sm text-muted-foreground">Carregando dados do Belle...</p>
                ) : clienteBelle ? (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Código Belle:</span>
                      <span className="font-medium">{clienteBelle.codigo}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Rating:</span>
                      <span className="font-medium">{clienteBelle.rating} estrelas</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Temperatura:</span>
                      <Badge variant="secondary">{clienteBelle.temperatura || "N/A"}</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Última presença:</span>
                      <span className="font-medium">{(clienteBelle as any).dtUltimaPresenca || "N/A"}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Última compra:</span>
                      <span className="font-medium">{(clienteBelle as any).dtUltimaCompra || "N/A"}</span>
                    </div>
                    {clienteBelle.tags && clienteBelle.tags.length > 0 && (
                      <div className="pt-2">
                        <Label>Tags</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {clienteBelle.tags.map((t: any, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs">{t.nome}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {unidadeSelecionada?.belleToken
                      ? "Cliente não encontrado no Belle ou sem CPF cadastrado"
                      : "Token Belle não configurado para esta unidade"}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Planos & Sessões */}
        <TabsContent value="planos">
          <Card>
            <CardHeader><CardTitle className="text-base font-serif">Planos Ativos e Saldo de Sessões</CardTitle></CardHeader>
            <CardContent>
              {!unidadeSelecionada?.belleToken ? (
                <p className="text-sm text-muted-foreground">Token Belle não configurado</p>
              ) : !planosBelle || planosBelle.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum plano ativo encontrado</p>
              ) : (
                <div className="space-y-3">
                  {planosBelle.map((plano: any, i: number) => (
                    <div key={i} className="border border-border/40 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{plano.nome}</h4>
                        <Badge className="bg-green-500/20 text-green-700">Ativo</Badge>
                      </div>
                      {plano.servicos && plano.servicos.length > 0 && (
                        <div className="space-y-1">
                          {plano.servicos.map((s: any, j: number) => (
                            <div key={j} className="flex justify-between text-sm border-b border-border/20 py-1">
                              <span>{s.nome}</span>
                              <span className="text-muted-foreground">
                                Saldo: <strong className="text-foreground">{s.saldoRestante}</strong> / {s.saldoTotal}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Histórico de Compras */}
        <TabsContent value="historico">
          <Card>
            <CardHeader><CardTitle className="text-base font-serif">Histórico de Compras (Belle)</CardTitle></CardHeader>
            <CardContent>
              {!historicoBelle || historicoBelle.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma compra encontrada</p>
              ) : (
                <div className="space-y-2">
                  {historicoBelle.map((v: any, i: number) => (
                    <div key={i} className="flex justify-between items-center border-b border-border/20 py-2 text-sm">
                      <div>
                        <span className="font-medium">{v.data || v.dataVenda || "Data não disponível"}</span>
                        <span className="text-muted-foreground ml-2">{v.servico || v.produto || "Serviço"}</span>
                      </div>
                      <span className="font-medium">{fmtCurrency(v.valor || v.valorTotal)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Atendimentos */}
        <TabsContent value="atendimentos" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base font-serif">Registrar Novo Atendimento</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo de Atendimento</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={tipoAtendimento}
                    onChange={(e) => setTipoAtendimento(e.target.value)}
                  >
                    <option value="contato_inicial">Contato Inicial</option>
                    <option value="follow_up">Follow-up</option>
                    <option value="negociacao">Negociação</option>
                    <option value="venda_concretizada">Venda Concretizada</option>
                    <option value="pos_venda">Pós-venda</option>
                    <option value="reativacao">Reativação</option>
                    <option value="oferta_indireta">Oferta Indireta</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
                <div>
                  <Label>Canal de Contato</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={tipoContato}
                    onChange={(e) => setTipoContato(e.target.value)}
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="ligacao">Ligação</option>
                    <option value="email">Email</option>
                    <option value="presencial">Presencial</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
              </div>
              <div>
                <Label>Observações do Atendimento</Label>
                <Textarea
                  value={novoAtendimento}
                  onChange={(e) => setNovoAtendimento(e.target.value)}
                  rows={3}
                  placeholder="Descreva o atendimento..."
                />
              </div>
              <Button onClick={handleRegistrarAtendimento} disabled={!novoAtendimento.trim() || createAtendimento.isPending}>
                Registrar Atendimento
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base font-serif">Histórico de Atendimentos</CardTitle></CardHeader>
            <CardContent>
              {!atendimentos || atendimentos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum atendimento registrado</p>
              ) : (
                <div className="space-y-2">
                  {atendimentos.map((att: any) => (
                    <div key={att.id} className="border-b border-border/20 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant="outline" className="text-xs">{att.tipoAtendimento}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(att.dataAtendimento).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-sm">{att.observacoes}</p>
                      {att.resultado && (
                        <Badge variant="secondary" className="text-xs mt-1">{att.resultado}</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

import { cn } from "@/lib/utils";
