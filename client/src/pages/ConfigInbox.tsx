import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, QrCode, RefreshCw, CheckCircle2, XCircle, AlertCircle, Tag, Plus, Pencil, Check, X, Trash2, Hash } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

/**
 * Gerenciamento do catálogo de etiquetas (2026-09-04) — criar, editar e
 * excluir fica restrito a esta aba (admin/gerência); Clientes.tsx e
 * Mensagens.tsx só atribuem etiqueta já existente daqui.
 */
function EtiquetasManager() {
  const utils = trpc.useUtils();
  const listQuery = trpc.etiquetas.list.useQuery();
  const [novoNome, setNovoNome] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nomeEditado, setNomeEditado] = useState("");

  const invalidar = () => utils.etiquetas.list.invalidate();
  const criarMutation = trpc.etiquetas.criar.useMutation({
    onSuccess: () => { invalidar(); setNovoNome(""); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarMutation = trpc.etiquetas.atualizar.useMutation({
    onSuccess: () => { invalidar(); setEditandoId(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluirMutation = trpc.etiquetas.excluir.useMutation({
    onSuccess: invalidar,
    onError: (e) => toast.error(e.message),
  });

  function iniciarEdicao(id: number, nomeAtual: string) {
    setEditandoId(id);
    setNomeEditado(nomeAtual);
  }

  function salvarEdicao(id: number) {
    if (!nomeEditado.trim()) return;
    atualizarMutation.mutate({ id, nome: nomeEditado.trim() });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Tag className="h-4 w-4" /> Etiquetas de cliente
        </CardTitle>
        <CardDescription>
          Catálogo usado no Inbox, em Clientes e no construtor de segmentação de Disparos. Excluir remove a etiqueta de todos os clientes que a têm.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Nova etiqueta"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && novoNome.trim()) criarMutation.mutate({ nome: novoNome.trim() }); }}
          />
          <Button
            disabled={!novoNome.trim() || criarMutation.isPending}
            onClick={() => criarMutation.mutate({ nome: novoNome.trim() })}
          >
            {criarMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Criar
          </Button>
        </div>

        <div className="rounded-md border divide-y">
          {listQuery.isLoading ? (
            <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (listQuery.data ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma etiqueta cadastrada ainda.</p>
          ) : (
            (listQuery.data ?? []).map((etiqueta) => (
              <div key={etiqueta.id} className="flex items-center justify-between gap-2 p-2.5">
                {editandoId === etiqueta.id ? (
                  <Input
                    className="h-8 text-sm flex-1"
                    value={nomeEditado}
                    onChange={(e) => setNomeEditado(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") salvarEdicao(etiqueta.id);
                      if (e.key === "Escape") setEditandoId(null);
                    }}
                    autoFocus
                  />
                ) : (
                  <span className="text-sm">{etiqueta.nome}</span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  {editandoId === etiqueta.id ? (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!nomeEditado.trim() || atualizarMutation.isPending} onClick={() => salvarEdicao(etiqueta.id)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditandoId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => iniciarEdicao(etiqueta.id, etiqueta.nome)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 hover:text-destructive"
                        disabled={excluirMutation.isPending}
                        onClick={() => {
                          if (confirm(`Excluir a etiqueta "${etiqueta.nome}"? Ela será removida de todos os clientes que a têm.`)) {
                            excluirMutation.mutate({ id: etiqueta.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Gerenciamento de campos personalizados numéricos (2026-09-04) — ex.:
 * "contador de resposta a disparo". O valor de cada cliente é escrito
 * sobretudo pelo motor de Fluxo; aqui só se define/renomeia/exclui o campo
 * em si (o catálogo), igual à aba Etiquetas.
 */
function CamposPersonalizadosManager() {
  const utils = trpc.useUtils();
  const listQuery = trpc.camposPersonalizados.list.useQuery();
  const [novoNome, setNovoNome] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nomeEditado, setNomeEditado] = useState("");

  const invalidar = () => utils.camposPersonalizados.list.invalidate();
  const criarMutation = trpc.camposPersonalizados.criar.useMutation({
    onSuccess: () => { invalidar(); setNovoNome(""); },
    onError: (e) => toast.error(e.message),
  });
  const atualizarMutation = trpc.camposPersonalizados.atualizar.useMutation({
    onSuccess: () => { invalidar(); setEditandoId(null); },
    onError: (e) => toast.error(e.message),
  });
  const excluirMutation = trpc.camposPersonalizados.excluir.useMutation({
    onSuccess: invalidar,
    onError: (e) => toast.error(e.message),
  });

  function salvarEdicao(id: number) {
    if (!nomeEditado.trim()) return;
    atualizarMutation.mutate({ id, nome: nomeEditado.trim() });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Hash className="h-4 w-4" /> Campos personalizados
        </CardTitle>
        <CardDescription>
          Valor numérico por cliente (ex.: contador de resposta a disparo). Também vira filtro no construtor de segmentação de Disparos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Novo campo (ex.: Respostas a disparo)"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && novoNome.trim()) criarMutation.mutate({ nome: novoNome.trim() }); }}
          />
          <Button
            disabled={!novoNome.trim() || criarMutation.isPending}
            onClick={() => criarMutation.mutate({ nome: novoNome.trim() })}
          >
            {criarMutation.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Criar
          </Button>
        </div>

        <div className="rounded-md border divide-y">
          {listQuery.isLoading ? (
            <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (listQuery.data ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nenhum campo cadastrado ainda.</p>
          ) : (
            (listQuery.data ?? []).map((campo) => (
              <div key={campo.id} className="flex items-center justify-between gap-2 p-2.5">
                {editandoId === campo.id ? (
                  <Input
                    className="h-8 text-sm flex-1"
                    value={nomeEditado}
                    onChange={(e) => setNomeEditado(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") salvarEdicao(campo.id);
                      if (e.key === "Escape") setEditandoId(null);
                    }}
                    autoFocus
                  />
                ) : (
                  <span className="text-sm">{campo.nome}</span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  {editandoId === campo.id ? (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7" disabled={!nomeEditado.trim() || atualizarMutation.isPending} onClick={() => salvarEdicao(campo.id)}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditandoId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditandoId(campo.id); setNomeEditado(campo.nome); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 hover:text-destructive"
                        disabled={excluirMutation.isPending}
                        onClick={() => {
                          if (confirm(`Excluir o campo "${campo.nome}"? O valor salvo pra cada cliente também será apagado.`)) {
                            excluirMutation.mutate({ id: campo.id });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ConfigInbox() {
  const { unidadeSelecionada } = useUnidade();
  const unidadeId = unidadeSelecionada?.id;
  const [refreshing, setRefreshing] = useState(false);

  const qrQuery = trpc.inbox.conversas.qrCode.useQuery(
    { unidadeId: unidadeId! },
    { enabled: !!unidadeId, refetchInterval: 30000 }
  );

  const statusQuery = trpc.inbox.conversas.status.useQuery(
    { unidadeId: unidadeId! },
    { enabled: !!unidadeId, refetchInterval: 5000 }
  );

  const refreshQr = useCallback(async () => {
    setRefreshing(true);
    await qrQuery.refetch();
    await statusQuery.refetch();
    setRefreshing(false);
    toast.success("QR code atualizado");
  }, [qrQuery, statusQuery]);

  const isConnected = statusQuery.data?.connected === true;
  const isConfigured = !!unidadeSelecionada?.zapiInstanceId;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuração do Inbox</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Conecte o WhatsApp da unidade {unidadeSelecionada?.nome || ""} e gerencie o catálogo de etiquetas.
        </p>
      </div>

      <Tabs defaultValue="conexao">
        <TabsList>
          <TabsTrigger value="conexao">Conexão</TabsTrigger>
          <TabsTrigger value="etiquetas">Etiquetas</TabsTrigger>
          <TabsTrigger value="campos">Campos personalizados</TabsTrigger>
        </TabsList>

        <TabsContent value="conexao" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {isConnected ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : isConfigured ? (
              <AlertCircle className="h-5 w-5 text-amber-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            Status da Conexão
          </CardTitle>
          <CardDescription>
            {isConnected
              ? `WhatsApp conectado${statusQuery.data?.phone ? ` — ${statusQuery.data.phone}` : ""}`
              : isConfigured
              ? "Aguardando conexão — escaneie o QR code"
              : "Z-API não configurado — insira as credenciais em Configurações"}
          </CardDescription>
        </CardHeader>
      </Card>

      {isConfigured && !isConnected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-5 w-5" />
              QR Code — Escaneie com o WhatsApp
            </CardTitle>
            <CardDescription>
              Abra o WhatsApp no celular → Configurações → Aparelhos conectados → Conectar um aparelho
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 py-6">
            {qrQuery.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Carregando QR code...
              </div>
            ) : qrQuery.data?.error ? (
              <div className="text-center space-y-2">
                <XCircle className="h-10 w-10 text-red-500 mx-auto" />
                <p className="text-sm text-red-600">{qrQuery.data.error}</p>
                <p className="text-xs text-muted-foreground">
                  Verifique se as credenciais do Z-API estão corretas em Configurações.
                </p>
              </div>
            ) : qrQuery.data?.qrcode ? (
              <div className="flex flex-col items-center gap-4">
                <img
                  src={qrQuery.data.qrcode}
                  alt="QR Code WhatsApp"
                  className="w-64 h-64 rounded-lg border"
                />
                <p className="text-xs text-muted-500 text-center max-w-xs">
                  O QR code expira em ~60 segundos. Se expirar, clique em atualizar.
                </p>
              </div>
            ) : (
              <div className="text-center space-y-2">
                <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
                <p className="text-sm text-muted-foreground">
                  QR code não disponível no momento.
                </p>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={refreshQr}
              disabled={refreshing}
              className="mt-2"
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Atualizar QR Code
            </Button>
          </CardContent>
        </Card>
      )}

      {isConnected && (
        <Card>
          <CardContent className="flex items-center gap-4 py-8">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
            <div>
              <p className="font-medium text-green-700">WhatsApp conectado!</p>
              <p className="text-sm text-muted-foreground">
                {statusQuery.data?.phone
                  ? `Número: ${statusQuery.data.phone}`
                  : "A instância está ativa e pronta para receber mensagens."}
              </p>
              <p className="text-xs text-muted-500 mt-1">
                As conversas aparecerão automaticamente na página Mensagens.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isConfigured && (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-start gap-4">
              <AlertCircle className="h-10 w-10 text-amber-500 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">Z-API não configurado</p>
                <p className="text-sm text-muted-foreground">
                  Para conectar o WhatsApp, primeiro configure as credenciais do Z-API
                  (Instance ID, Token e Client Token) na página de Configurações.
                </p>
                <p className="text-xs text-muted-500 mt-2">
                  Obtenha as credenciais em <a href="https://z-api.io" target="_blank" rel="noopener noreferrer" className="underline">z-api.io</a>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="etiquetas" className="space-y-6">
          <EtiquetasManager />
        </TabsContent>

        <TabsContent value="campos" className="space-y-6">
          <CamposPersonalizadosManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
