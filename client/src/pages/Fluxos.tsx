import { useState } from "react";
import { Link } from "wouter";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Workflow, Plus, X, Save, ChevronRight, Clock, Loader2 } from "lucide-react";

export default function Fluxos() {
  const { unidadeSelecionada } = useUnidade();
  const utils = trpc.useUtils();
  const fluxosQuery = trpc.fluxos.list.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0 },
    { enabled: !!unidadeSelecionada }
  );

  const [showNew, setShowNew] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");

  const createMut = trpc.fluxos.create.useMutation({
    onSuccess: () => {
      utils.fluxos.list.invalidate();
      toast.success("Fluxo criado — adicione os passos");
      setShowNew(false);
      setNovoNome("");
      setNovaDescricao("");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.fluxos.update.useMutation({
    onSuccess: () => utils.fluxos.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const registrarHeartbeatMut = trpc.fluxos.registrarHeartbeat.useMutation({
    onSuccess: () => toast.success("Retomada automática registrada — o cron passa a rodar a cada 1min"),
    onError: (e) => toast.error(e.message),
  });

  const registrarHeartbeatGatilhosMut = trpc.fluxos.registrarHeartbeatGatilhosAgendados.useMutation({
    onSuccess: () => toast.success('Disparo agendado registrado — a varredura de "dias sem contato" roda todo dia às 6h'),
    onError: (e) => toast.error(e.message),
  });

  const salvarNovo = () => {
    if (!unidadeSelecionada) return;
    if (!novoNome.trim()) {
      toast.error("Dê um nome ao fluxo");
      return;
    }
    createMut.mutate({ unidadeId: unidadeSelecionada.id, nome: novoNome.trim(), descricao: novaDescricao.trim() || undefined });
  };

  const fluxos = fluxosQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Workflow className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Fluxos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sequências automáticas de mensagem, mídia, menu e mais no WhatsApp.
            </p>
          </div>
        </div>
        <UnidadeSelector />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => registrarHeartbeatMut.mutate()}
          disabled={registrarHeartbeatMut.isPending}
          title="Registra o cron que retoma fluxos parados no nó 'aguardar' e trata timeout de menu — só precisa clicar uma vez"
        >
          {registrarHeartbeatMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Clock className="h-3.5 w-3.5 mr-1.5" />}
          Ativar retomada automática
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => registrarHeartbeatGatilhosMut.mutate()}
          disabled={registrarHeartbeatGatilhosMut.isPending}
          title='Registra o cron diário do gatilho "dias sem contato" — só precisa clicar uma vez'
        >
          {registrarHeartbeatGatilhosMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Clock className="h-3.5 w-3.5 mr-1.5" />}
          Ativar disparo agendado
        </Button>
        <Button size="sm" onClick={() => setShowNew(true)} disabled={showNew || !unidadeSelecionada} className="ml-auto">
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo fluxo
        </Button>
      </div>

      {showNew && (
        <Card className="border-primary/30 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-primary">Novo fluxo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nome *</label>
              <Input
                placeholder="Ex: Boas-vindas cliente novo"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Descrição</label>
              <Input
                placeholder="Opcional"
                value={novaDescricao}
                onChange={(e) => setNovaDescricao(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowNew(false)}>
                <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar
              </Button>
              <Button size="sm" onClick={salvarNovo} disabled={createMut.isPending}>
                <Save className="h-3.5 w-3.5 mr-1.5" /> Salvar e continuar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {fluxosQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : fluxos.length === 0 && !showNew ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 text-center py-6">
              <Workflow className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {unidadeSelecionada ? 'Nenhum fluxo criado ainda. Clique em "Novo fluxo" pra começar.' : "Selecione uma unidade."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {fluxos.map((f) => (
            <Card key={f.id} className={`border-border/50 shadow-sm transition-opacity ${!f.ativo ? "opacity-60" : ""}`}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <Link href={`/fluxos/${f.id}`} className="flex-1 min-w-0 group">
                  <div className="flex items-center gap-2">
                    <span className="font-medium group-hover:text-primary transition-colors truncate">{f.nome}</span>
                    <Badge variant={f.ativo ? "default" : "secondary"} className="text-xs shrink-0">
                      {f.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  {f.descricao && <p className="text-xs text-muted-foreground truncate mt-0.5">{f.descricao}</p>}
                </Link>
                <div className="flex items-center gap-3 shrink-0">
                  <Switch
                    checked={f.ativo}
                    onCheckedChange={(v) => updateMut.mutate({ id: f.id, ativo: v })}
                  />
                  <Link href={`/fluxos/${f.id}`}>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
