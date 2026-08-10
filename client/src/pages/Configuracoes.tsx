import { useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Save, Loader2, CheckCircle, AlertCircle, MessageCircle, Megaphone, Landmark, CreditCard } from "lucide-react";
import { AtendentesSection } from "@/components/AtendentesSection";

interface InterForm {
  interClientId?: string;
  interClientSecret?: string;
  interCertificado?: string;
  interChavePrivada?: string;
  interContaCorrente?: string;
}

interface MpForm {
  mpAccessToken?: string;
}

interface SicrediForm {
  sicrediClientId?: string;
  sicrediClientSecret?: string;
  sicrediCertificado?: string;
  sicrediChavePrivada?: string;
  sicrediCooperativa?: string;
  sicrediAgencia?: string;
  sicrediConta?: string;
}

interface ZapiForm {
  zapiInstanceId?: string;
  zapiToken?: string;
  zapiClientToken?: string;
}

const BUDDHA_MKT_CHAVES = ["phone_number_id", "token", "waba_id", "verify_token"] as const;

export default function Configuracoes() {
  const { unidades } = useUnidade();
  const [tokens, setTokens] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<number | null>(null);
  const [zapiForms, setZapiForms] = useState<Record<number, ZapiForm>>({});
  const [zapiSaved, setZapiSaved] = useState<number | null>(null);
  const [mktForm, setMktForm] = useState<Record<string, string>>({});
  const [mktSaved, setMktSaved] = useState(false);
  const [interForms, setInterForms] = useState<Record<number, InterForm>>({});
  const [interSaved, setInterSaved] = useState<number | null>(null);
  const [mpForms, setMpForms] = useState<Record<number, MpForm>>({});
  const [mpSaved, setMpSaved] = useState<number | null>(null);
  const [sicrediForms, setSicrediForms] = useState<Record<number, SicrediForm>>({});
  const [sicrediSaved, setSicrediSaved] = useState<number | null>(null);

  const updateUnidade = trpc.unidades.update.useMutation({
    onSuccess: (_data, vars) => {
      if (vars.belleToken !== undefined) {
        setSaved(vars.id);
        setTimeout(() => setSaved(null), 3000);
      }
      if (vars.zapiInstanceId !== undefined || vars.zapiToken !== undefined || vars.zapiClientToken !== undefined) {
        setZapiSaved(vars.id);
        setTimeout(() => setZapiSaved(null), 3000);
      }
      if (vars.interClientId !== undefined || vars.interClientSecret !== undefined || vars.interCertificado !== undefined || vars.interChavePrivada !== undefined || vars.interContaCorrente !== undefined) {
        setInterSaved(vars.id);
        setTimeout(() => setInterSaved(null), 3000);
      }
      if (vars.mpAccessToken !== undefined) {
        setMpSaved(vars.id);
        setTimeout(() => setMpSaved(null), 3000);
      }
      if (vars.sicrediClientId !== undefined || vars.sicrediClientSecret !== undefined || vars.sicrediCertificado !== undefined || vars.sicrediChavePrivada !== undefined || vars.sicrediCooperativa !== undefined || vars.sicrediAgencia !== undefined || vars.sicrediConta !== undefined) {
        setSicrediSaved(vars.id);
        setTimeout(() => setSicrediSaved(null), 3000);
      }
    },
  });

  const utils = trpc.useUtils();
  const mktConfigQueries = trpc.useQueries((t) =>
    BUDDHA_MKT_CHAVES.map((sufixo) => t.configuracoes.get({ chave: `buddha_mkt_${sufixo}` })),
  );

  const setConfig = trpc.configuracoes.set.useMutation({
    onSuccess: () => {
      setMktSaved(true);
      utils.configuracoes.get.invalidate();
      setTimeout(() => setMktSaved(false), 3000);
    },
  });

  function salvarBuddhaMkt() {
    BUDDHA_MKT_CHAVES.forEach((sufixo) => {
      const valor = mktForm[sufixo];
      if (valor) setConfig.mutate({ chave: `buddha_mkt_${sufixo}`, valor });
    });
  }

  const mktConfigurado = BUDDHA_MKT_CHAVES.every((sufixo, i) => mktConfigQueries[i]?.data);

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

              <div className="border-t pt-3 mt-1 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <MessageCircle className="h-3.5 w-3.5" /> Z-API desta unidade
                  </Label>
                  {unidade.zapiInstanceId && unidade.zapiToken && unidade.zapiClientToken ? (
                    <Badge className="bg-green-100 text-green-700">Configurado</Badge>
                  ) : (
                    <Badge variant="secondary">Sem token</Badge>
                  )}
                </div>
                <Input
                  placeholder="Instance ID"
                  defaultValue={unidade.zapiInstanceId || ""}
                  onChange={(e) => setZapiForms({ ...zapiForms, [unidade.id]: { ...zapiForms[unidade.id], zapiInstanceId: e.target.value } })}
                />
                <Input
                  type="password"
                  placeholder="Token"
                  defaultValue={unidade.zapiToken || ""}
                  onChange={(e) => setZapiForms({ ...zapiForms, [unidade.id]: { ...zapiForms[unidade.id], zapiToken: e.target.value } })}
                />
                <Input
                  type="password"
                  placeholder="Client-Token (segurança da conta)"
                  defaultValue={unidade.zapiClientToken || ""}
                  onChange={(e) => setZapiForms({ ...zapiForms, [unidade.id]: { ...zapiForms[unidade.id], zapiClientToken: e.target.value } })}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const form = zapiForms[unidade.id];
                    if (form && (form.zapiInstanceId || form.zapiToken || form.zapiClientToken)) {
                      updateUnidade.mutate({ id: unidade.id, ...form });
                    }
                  }}
                  disabled={!zapiForms[unidade.id] || updateUnidade.isPending}
                >
                  {zapiSaved === unidade.id ? (
                    <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {zapiSaved === unidade.id ? "Salvo!" : "Salvar Z-API"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Webhook: <span className="font-mono">/api/webhooks/zapi/{unidade.id}?token=&lt;token acima&gt;</span>
                </p>
              </div>

              {/* Banco Inter */}
              <div className="border-t pt-3 mt-1 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Landmark className="h-3.5 w-3.5" /> Banco Inter — OAuth
                  </Label>
                  {unidade.interClientId && unidade.interClientSecret && unidade.interCertificado && unidade.interChavePrivada ? (
                    <Badge className="bg-green-100 text-green-700">Configurado</Badge>
                  ) : (
                    <Badge variant="secondary">Sem credenciais</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Crie uma aplicação em{" "}
                  <a
                    href="https://developers.inter.co"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    developers.inter.co
                  </a>{" "}
                  com escopo <code>extrato.read</code> e <code>saldo.read</code>, depois insira as credenciais abaixo.
                  O Inter também exige um certificado digital (mTLS) — gere o par certificado/chave no mesmo portal, na aba
                  "Certificados", e cole o conteúdo dos arquivos <code>.crt</code> e <code>.key</code> abaixo.
                </p>
                <Input
                  placeholder="Client ID"
                  defaultValue={unidade.interClientId || ""}
                  onChange={(e) =>
                    setInterForms({ ...interForms, [unidade.id]: { ...interForms[unidade.id], interClientId: e.target.value } })
                  }
                />
                <Input
                  type="password"
                  placeholder="Client Secret"
                  defaultValue={unidade.interClientSecret || ""}
                  onChange={(e) =>
                    setInterForms({ ...interForms, [unidade.id]: { ...interForms[unidade.id], interClientSecret: e.target.value } })
                  }
                />
                <Textarea
                  placeholder="Certificado (.crt) — conteúdo completo em PEM"
                  className="font-mono text-xs"
                  rows={4}
                  defaultValue={unidade.interCertificado || ""}
                  onChange={(e) =>
                    setInterForms({ ...interForms, [unidade.id]: { ...interForms[unidade.id], interCertificado: e.target.value } })
                  }
                />
                <Textarea
                  placeholder="Chave privada (.key) — conteúdo completo em PEM"
                  className="font-mono text-xs"
                  rows={4}
                  defaultValue={unidade.interChavePrivada || ""}
                  onChange={(e) =>
                    setInterForms({ ...interForms, [unidade.id]: { ...interForms[unidade.id], interChavePrivada: e.target.value } })
                  }
                />
                <Input
                  placeholder="Conta Corrente (opcional, sem zeros à esquerda)"
                  defaultValue={unidade.interContaCorrente || ""}
                  onChange={(e) =>
                    setInterForms({ ...interForms, [unidade.id]: { ...interForms[unidade.id], interContaCorrente: e.target.value } })
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const form = interForms[unidade.id];
                    if (
                      form &&
                      (form.interClientId ||
                        form.interClientSecret ||
                        form.interCertificado ||
                        form.interChavePrivada ||
                        form.interContaCorrente)
                    ) {
                      updateUnidade.mutate({ id: unidade.id, ...form });
                    }
                  }}
                  disabled={!interForms[unidade.id] || updateUnidade.isPending}
                >
                  {interSaved === unidade.id ? (
                    <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {interSaved === unidade.id ? "Salvo!" : "Salvar Banco Inter"}
                </Button>
              </div>

              {/* Mercado Pago */}
              <div className="border-t pt-3 mt-1 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <CreditCard className="h-3.5 w-3.5" /> Mercado Pago
                  </Label>
                  {unidade.mpAccessToken ? (
                    <Badge className="bg-green-100 text-green-700">Configurado</Badge>
                  ) : (
                    <Badge variant="secondary">Sem credenciais</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Gere o Access Token em{" "}
                  <a
                    href="https://www.mercadopago.com.br/developers/panel/app"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Suas integrações → Credenciais
                  </a>{" "}
                  (self-service, sem certificado — diferente do Inter).
                </p>
                <Input
                  type="password"
                  placeholder="Access Token"
                  defaultValue={unidade.mpAccessToken || ""}
                  onChange={(e) =>
                    setMpForms({ ...mpForms, [unidade.id]: { mpAccessToken: e.target.value } })
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const form = mpForms[unidade.id];
                    if (form?.mpAccessToken) {
                      updateUnidade.mutate({ id: unidade.id, ...form });
                    }
                  }}
                  disabled={!mpForms[unidade.id]?.mpAccessToken || updateUnidade.isPending}
                >
                  {mpSaved === unidade.id ? (
                    <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {mpSaved === unidade.id ? "Salvo!" : "Salvar Mercado Pago"}
                </Button>
              </div>

              {/* Sicredi */}
              <div className="border-t pt-3 mt-1 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Landmark className="h-3.5 w-3.5" /> Sicredi — OAuth
                  </Label>
                  {unidade.sicrediClientId && unidade.sicrediClientSecret && unidade.sicrediCertificado && unidade.sicrediChavePrivada ? (
                    <Badge className="bg-green-100 text-green-700">Configurado</Badge>
                  ) : (
                    <Badge variant="secondary">Sem credenciais</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Solicite adesão aos produtos "Extrato de Conta Corrente" e "Saldo de Conta Corrente" à sua
                  cooperativa no{" "}
                  <a
                    href="https://developers.sicredi.com.br"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Portal do Desenvolvedor
                  </a>{" "}
                  — igual ao Inter, o Sicredi também exige certificado digital (mTLS) gerado via CSR. Cole as
                  credenciais e o certificado/chave abaixo assim que a adesão sair.
                </p>
                <Input
                  placeholder="Client ID"
                  defaultValue={unidade.sicrediClientId || ""}
                  onChange={(e) =>
                    setSicrediForms({ ...sicrediForms, [unidade.id]: { ...sicrediForms[unidade.id], sicrediClientId: e.target.value } })
                  }
                />
                <Input
                  type="password"
                  placeholder="Client Secret"
                  defaultValue={unidade.sicrediClientSecret || ""}
                  onChange={(e) =>
                    setSicrediForms({ ...sicrediForms, [unidade.id]: { ...sicrediForms[unidade.id], sicrediClientSecret: e.target.value } })
                  }
                />
                <Textarea
                  placeholder="Certificado (.crt) — conteúdo completo em PEM"
                  className="font-mono text-xs"
                  rows={4}
                  defaultValue={unidade.sicrediCertificado || ""}
                  onChange={(e) =>
                    setSicrediForms({ ...sicrediForms, [unidade.id]: { ...sicrediForms[unidade.id], sicrediCertificado: e.target.value } })
                  }
                />
                <Textarea
                  placeholder="Chave privada (.key) — conteúdo completo em PEM"
                  className="font-mono text-xs"
                  rows={4}
                  defaultValue={unidade.sicrediChavePrivada || ""}
                  onChange={(e) =>
                    setSicrediForms({ ...sicrediForms, [unidade.id]: { ...sicrediForms[unidade.id], sicrediChavePrivada: e.target.value } })
                  }
                />
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    placeholder="Cooperativa"
                    defaultValue={unidade.sicrediCooperativa || ""}
                    onChange={(e) =>
                      setSicrediForms({ ...sicrediForms, [unidade.id]: { ...sicrediForms[unidade.id], sicrediCooperativa: e.target.value } })
                    }
                  />
                  <Input
                    placeholder="Agência"
                    defaultValue={unidade.sicrediAgencia || ""}
                    onChange={(e) =>
                      setSicrediForms({ ...sicrediForms, [unidade.id]: { ...sicrediForms[unidade.id], sicrediAgencia: e.target.value } })
                    }
                  />
                  <Input
                    placeholder="Conta"
                    defaultValue={unidade.sicrediConta || ""}
                    onChange={(e) =>
                      setSicrediForms({ ...sicrediForms, [unidade.id]: { ...sicrediForms[unidade.id], sicrediConta: e.target.value } })
                    }
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const form = sicrediForms[unidade.id];
                    if (form && Object.values(form).some((v) => v)) {
                      updateUnidade.mutate({ id: unidade.id, ...form });
                    }
                  }}
                  disabled={!sicrediForms[unidade.id] || updateUnidade.isPending}
                >
                  {sicrediSaved === unidade.id ? (
                    <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {sicrediSaved === unidade.id ? "Salvo!" : "Salvar Sicredi"}
                </Button>
              </div>

              <AtendentesSection unidadeId={unidade.id} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                <Megaphone className="h-4 w-4" /> Buddha Mkt (WhatsApp Cloud API)
              </CardTitle>
              <CardDescription>Conta única, usada para disparo de marketing nas duas unidades</CardDescription>
            </div>
            {mktConfigurado ? (
              <Badge className="bg-green-100 text-green-700">Configurado</Badge>
            ) : (
              <Badge variant="secondary">Não configurado</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Phone Number ID"
            defaultValue={mktConfigQueries[0]?.data || ""}
            onChange={(e) => setMktForm({ ...mktForm, phone_number_id: e.target.value })}
          />
          <Input
            type="password"
            placeholder="Access Token"
            defaultValue={mktConfigQueries[1]?.data || ""}
            onChange={(e) => setMktForm({ ...mktForm, token: e.target.value })}
          />
          <Input
            placeholder="WABA ID"
            defaultValue={mktConfigQueries[2]?.data || ""}
            onChange={(e) => setMktForm({ ...mktForm, waba_id: e.target.value })}
          />
          <Input
            type="password"
            placeholder="Verify Token (webhook)"
            defaultValue={mktConfigQueries[3]?.data || ""}
            onChange={(e) => setMktForm({ ...mktForm, verify_token: e.target.value })}
          />
          <Button size="sm" onClick={salvarBuddhaMkt} disabled={setConfig.isPending}>
            {mktSaved ? <CheckCircle className="h-4 w-4 mr-2 text-green-600" /> : <Save className="h-4 w-4 mr-2" />}
            {mktSaved ? "Salvo!" : "Salvar Buddha Mkt"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Webhook de verificação: <span className="font-mono">/api/webhooks/buddha-mkt</span>
          </p>
        </CardContent>
      </Card>

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
