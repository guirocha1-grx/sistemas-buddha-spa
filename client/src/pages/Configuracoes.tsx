import { useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Settings, Save, Loader2, CheckCircle, AlertCircle } from "lucide-react";

export default function Configuracoes() {
  const { unidades } = useUnidade();
  const [tokens, setTokens] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<number | null>(null);

  const updateUnidade = trpc.unidades.update.useMutation({
    onSuccess: (_data, vars) => {
      setSaved(vars.id);
      setTimeout(() => setSaved(null), 3000);
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Configurações
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie os tokens de integração com o Belle Software para cada unidade
        </p>
      </div>

      <Card className="border-amber-200 bg-amber-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-900">
                Como obter o token de integração
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Solicite ao suporte do Belle Software o token de API para cada unidade.
                O token permite acesso aos endpoints de clientes, agendamentos, serviços e financeiro.
                Rate limit: 40 requisições por minuto.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {unidades.map((unidade) => (
          <Card key={unidade.id} className="border-border/50 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                    {unidade.nome}
                  </CardTitle>
                  <CardDescription>
                    Código Belle: {unidade.codEstab}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: unidade.corTema || "#B8935A" }}
                  />
                  {tokens[unidade.id] || unidade.belleToken ? (
                    <Badge className="bg-green-100 text-green-700">Configurado</Badge>
                  ) : (
                    <Badge variant="secondary">Sem token</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Token de Integração Belle</Label>
                <Input
                  type="password"
                  placeholder="Insira o token da API do Belle..."
                  defaultValue={unidade.belleToken || ""}
                  onChange={(e) => setTokens({ ...tokens, [unidade.id]: e.target.value })}
                />
              </div>
              <Button
                size="sm"
                onClick={() => {
                  if (tokens[unidade.id]) {
                    updateUnidade.mutate({
                      id: unidade.id,
                      belleToken: tokens[unidade.id],
                    });
                  }
                }}
                disabled={!tokens[unidade.id] || updateUnidade.isPending}
              >
                {updateUnidade.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : saved === unidade.id ? (
                  <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {saved === unidade.id ? "Salvo!" : "Salvar Token"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            <Settings className="h-4 w-4" /> Informações Técnicas
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="flex justify-between border-b border-border/30 pb-2">
            <span>API Base URL</span>
            <span className="font-mono text-xs">https://app.bellesoftware.com.br/api</span>
          </div>
          <div className="flex justify-between border-b border-border/30 pb-2">
            <span>Rate Limit</span>
            <span>40 req/min</span>
          </div>
          <div className="flex justify-between border-b border-border/30 pb-2">
            <span>Autenticação</span>
            <span className="font-mono text-xs">Bearer Token</span>
          </div>
          <div className="flex justify-between">
            <span>Endpoint de Leads</span>
            <span className="font-mono text-xs">POST /cliente/gravar-lead</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
