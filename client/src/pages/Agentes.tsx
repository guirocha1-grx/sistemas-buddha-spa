import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useUnidade } from "@/contexts/UnidadeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronRight, Clock3, FlaskConical, MessageCircle, ShieldAlert, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

const ESPECIALISTAS = [
  { chave: "bianca", nome: "Bianca" },
  { chave: "fabricia", nome: "Fabricia" },
  { chave: "estela", nome: "Estela" },
  { chave: "carol", nome: "Carol" },
  { chave: "diana", nome: "Diana" },
] as const;

export default function Agentes() {
  const [, setLocation] = useLocation();
  const { unidadeSelecionada } = useUnidade();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [comentarios, setComentarios] = useState<Record<number, string>>({});
  const [motivos, setMotivos] = useState<Record<number, "informacao" | "tom" | "roteamento" | "contexto" | "comercial" | "operacional" | "outro">>({});
  const [inicio, setInicio] = useState(() => new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [fim, setFim] = useState(() => new Date().toISOString().slice(0, 10));
  const isAdmin = user?.role === "admin";
  const filtroMetricas = useMemo(() => ({
    unidadeId: unidadeSelecionada?.id,
    inicio: new Date(`${inicio}T00:00:00`),
    fim: new Date(`${fim}T23:59:59`),
  }), [inicio, fim, unidadeSelecionada?.id]);
  const fila = trpc.agentes.fila.list.useQuery(
    unidadeSelecionada ? { unidadeId: unidadeSelecionada.id } : undefined,
    { refetchInterval: 5000 },
  );
  const metricas = trpc.agentes.metricas.useQuery(filtroMetricas, { enabled: isAdmin });
  const serieQualidade = trpc.agentes.serieQualidade.useQuery(filtroMetricas, { enabled: isAdmin });
  const aprovar = trpc.agentes.fila.aprovarEEnviar.useMutation({
    onSuccess: () => {
      utils.agentes.fila.list.invalidate();
      utils.agentes.metricas.invalidate();
    },
  });
  const reprovar = trpc.agentes.fila.reprovar.useMutation({
    onSuccess: () => {
      utils.agentes.fila.list.invalidate();
      utils.agentes.metricas.invalidate();
    },
  });
  const [simAgente, setSimAgente] = useState<(typeof ESPECIALISTAS)[number]["chave"]>("carol");
  const [simConversaId, setSimConversaId] = useState("");
  const simular = trpc.agentes.simular.useMutation({ onError: (erro) => toast.error(erro.message) });
  const verificarQualidade = trpc.agentes.qualidade.verificarAgora.useMutation({
    onSuccess: (resultado) => toast.success(resultado.alertasEnviados ? "Encontrou algo — alerta enviado no Telegram." : "Nada fora do padrão agora."),
    onError: (erro) => toast.error(erro.message),
  });

  const pendentes = fila.data ?? [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl overflow-hidden border border-[#8d6a2b]/30 bg-gradient-to-br from-[#4d1d26] via-[#622530] to-[#35131a] text-white shadow-lg">
        <div className="p-6 md:p-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[#ebcf88] text-xs font-semibold tracking-[0.18em] uppercase">
              <Sparkles className="w-4 h-4" /> Atendimento com supervisão humana
            </div>
            <h1 className="mt-2 text-3xl md:text-4xl leading-none" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Fila de sugestões dos agentes
            </h1>
            <p className="mt-3 text-sm text-white/75 leading-6">
              Cada resposta é produzida pelo especialista indicado e permanece sob decisão da recepção antes do envio ao cliente.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white/10 border border-white/15 px-4 py-3">
            <Clock3 className="w-5 h-5 text-[#ebcf88]" />
            <div><div className="text-2xl font-semibold leading-none">{pendentes.length}</div><div className="mt-1 text-xs text-white/65">aguardando revisão</div></div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Sugestões pendentes</h2>
              <p className="text-sm text-muted-foreground">Unidade: {unidadeSelecionada?.nome ?? "todas as unidades"}</p>
            </div>
            <Badge variant="outline" className="border-[#8d6a2b]/35 bg-[#fbf7ee] text-[#6d4b14]">Modo copilot</Badge>
          </div>

          {fila.isLoading && <Card><CardContent className="p-8 text-sm text-muted-foreground">Carregando sugestões...</CardContent></Card>}
          {!fila.isLoading && pendentes.length === 0 && (
            <Card className="border-dashed border-[#8d6a2b]/35 bg-[#fbf9f4]">
              <CardContent className="p-9 text-center">
                <div className="mx-auto w-11 h-11 grid place-items-center rounded-full bg-[#f2e7cd] text-[#7a5214]"><Check className="w-5 h-5" /></div>
                <h3 className="mt-4 font-medium">Nenhuma sugestão aguardando decisão</h3>
                <p className="mt-1 text-sm text-muted-foreground">Quando os agentes estiverem configurados, as novas mensagens aparecerão aqui para validação da recepção.</p>
              </CardContent>
            </Card>
          )}

          {pendentes.map((item) => {
            const contexto = item.sugestao.contexto;
            const comentario = comentarios[item.sugestao.id] ?? "";
            const ocupada = aprovar.isPending || reprovar.isPending;
            return (
              <Card key={item.sugestao.id} className="overflow-hidden border-[#d9c7a1]/70 shadow-sm">
                <div className="h-1 bg-gradient-to-r from-[#7b2834] via-[#b78a3d] to-[#e7d19a]" />
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-[#6c2330] hover:bg-[#6c2330]">{item.agenteNome}</Badge>
                        {item.sugestao.statusAgente && <Badge variant="outline" className="text-[10px]">{item.sugestao.statusAgente}</Badge>}
                        <span className="text-xs text-muted-foreground">{item.unidadeNome ?? "Unidade não definida"}</span>
                      </div>
                      <CardTitle className="mt-2 text-base">{item.contato ?? item.telefone}</CardTitle>
                      <CardDescription className="mt-1">Recebida em {new Date(item.sugestao.createdAt).toLocaleString("pt-BR")}</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" className="text-[#6c2330] hover:bg-[#fbf1e8]" onClick={() => setLocation(`/mensagens?conversaId=${item.sugestao.conversaId}`)}>
                      Ver conversa <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-[#eadfca] bg-[#fdfbf7] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#82622f]">Última mensagem do cliente</p>
                    <p className="mt-1.5 text-sm text-foreground/80">{contexto?.ultimaMensagem || "Conteúdo não textual"}</p>
                  </div>
                  <div className="rounded-lg bg-[#f8f0e2] px-4 py-3 border-l-4 border-[#b7883a]">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#82622f]">Sugestão para envio</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#44242a]">{item.sugestao.sugestao || "Ação interna solicitada; revise o contexto antes de enviar qualquer conteúdo ao cliente."}</p>
                  </div>
                  {item.sugestao.acaoPendente && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><strong>Ação pendente:</strong> {item.sugestao.acaoPendente.replaceAll("_", " ")}. A ação é registrada somente após a aprovação humana.</div>}
                  <Textarea
                    value={comentario}
                    onChange={(event) => setComentarios((atual) => ({ ...atual, [item.sugestao.id]: event.target.value }))}
                    placeholder="Comentário opcional sobre esta sugestão"
                    className="min-h-20 text-sm"
                  />
                  <label className="block text-xs text-muted-foreground">Motivo da avaliação
                    <select value={motivos[item.sugestao.id] ?? ""} onChange={(event) => setMotivos((atual) => ({ ...atual, [item.sugestao.id]: event.target.value as "informacao" | "tom" | "roteamento" | "contexto" | "comercial" | "operacional" | "outro" }))} className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground">
                      <option value="">Não informar</option>
                      <option value="informacao">Informação</option>
                      <option value="tom">Tom de voz</option>
                      <option value="roteamento">Roteamento</option>
                      <option value="contexto">Falta de contexto</option>
                      <option value="comercial">Preço ou condição comercial</option>
                      <option value="operacional">Regra operacional</option>
                      <option value="outro">Outro</option>
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="bg-[#6c2330] hover:bg-[#4e1823]"
                      disabled={ocupada}
                      onClick={() => aprovar.mutate({ sugestaoId: item.sugestao.id, comentario: comentario || undefined, motivo: motivos[item.sugestao.id] })}
                    >
                      <ThumbsUp className="w-4 h-4 mr-2" /> Aprovar e enviar
                    </Button>
                    <Button
                      variant="outline"
                      className="border-rose-200 text-rose-700 hover:bg-rose-50"
                      disabled={ocupada}
                      onClick={() => reprovar.mutate({ sugestaoId: item.sugestao.id, comentario: comentario || undefined, motivo: motivos[item.sugestao.id] })}
                    >
                      <ThumbsDown className="w-4 h-4 mr-2" /> Reprovar
                    </Button>
                    {(aprovar.error || reprovar.error) && <p className="basis-full text-xs text-rose-700">{aprovar.error?.message ?? reprovar.error?.message}</p>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>

        <aside className="space-y-4">
          <Card className="border-[#d9c7a1]/70">
            <CardHeader className="pb-3"><CardTitle className="text-lg" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Qualidade por agente</CardTitle><CardDescription>Indicadores consolidados de validação humana.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              {!isAdmin && <p className="text-sm text-muted-foreground">As métricas são visíveis para administradores.</p>}
              {isAdmin && <div className="grid grid-cols-2 gap-2"><label className="text-xs text-muted-foreground">De<input aria-label="Início do período" type="date" value={inicio} onChange={(event) => setInicio(event.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs text-foreground" /></label><label className="text-xs text-muted-foreground">Até<input aria-label="Fim do período" type="date" value={fim} onChange={(event) => setFim(event.target.value)} className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-xs text-foreground" /></label></div>}
              {isAdmin && metricas.data?.map((metrica) => (
                <div key={metrica.agenteId} className="rounded-lg border border-border/60 p-3">
                  <div className="flex justify-between gap-3 text-sm"><span className="font-medium truncate">{metrica.agenteNome}</span><span className="text-[#6c2330] font-semibold">{metrica.taxaAprovacao === null ? "—" : `${metrica.taxaAprovacao}%`}</span></div>
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-gradient-to-r from-[#7b2834] to-[#c69a4a]" style={{ width: `${metrica.taxaAprovacao ?? 0}%` }} /></div>
                  <div className="mt-2 flex gap-3 text-xs text-muted-foreground"><span>{metrica.aprovadas} aprovadas</span><span>{metrica.reprovadas} reprovadas</span><span>{metrica.pendentes} pendentes</span></div>
                </div>
              ))}
              {isAdmin && !metricas.isLoading && metricas.data?.every((metrica) => metrica.total === 0) && <p className="text-sm text-muted-foreground">Ainda não há avaliações registradas.</p>}
              {isAdmin && !!serieQualidade.data?.length && <div className="pt-2 border-t border-border/60"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Evolução no período</p><div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">{serieQualidade.data.map((ponto) => <div key={`${ponto.agenteId}-${ponto.dia}`} className="text-xs rounded-md bg-muted/50 px-2.5 py-2"><div className="flex justify-between gap-2"><span className="truncate font-medium">{ponto.agenteNome}</span><span>{new Date(`${ponto.dia}T12:00:00`).toLocaleDateString("pt-BR")}</span></div><div className="mt-1 text-muted-foreground"><span className="text-emerald-700">{ponto.aprovadas} aprov.</span> · <span className="text-rose-700">{ponto.reprovadas} reprov.</span></div></div>)}</div></div>}
            </CardContent>
          </Card>
          {isAdmin && (
            <Card className="border-[#d9c7a1]/70">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}><FlaskConical className="w-4 h-4" /> Ferramentas de qualidade</CardTitle>
                <CardDescription>Testa o prompt ativo contra uma conversa real, sem criar sugestão nem cartão no Inbox.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={simAgente} onValueChange={(v) => setSimAgente(v as typeof simAgente)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ESPECIALISTAS.map((e) => <SelectItem key={e.chave} value={e.chave}>{e.nome}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <input
                      value={simConversaId}
                      onChange={(event) => setSimConversaId(event.target.value.replace(/\D/g, ""))}
                      placeholder="ID da conversa"
                      className="h-9 rounded-md border bg-background px-3 text-sm text-foreground"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={!simConversaId || simular.isPending}
                    onClick={() => simular.mutate({ conversaId: Number(simConversaId), chaveAgente: simAgente })}
                  >
                    {simular.isPending ? "Simulando…" : "Testar com prompt ativo"}
                  </Button>
                  {simular.data && (
                    <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-xs space-y-1.5">
                      <p><span className="font-semibold">Versão do prompt:</span> {simular.data.promptVersao}</p>
                      <p><span className="font-semibold">status:</span> {simular.data.resposta?.status ?? "—"}</p>
                      <p className="whitespace-pre-wrap"><span className="font-semibold">message:</span> {simular.data.resposta?.message || "(vazio — saída silenciosa)"}</p>
                      <p className="whitespace-pre-wrap"><span className="font-semibold">summary:</span> {simular.data.resposta?.summary || "—"}</p>
                    </div>
                  )}
                </div>
                <div className="pt-3 border-t border-border/60">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={verificarQualidade.isPending}
                    onClick={() => verificarQualidade.mutate()}
                  >
                    <ShieldAlert className="w-4 h-4 mr-1.5" />
                    {verificarQualidade.isPending ? "Verificando…" : "Verificar qualidade agora"}
                  </Button>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">Roda sozinho a cada 4h; isso aqui é só pra testar sem esperar.</p>
                </div>
              </CardContent>
            </Card>
          )}
          <Card className="bg-[#fbf7ee] border-[#ddc998]">
            <CardContent className="p-4 flex gap-3"><MessageCircle className="w-5 h-5 shrink-0 text-[#7b5420]" /><p className="text-sm leading-5 text-[#60481f]">Prompts, versões e modo de operação são administrados exclusivamente por usuários com perfil administrativo.</p></CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
