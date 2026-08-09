import { useAuth } from "@/_core/hooks/useAuth";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, QrCode, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";

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
          Conecte o WhatsApp da unidade {unidadeSelecionada?.nome || ""} escaneando o QR code abaixo.
        </p>
      </div>

      {/* Status da conexão */}
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

      {/* QR Code */}
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

      {/* Já conectado */}
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

      {/* Não configurado */}
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
    </div>
  );
}
