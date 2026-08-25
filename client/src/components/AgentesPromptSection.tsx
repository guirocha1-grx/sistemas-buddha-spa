import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useUnidade } from "@/contexts/UnidadeContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle, Loader2, Save, Sparkles } from "lucide-react";

export function AgentesPromptSection() {
  const { unidades } = useUnidade();
  const utils = trpc.useUtils();
  const [unidadeId, setUnidadeId] = useState<number | null>(null);
  const configuracao = trpc.agentes.configuracao.list.useQuery({ unidadeId: unidadeId ?? 0 }, { enabled: Boolean(unidadeId) });
  const [agenteId, setAgenteId] = useState<number | null>(null);
  const agente = useMemo(() => configuracao.data?.find((item) => item.id === agenteId) ?? configuracao.data?.[0], [configuracao.data, agenteId]);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prompt, setPrompt] = useState("");
  const [ativarAgora, setAtivarAgora] = useState(true);

  useEffect(() => {
    if (unidadeId || unidades.length === 0) return;
    const ribeirao = unidades.find((unidade) => unidade.nome.toLowerCase().includes("ribeir"));
    setUnidadeId(ribeirao?.id ?? unidades[0]?.id ?? null);
  }, [unidadeId, unidades]);

  useEffect(() => {
    const selecionado = agente;
    if (!selecionado) return;
    setAgenteId(selecionado.id);
    setNome(selecionado.nome);
    setDescricao(selecionado.descricao ?? "");
    setPrompt(selecionado.promptAtivo?.conteudo ?? "");
  }, [agente?.id]);

  const atualizar = trpc.agentes.configuracao.atualizar.useMutation({ onSuccess: () => utils.agentes.configuracao.list.invalidate() });
  const atualizarTodos = trpc.agentes.configuracao.atualizarTodos.useMutation({ onSuccess: () => utils.agentes.configuracao.list.invalidate() });
  const criarVersao = trpc.agentes.configuracao.criarVersao.useMutation({ onSuccess: () => utils.agentes.configuracao.list.invalidate() });
  const ativarVersao = trpc.agentes.configuracao.ativarVersao.useMutation({ onSuccess: () => utils.agentes.configuracao.list.invalidate() });
  const ocupado = atualizar.isPending || atualizarTodos.isPending || criarVersao.isPending || ativarVersao.isPending;
  const todosAtivos = (configuracao.data?.length ?? 0) > 0 && configuracao.data?.every((item) => item.ativo);

  if (configuracao.isLoading) return <Card><CardContent className="p-6 text-sm text-muted-foreground">Carregando agentes...</CardContent></Card>;
  if (configuracao.isError) return <Card className="border-amber-200 bg-amber-50"><CardContent className="p-5 text-sm text-amber-900">A edição dos prompts de agentes é restrita à administração.</CardContent></Card>;
  if (!agente) return null;

  function salvarConfiguracao() {
    if (!agente || !unidadeId) return;
    atualizar.mutate({ id: agente.id, unidadeId, nome: nome.trim(), descricao: descricao.trim() || null });
  }

  function salvarNovaVersao() {
    if (!agente || !unidadeId) return;
    criarVersao.mutate({ agenteId: agente.id, unidadeId, conteudo: prompt.trim(), ativarAgora });
  }

  return (
    <Card className="border-[#d9c7a1] bg-[#fffdfa] shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}><Sparkles className="h-4 w-4 text-[#8a6227]" /> Prompts de Agentes</CardTitle>
        <CardDescription>Edite cada agente sem alterar o código. Toda versão, modo e ativação ficam segregados por unidade.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
        <div className="space-y-2">
          <div className="pb-2">
            <Label className="text-xs">Unidade</Label>
            <Select value={unidadeId?.toString() ?? ""} onValueChange={(value) => { setUnidadeId(Number(value)); setAgenteId(null); }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
              <SelectContent>{unidades.map((unidade) => <SelectItem key={unidade.id} value={unidade.id.toString()}>{unidade.nome}</SelectItem>)}</SelectContent>
            </Select>
            <Button
              size="sm"
              className="mt-2 w-full"
              variant={todosAtivos ? "outline" : "default"}
              disabled={ocupado || !unidadeId || !configuracao.data?.length}
              onClick={() => unidadeId && atualizarTodos.mutate({ unidadeId, ativo: !todosAtivos })}
            >
              {atualizarTodos.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {todosAtivos ? "Desativar todos" : "Ativar todos"}
            </Button>
            <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">Não altera permissões individuais de automação.</p>
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agentes do fluxo</p>
          {configuracao.data?.map((item) => {
            const podeAutomatizar = item.tipo !== "receptor" && item.ativo;
            return (
              <div key={item.id} className={`rounded-lg border p-3 transition-colors ${item.id === agente.id ? "border-[#8a6227] bg-[#f7edd8]" : "border-border bg-background hover:bg-muted/30"}`}>
                <button onClick={() => setAgenteId(item.id)} className="w-full text-left">
                  <div className="flex gap-2 items-center"><span className="text-sm font-medium truncate">{item.nome}</span>{item.tipo === "receptor" && <Badge variant="outline" className="text-[10px]">receptor</Badge>}</div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.descricao ?? "Especialidade não definida"}</p>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span>{item.promptAtivo ? `Prompt v${item.promptAtivo.versao} ativo` : "Sem prompt ativo"}</span>
                    {item.promptEditadoManualmente && (
                      <Badge variant="outline" className="border-amber-300 text-amber-700 text-[9px] px-1 py-0" title="Esse prompt foi editado manualmente e não recebe mais atualizações automáticas do código.">
                        editado manualmente
                      </Badge>
                    )}
                  </div>
                </button>
                <div className="mt-3 space-y-1.5">
                  <Button size="sm" className="w-full" variant={item.ativo ? "outline" : "default"} disabled={ocupado || !unidadeId} onClick={() => unidadeId && atualizar.mutate({ id: item.id, unidadeId, ativo: !item.ativo })}>{item.ativo ? "Desativar assistente" : "Ativar assistente"}</Button>
                  {item.tipo !== "receptor" ? (
                    <Button size="sm" variant={item.modoOperacao === "automatico" ? "default" : "outline"} className={`w-full h-auto min-h-8 whitespace-normal leading-tight ${item.modoOperacao === "automatico" ? "bg-[#6c2330] hover:bg-[#4e1823]" : ""}`} disabled={ocupado || !podeAutomatizar || !unidadeId} onClick={() => unidadeId && atualizar.mutate({ id: item.id, unidadeId, modoOperacao: item.modoOperacao === "automatico" ? "assistido" : "automatico" })}>{item.modoOperacao === "automatico" ? "Desautorizar automação" : "Autorizar automação"}</Button>
                  ) : <p className="text-[10px] text-muted-foreground">Roteador sempre em modo assistido.</p>}
                </div>
                {item.tipo !== "receptor" && !item.ativo && <p className="mt-2 text-[11px] text-muted-foreground">Ative o assistente antes de autorizar qualquer resposta automática.</p>}
              </div>
            );
          })}
        </div>
        <div className="space-y-4 min-w-0">
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Nome do agente</Label><Input className="mt-1" value={nome} onChange={(event) => setNome(event.target.value)} /></div>
            <div><Label>Modo atual</Label><div className="mt-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">{agente.modoOperacao === "assistido" ? "Assistido — gera sugestão para o consultor" : "Automático — envia sem filtro"}</div></div>
          </div>
          <div><Label>Descrição da especialidade</Label><Input className="mt-1" value={descricao} onChange={(event) => setDescricao(event.target.value)} placeholder="Explique o escopo e as responsabilidades deste agente" /></div>
          <p className="rounded-lg border border-[#eadfca] bg-[#fdf9f1] p-3 text-xs text-muted-foreground">A ativação e a autorização de automação são controladas individualmente no cartão de cada agente, à esquerda.</p>
          <Button size="sm" variant="outline" disabled={ocupado || !nome.trim()} onClick={salvarConfiguracao}>{atualizar.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Salvar configuração</Button>
          <div className="pt-2 border-t border-[#eadfca]">
            <div className="flex items-center justify-between gap-3"><Label>Prompt desta versão</Label><div className="flex items-center gap-2 text-xs"><Switch checked={ativarAgora} onCheckedChange={setAtivarAgora} /><span>Ativar ao salvar</span></div></div>
            {agente.promptEditadoManualmente && (
              <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                Esse prompt foi editado manualmente em algum momento e <strong>parou de receber atualizações automáticas do código</strong> (mesma proteção que já existe pra Carol) — mudar o texto padrão no código não vai mais afetar esse agente nessa unidade. Pra atualizar de verdade, edite e salve uma nova versão aqui.
              </p>
            )}
            <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="mt-2 min-h-64 font-mono text-xs leading-5" placeholder="Escreva aqui as instruções deste agente" />
            <div className="mt-3 flex flex-wrap items-center gap-2"><Button size="sm" disabled={ocupado || prompt.trim().length < 20} onClick={salvarNovaVersao}>{criarVersao.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Salvar nova versão</Button>{criarVersao.isSuccess && <span className="text-xs text-emerald-700 flex items-center"><CheckCircle className="w-3.5 h-3.5 mr-1" /> Versão registrada</span>}</div>
          </div>
          <div className="pt-2 border-t border-border/60"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Histórico de versões</p><div className="mt-2 space-y-2 max-h-44 overflow-y-auto pr-1">{agente.versoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma versão criada.</p>}{agente.versoes.map((versao) => <div key={versao.id} className="flex items-center justify-between gap-3 rounded-md border p-2.5"><div className="min-w-0"><div className="flex items-center gap-2"><span className="font-medium text-sm">v{versao.versao}</span><Badge variant={versao.status === "ativo" ? "default" : "outline"} className={versao.status === "ativo" ? "bg-[#6c2330]" : ""}>{versao.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground truncate">{versao.criadoPorNome ?? "Administração"} · {new Date(versao.createdAt).toLocaleString("pt-BR")}</p></div>{versao.status !== "ativo" && <Button size="sm" variant="ghost" disabled={ocupado || !unidadeId} onClick={() => unidadeId && ativarVersao.mutate({ agenteId: agente.id, unidadeId, versaoId: versao.id })}>Ativar</Button>}</div>)}</div></div>
        </div>
      </CardContent>
    </Card>
  );
}
