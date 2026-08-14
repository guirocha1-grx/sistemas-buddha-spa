import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useUnidade } from "@/contexts/UnidadeContext";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Copy, Pencil, Trash2, ScrollText, Workflow, Volume2, FileText, Braces } from "lucide-react";
import { toast } from "sonner";

type Tipo = "texto" | "fluxo";

interface ScriptForm {
  categoriaScript: string;
  tipo: Tipo;
  script: string;
  fluxoId: number | null;
  observacoes: string;
}

const FORM_VAZIO: ScriptForm = { categoriaScript: "", tipo: "texto", script: "", fluxoId: null, observacoes: "" };

/**
 * Lista fixa (diferente do VariavelPicker dos Fluxos, que também lista
 * variáveis criadas por nó "Salvar Variável" — Scripts não tem isso)
 * — mesma sintaxe {{dupla}} do motor de Fluxos, pra não precisar de um
 * segundo parser de variável no projeto. Script tipo "texto" resolve
 * essas três na hora de inserir (ver ScriptPicker.tsx); tipo "fluxo"
 * resolve pelo motor normal, se o fluxo referenciado as usar.
 */
const VARIAVEIS_SCRIPT = [
  { nome: "nome_atendente", dica: "quem está atendendo agora" },
  { nome: "unidade", dica: "nome da unidade" },
  { nome: "nome_cliente", dica: "nome do cliente/contato" },
];

function VariavelPickerFixo({ onInserir }: { onInserir: (nome: string) => void }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="relative inline-block">
      <Button type="button" size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setAberto((v) => !v)}>
        <Braces className="h-3 w-3 mr-1" /> inserir variável
      </Button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 mt-1 w-60 bg-background border rounded-md shadow-lg py-1 z-20">
            {VARIAVEIS_SCRIPT.map((o) => (
              <button
                key={o.nome}
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50"
                onClick={() => { onInserir(o.nome); setAberto(false); }}
              >
                <span className="font-mono">{"{{" + o.nome + "}}"}</span>
                <span className="text-muted-foreground ml-1.5">{o.dica}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Preview do que o fluxo escolhido vai mandar — olha só o nó de entrada (mensagem/mídia), sem simular o fluxo inteiro. */
function PreviewFluxo({ fluxoId }: { fluxoId: number }) {
  const query = trpc.fluxos.get.useQuery({ id: fluxoId });
  if (query.isLoading) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando prévia...</div>;
  }
  const data = query.data;
  if (!data?.fluxo || data.nos.length === 0) {
    return <p className="text-xs text-muted-foreground py-2">Fluxo sem passos configurados ainda.</p>;
  }
  const nosOrdenados = [...data.nos].sort((a, b) => a.ordem - b.ordem);
  const noEntrada = nosOrdenados.find((n) => n.ordem === data.fluxo!.entradaNoOrdem) ?? nosOrdenados[0];

  if (noEntrada.tipo === "mensagem") {
    const texto = (noEntrada.config as { texto?: string })?.texto || "";
    return (
      <div className="rounded-md border bg-muted/30 p-2.5 text-xs whitespace-pre-wrap">
        {texto || <span className="text-muted-foreground italic">(sem texto)</span>}
      </div>
    );
  }

  if (noEntrada.tipo === "midia") {
    const config = noEntrada.config as { tipoMidia?: string; storageKey?: string; nomeArquivo?: string; legenda?: string };
    if (config.tipoMidia === "imagem" && config.storageKey) {
      return (
        <div className="flex items-center gap-2.5 rounded-md border bg-muted/30 p-2.5">
          <img src={`/api/inbox-media/${config.storageKey}`} alt="Prévia" className="h-14 w-14 rounded object-cover shrink-0" />
          {config.legenda && <p className="text-xs whitespace-pre-wrap">{config.legenda}</p>}
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2.5 text-xs">
        {config.tipoMidia === "audio" ? <Volume2 className="h-4 w-4 text-muted-foreground" /> : <FileText className="h-4 w-4 text-muted-foreground" />}
        <span>{config.nomeArquivo || `Arquivo (${config.tipoMidia})`}</span>
      </div>
    );
  }

  return <p className="text-xs text-muted-foreground py-2">Fluxo com {data.nos.length} passo{data.nos.length === 1 ? "" : "s"} — primeiro passo: {noEntrada.tipo}.</p>;
}

export default function Scripts() {
  const utils = trpc.useUtils();
  const { unidadeSelecionada } = useUnidade();

  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<ScriptForm>(FORM_VAZIO);
  const [excluirId, setExcluirId] = useState<number | null>(null);

  const categoriasQuery = trpc.scripts.listCategorias.useQuery();
  const scriptsQuery = trpc.scripts.list.useQuery({
    busca: busca || undefined,
    categoria: categoriaFiltro || undefined,
  });
  const fluxosQuery = trpc.fluxos.list.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0 },
    { enabled: !!unidadeSelecionada && modalAberto && form.tipo === "fluxo" },
  );
  // Só fluxos marcados "Visível para criação de script" — fluxos
  // automáticos (gatilho de recepção, menu, bot etc.) não devem
  // aparecer aqui, o único jeito de disparar um fluxo numa conversa.
  const fluxosVisiveis = (fluxosQuery.data ?? []).filter((f) => f.visivelNoInbox);

  const invalidar = () => {
    utils.scripts.list.invalidate();
    utils.scripts.listCategorias.invalidate();
  };

  const createMutation = trpc.scripts.create.useMutation({
    onSuccess: () => { toast.success("Script criado."); setModalAberto(false); invalidar(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.scripts.update.useMutation({
    onSuccess: () => { toast.success("Script atualizado."); setModalAberto(false); invalidar(); },
    onError: (e) => toast.error(e.message),
  });
  const excluirMutation = trpc.scripts.excluir.useMutation({
    onSuccess: () => { toast.success("Script removido."); setExcluirId(null); invalidar(); },
    onError: (e) => toast.error(e.message),
  });

  const abrirNovo = () => { setEditandoId(null); setForm(FORM_VAZIO); setModalAberto(true); };
  const abrirEdicao = (s: { id: number; categoriaScript: string; tipo: Tipo; script: string | null; fluxoId: number | null; observacoes: string | null }) => {
    setEditandoId(s.id);
    setForm({
      categoriaScript: s.categoriaScript,
      tipo: s.tipo,
      script: s.script ?? "",
      fluxoId: s.fluxoId,
      observacoes: s.observacoes ?? "",
    });
    setModalAberto(true);
  };
  const salvar = () => {
    if (!form.categoriaScript.trim()) return;
    if (form.tipo === "texto" && !form.script.trim()) return;
    if (form.tipo === "fluxo" && !form.fluxoId) return;
    const dados = {
      categoriaScript: form.categoriaScript.trim(),
      tipo: form.tipo,
      script: form.tipo === "texto" ? form.script.trim() : null,
      fluxoId: form.tipo === "fluxo" ? form.fluxoId ?? undefined : null,
      observacoes: form.observacoes.trim() || undefined,
    };
    if (editandoId) updateMutation.mutate({ id: editandoId, ...dados });
    else createMutation.mutate(dados as any);
  };
  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
    toast.success("Copiado.");
  };

  const scripts = scriptsQuery.data ?? [];
  const categorias = categoriasQuery.data ?? [];
  const salvando = createMutation.isPending || updateMutation.isPending;
  const podeSalvar = form.categoriaScript.trim() && (form.tipo === "texto" ? form.script.trim() : form.fluxoId) && !salvando;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            <ScrollText className="h-5 w-5" /> Scripts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mensagens prontas e fluxos automáticos pra usar no Inbox (botão de raio ou digite "/" na caixa de texto).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <UnidadeSelector />
          <Button size="sm" onClick={abrirNovo}>
            <Plus className="h-4 w-4 mr-1.5" /> Novo script
          </Button>
        </div>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3 space-y-3">
          <Input
            placeholder="Buscar script..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-sm"
          />
          {categorias.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant={categoriaFiltro === null ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setCategoriaFiltro(null)}
              >
                Todas
              </Badge>
              {categorias.map((c) => (
                <Badge
                  key={c}
                  variant={categoriaFiltro === c ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setCategoriaFiltro(c)}
                >
                  {c}
                </Badge>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {scriptsQuery.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : scripts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Nenhum script cadastrado ainda.</p>
          ) : (
            scripts.map((s) => (
              <div key={s.id} className="rounded-lg border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Badge variant="outline" className="text-[10px]">{s.categoriaScript}</Badge>
                    {s.tipo === "fluxo" && (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <Workflow className="h-2.5 w-2.5" /> Fluxo
                      </Badge>
                    )}
                  </div>
                  {s.tipo === "fluxo" ? (
                    <p className="text-sm">{s.fluxoNome || "(fluxo removido)"}</p>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{s.script}</p>
                  )}
                  {s.observacoes && <p className="text-xs text-muted-foreground mt-1">{s.observacoes}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {s.tipo === "texto" && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Copiar" onClick={() => copiar(s.script ?? "")}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Editar" onClick={() => abrirEdicao(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Excluir" onClick={() => setExcluirId(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar script" : "Novo script"}</DialogTitle>
            <DialogDescription>
              Um script de texto insere direto na caixa de mensagem; um script de fluxo dispara uma sequência já pronta (pode ter imagem, áudio, espera, menu...).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Categoria</Label>
                <Input
                  value={form.categoriaScript}
                  onChange={(e) => setForm({ ...form, categoriaScript: e.target.value })}
                  placeholder="Ex.: Boas-vindas, Confirmação, Preços..."
                />
              </div>
              <div>
                <Label className="text-xs">Tipo de script</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as Tipo })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="texto">Texto</SelectItem>
                    <SelectItem value="fluxo">Executar fluxo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.tipo === "texto" ? (
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Mensagem</Label>
                  <VariavelPickerFixo onInserir={(nome) => setForm({ ...form, script: form.script + `{{${nome}}}` })} />
                </div>
                <Textarea
                  value={form.script}
                  onChange={(e) => setForm({ ...form, script: e.target.value })}
                  rows={6}
                  placeholder="Ex.: Oi {{nome_cliente}}, aqui é {{nome_atendente}} da {{unidade}}..."
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs">Fluxo</Label>
                {!unidadeSelecionada ? (
                  <p className="text-xs text-muted-foreground">Selecione uma unidade pra listar os fluxos.</p>
                ) : (
                  <Select value={form.fluxoId ? String(form.fluxoId) : ""} onValueChange={(v) => setForm({ ...form, fluxoId: Number(v) })}>
                    <SelectTrigger><SelectValue placeholder="Escolha um fluxo já montado..." /></SelectTrigger>
                    <SelectContent>
                      {fluxosVisiveis.map((f) => (
                        <SelectItem key={f.id} value={String(f.id)}>{f.nome}</SelectItem>
                      ))}
                      {fluxosQuery.data && fluxosVisiveis.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          Nenhum fluxo liberado pra script nessa unidade — marque "Visível para criação de script" no fluxo desejado, em Fluxos.
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                )}
                {form.fluxoId && <PreviewFluxo fluxoId={form.fluxoId} />}
                <p className="text-[11px] text-muted-foreground">
                  Fluxos são montados só por admin, em Fluxos. Só aparecem aqui os marcados como "Visível para
                  criação de script" — fluxos automáticos (gatilho de recepção, menu, bot etc.) ficam de fora.
                </p>
              </div>
            )}

            <div>
              <Label className="text-xs">Observações (opcional)</Label>
              <Input
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                placeholder="Nota interna, quando usar..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button disabled={!podeSalvar} onClick={salvar}>
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={excluirId !== null} onOpenChange={(v) => !v && setExcluirId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir script</AlertDialogTitle>
            <AlertDialogDescription>Esse script deixa de aparecer na busca, mas o histórico de uso é preservado.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => excluirId && excluirMutation.mutate({ id: excluirId })}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
