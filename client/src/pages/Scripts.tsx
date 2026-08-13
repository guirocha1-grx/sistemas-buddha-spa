import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Plus, Copy, Pencil, Trash2, ScrollText } from "lucide-react";
import { toast } from "sonner";

interface ScriptForm {
  categoriaScript: string;
  script: string;
  observacoes: string;
}

const FORM_VAZIO: ScriptForm = { categoriaScript: "", script: "", observacoes: "" };

export default function Scripts() {
  const utils = trpc.useUtils();

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
  const abrirEdicao = (s: { id: number; categoriaScript: string; script: string; observacoes: string | null }) => {
    setEditandoId(s.id);
    setForm({ categoriaScript: s.categoriaScript, script: s.script, observacoes: s.observacoes ?? "" });
    setModalAberto(true);
  };
  const salvar = () => {
    if (!form.categoriaScript.trim() || !form.script.trim()) return;
    const dados = {
      categoriaScript: form.categoriaScript.trim(),
      script: form.script.trim(),
      observacoes: form.observacoes.trim() || undefined,
    };
    if (editandoId) updateMutation.mutate({ id: editandoId, ...dados });
    else createMutation.mutate(dados);
  };
  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
    toast.success("Copiado.");
  };

  const scripts = scriptsQuery.data ?? [];
  const categorias = categoriasQuery.data ?? [];
  const salvando = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            <ScrollText className="h-5 w-5" /> Scripts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Mensagens prontas pra usar no Inbox (botão de raio ou digite "/" na caixa de texto).
          </p>
        </div>
        <Button size="sm" onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-1.5" /> Novo script
        </Button>
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
                  <Badge variant="outline" className="text-[10px] mb-1.5">{s.categoriaScript}</Badge>
                  <p className="text-sm whitespace-pre-wrap">{s.script}</p>
                  {s.observacoes && <p className="text-xs text-muted-foreground mt-1">{s.observacoes}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Copiar" onClick={() => copiar(s.script)}>
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar script" : "Novo script"}</DialogTitle>
            <DialogDescription>Use [nome_cliente] no texto pra lembrar de personalizar na hora de enviar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Categoria</Label>
              <Input
                value={form.categoriaScript}
                onChange={(e) => setForm({ ...form, categoriaScript: e.target.value })}
                placeholder="Ex.: Boas-vindas, Confirmação, Preços..."
              />
            </div>
            <div>
              <Label className="text-xs">Mensagem</Label>
              <Textarea
                value={form.script}
                onChange={(e) => setForm({ ...form, script: e.target.value })}
                rows={5}
                placeholder="Texto da mensagem..."
              />
            </div>
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
            <Button disabled={!form.categoriaScript.trim() || !form.script.trim() || salvando} onClick={salvar}>
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
