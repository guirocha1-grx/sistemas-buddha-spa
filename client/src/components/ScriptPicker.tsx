import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Zap, MessageSquare, Workflow, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { descricaoExibicaoScript, filtrarScriptsPorBusca, filtrarScriptsPorTipo, type FiltroSimNao } from "@/lib/scriptsSearch";
import { toast } from "sonner";

interface ScriptRow {
  id: number;
  categoriaScript: string;
  titulo: string | null;
  descricao: string | null;
  tipo: "texto" | "fluxo";
  script: string | null;
  fluxoId: number | null;
  fluxoUnidadeId: number | null;
  fluxoNome: string | null;
}

interface ScriptPickerProps {
  onSelect: (texto: string) => void;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Conversa/cliente/unidade abertos no Inbox — necessários pra disparar script tipo "fluxo" e pra filtrar por unidade. */
  conversaId?: number;
  clienteId?: number;
  unidadeId?: number;
  /** {{nome_atendente}}, {{unidade}}, {{nome_cliente}} — resolvidos aqui (fora do componente) porque script tipo "texto" nunca passa pelo motor de Fluxos. */
  variaveis?: Record<string, string>;
}

function interpolarVariaveis(texto: string, variaveis: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (match, nome) => variaveis[nome] ?? match);
}

/** Miniatura pro item "fluxo" da lista — só busca se o nó de entrada for mídia com imagem (thumbnail vale a pena); resto some sem miniatura. */
function MiniaturaFluxo({ fluxoId }: { fluxoId: number }) {
  const query = trpc.fluxos.get.useQuery({ id: fluxoId });
  const nos = query.data?.nos ?? [];
  const fluxo = query.data?.fluxo;
  if (!fluxo || nos.length === 0) return null;
  const noEntrada = [...nos].sort((a, b) => a.ordem - b.ordem).find((n) => n.ordem === fluxo.entradaNoOrdem) ?? nos[0];
  if (noEntrada.tipo !== "midia") return null;
  const config = noEntrada.config as { tipoMidia?: string; storageKey?: string };
  if (config.tipoMidia !== "imagem" || !config.storageKey) return null;
  return <img src={`/api/inbox-media/${config.storageKey}`} alt="" className="h-6 w-6 rounded object-cover shrink-0" />;
}

/**
 * Popover de scripts prontos — mesmo conceito do mobai-crm (busca +
 * filtro de categoria + recentes). `open`/`onOpenChange` controlados
 * pelo componente pai pra que o atalho "/" na caixa de texto também
 * consiga abrir. Script tipo "fluxo" (2026-08-13) não insere texto —
 * dispara o fluxo direto pra conversa aberta.
 */
export function ScriptPicker({ onSelect, disabled, open, onOpenChange, conversaId, clienteId, unidadeId, variaveis }: ScriptPickerProps) {
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [textoFiltro, setTextoFiltro] = useState<FiltroSimNao>("todos");
  const [fluxoFiltro, setFluxoFiltro] = useState<FiltroSimNao>("todos");

  const categoriasQuery = trpc.scripts.listCategorias.useQuery(undefined, { enabled: open });
  const scriptsQuery = trpc.scripts.list.useQuery(
    { categoria: categoriaFiltro || undefined },
    { enabled: open },
  );
  const recentesQuery = trpc.scripts.listRecentes.useQuery(undefined, { enabled: open });
  const campanhaQuery = trpc.tabelaPrecos.campanhaMes.useQuery(
    { unidadeId: unidadeId ?? 0 },
    { enabled: open && !!unidadeId },
  );
  const registrarUsoMutation = trpc.scripts.registrarUso.useMutation();
  const iniciarFluxoMutation = trpc.fluxos.iniciarVisivel.useMutation({
    onSuccess: () => toast.success("Fluxo iniciado."),
    onError: (e) => toast.error(e.message),
  });

  // Script "fluxo" cujo fluxo é de outra unidade não aparece — evita
  // disparar via credencial Z-API de uma unidade diferente da conversa
  // aberta. Script "texto" continua aparecendo sempre.
  const visivelNaUnidade = (s: ScriptRow) => s.tipo === "texto" || s.fluxoUnidadeId === unidadeId;

  const fechar = () => {
    onOpenChange(false);
    setBusca("");
    setCategoriaFiltro(null);
    setTextoFiltro("todos");
    setFluxoFiltro("todos");
  };

  const handleSelect = (script: ScriptRow) => {
    if (script.tipo === "fluxo") {
      if (!script.fluxoId || !conversaId) return;
      iniciarFluxoMutation.mutate({ fluxoId: script.fluxoId, conversaId, clienteId });
      registrarUsoMutation.mutate({ scriptId: script.id });
      fechar();
      return;
    }
    const variaveisComCampanha = {
      ...(variaveis ?? {}),
      campanha_do_mes: campanhaQuery.data?.campanha?.conteudo ?? "",
    };
    const texto = interpolarVariaveis(script.script ?? "", variaveisComCampanha);
    onSelect(texto);
    registrarUsoMutation.mutate({ scriptId: script.id });
    fechar();
  };

  // O catálogo inteiro é carregado por categoria e filtrado imediatamente no
  // cliente. Isso impede que o React Query mostre resultados de uma pesquisa
  // anterior enquanto a requisição com o novo termo ainda está em trânsito.
  const listaFiltrada = filtrarScriptsPorTipo(
    filtrarScriptsPorBusca(scriptsQuery.data ?? [], busca).filter(visivelNaUnidade) as ScriptRow[],
    textoFiltro,
    fluxoFiltro,
  );
  const recentesFiltrados = filtrarScriptsPorTipo(
    (recentesQuery.data ?? []).filter(visivelNaUnidade) as ScriptRow[],
    textoFiltro,
    fluxoFiltro,
  );

  return (
    <Popover open={open} onOpenChange={(v) => (v ? onOpenChange(true) : fechar())}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="shrink-0" disabled={disabled} title="Scripts e mensagens rápidas (ou digite / na caixa)">
          <Zap className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] max-w-[640px] p-0" side="top" align="start" sideOffset={8}>
        <div className="p-3 border-b space-y-2.5">
          <Input
            autoFocus
            placeholder="Buscar script..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-9 text-sm"
          />
          {(categoriasQuery.data?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant={categoriaFiltro === null ? "default" : "outline"}
                className="cursor-pointer text-xs px-2.5 py-1"
                onClick={() => setCategoriaFiltro(null)}
              >
                Todos
              </Badge>
              {categoriasQuery.data?.map((c) => (
                <Badge
                  key={c}
                  variant={categoriaFiltro === c ? "default" : "outline"}
                  className="cursor-pointer text-xs px-2.5 py-1"
                  onClick={() => setCategoriaFiltro(c)}
                >
                  {c}
                </Badge>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5" aria-label="Filtros de tipo de Script">
            {([
              ["Texto", textoFiltro, setTextoFiltro],
              ["Fluxo", fluxoFiltro, setFluxoFiltro],
            ] as const).map(([rotulo, filtroAtual, definirFiltro]) => (
              <div key={rotulo} className="flex items-center gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{rotulo}</span>
                {(["todos", "sim", "nao"] as const).map((opcao) => (
                  <Button
                    key={opcao}
                    type="button"
                    size="sm"
                    variant={filtroAtual === opcao ? "secondary" : "ghost"}
                    className="h-6 px-2 text-[10px]"
                    onClick={() => definirFiltro(opcao)}
                    title={`${rotulo}: ${opcao === "todos" ? "todos" : opcao}`}
                  >
                    {opcao === "todos" ? "Todos" : opcao === "sim" ? "Sim" : "Não"}
                  </Button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="max-h-[420px] overflow-y-auto p-1.5">
          {!busca && !categoriaFiltro && textoFiltro === "todos" && fluxoFiltro === "todos" && recentesFiltrados.length > 0 && (
            <div className="mb-1.5">
              <p className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recentes</p>
              {recentesFiltrados.map((s) => (
                <button
                  key={`recente-${s.id}`}
                  className="w-full text-left px-2.5 py-2 rounded hover:bg-muted text-sm flex items-start gap-2"
                  disabled={iniciarFluxoMutation.isPending}
                  onClick={() => handleSelect(s)}
                >
                  {s.tipo === "fluxo" ? <Workflow className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" /> : <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />}
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold text-sm leading-5 text-primary block truncate">
                      {descricaoExibicaoScript(s)} <span className="font-normal text-muted-foreground">({s.categoriaScript})</span>
                    </span>
                    <span className="line-clamp-2">{s.tipo === "fluxo" ? (s.descricao || s.fluxoNome || "(fluxo removido)") : s.script?.slice(0, 140)}</span>
                  </span>
                  {s.tipo === "fluxo" && s.fluxoId && <MiniaturaFluxo fluxoId={s.fluxoId} />}
                </button>
              ))}
            </div>
          )}
          {scriptsQuery.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground text-center">Carregando...</p>
          ) : listaFiltrada.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">Nenhum script encontrado.</p>
          ) : (
            listaFiltrada.map((s) => (
              <button
                key={s.id}
                className="w-full text-left px-2.5 py-2 rounded hover:bg-muted text-sm flex items-start gap-2"
                disabled={iniciarFluxoMutation.isPending}
                onClick={() => handleSelect(s)}
              >
                {s.tipo === "fluxo" ? <Workflow className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" /> : <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />}
                <span className="flex-1 min-w-0">
                  <span className="font-semibold text-sm leading-5 text-primary block truncate">
                    {descricaoExibicaoScript(s)} <span className="font-normal text-muted-foreground">({s.categoriaScript})</span>
                  </span>
                  <span className="line-clamp-2">{s.tipo === "fluxo" ? (s.descricao || s.fluxoNome || "(fluxo removido)") : s.script?.slice(0, 140)}</span>
                </span>
                {s.tipo === "fluxo" && s.fluxoId && <MiniaturaFluxo fluxoId={s.fluxoId} />}
                {iniciarFluxoMutation.isPending && s.tipo === "fluxo" && <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
