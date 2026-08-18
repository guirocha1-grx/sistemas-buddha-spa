import { useEffect, useMemo, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BookOpenCheck, Loader2, Save } from "lucide-react";

type TipoRecurso = "preco" | "promocao" | "conteudo" | "midia" | "modelo_voucher";

const ROTULOS: Record<TipoRecurso, string> = {
  preco: "Preço oficial",
  promocao: "Promoção",
  conteudo: "Conteúdo oficial",
  midia: "Mídia",
  modelo_voucher: "Modelo de voucher",
};

const vazio = { chave: "", tipo: "conteudo" as TipoRecurso, titulo: "", conteudo: "", url: "", vigenciaInicio: "", vigenciaFim: "", ativo: true };

export function AgentesRecursosSection() {
  const { unidades } = useUnidade();
  const utils = trpc.useUtils();
  const [unidadeId, setUnidadeId] = useState<number | null>(null);
  const [recursoId, setRecursoId] = useState<number | null>(null);
  const [form, setForm] = useState(vazio);

  useEffect(() => {
    if (unidadeId || unidades.length === 0) return;
    const ribeirao = unidades.find((unidade) => unidade.nome.toLowerCase().includes("ribeir"));
    setUnidadeId(ribeirao?.id ?? unidades[0]?.id ?? null);
  }, [unidadeId, unidades]);

  const recursos = trpc.agentes.recursos.list.useQuery({ unidadeId: unidadeId ?? 0 }, { enabled: Boolean(unidadeId) });
  const salvar = trpc.agentes.recursos.salvar.useMutation({
    onSuccess: () => {
      utils.agentes.recursos.list.invalidate();
      setRecursoId(null);
      setForm(vazio);
    },
  });
  const selecionado = useMemo(() => recursos.data?.find((recurso) => recurso.id === recursoId), [recursos.data, recursoId]);

  useEffect(() => {
    if (!selecionado) return;
    setForm({
      chave: selecionado.chave,
      tipo: selecionado.tipo,
      titulo: selecionado.titulo,
      conteudo: selecionado.conteudo ?? "",
      url: selecionado.url ?? "",
      vigenciaInicio: selecionado.vigenciaInicio ? new Date(selecionado.vigenciaInicio).toISOString().slice(0, 10) : "",
      vigenciaFim: selecionado.vigenciaFim ? new Date(selecionado.vigenciaFim).toISOString().slice(0, 10) : "",
      ativo: selecionado.ativo,
    });
  }, [selecionado]);

  function novo() {
    setRecursoId(null);
    setForm(vazio);
  }

  function gravar() {
    if (!unidadeId) return;
    salvar.mutate({
      id: recursoId ?? undefined,
      unidadeId,
      chave: form.chave.trim(),
      tipo: form.tipo,
      titulo: form.titulo.trim(),
      conteudo: form.conteudo.trim() || null,
      url: form.url.trim() || null,
      vigenciaInicio: form.vigenciaInicio ? new Date(`${form.vigenciaInicio}T00:00:00`) : null,
      vigenciaFim: form.vigenciaFim ? new Date(`${form.vigenciaFim}T23:59:59`) : null,
      ativo: form.ativo,
    });
  }

  return (
    <Card className="border-[#d9c7a1] bg-[#fffdfa] shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}><BookOpenCheck className="h-4 w-4 text-[#8a6227]" /> Fontes oficiais dos agentes</CardTitle>
        <CardDescription>Cadastre os dados que podem ser usados pelos agentes. Preços, promoções, links e regras devem estar aqui, não dentro do prompt.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
        <div className="space-y-3">
          <div><Label className="text-xs">Unidade</Label><Select value={unidadeId?.toString() ?? ""} onValueChange={(valor) => { setUnidadeId(Number(valor)); novo(); }}><SelectTrigger className="mt-1"><SelectValue placeholder="Selecione a unidade" /></SelectTrigger><SelectContent>{unidades.map((unidade) => <SelectItem key={unidade.id} value={unidade.id.toString()}>{unidade.nome}</SelectItem>)}</SelectContent></Select></div>
          <Button size="sm" variant="outline" onClick={novo}>Novo recurso</Button>
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {recursos.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma fonte oficial cadastrada.</p>}
            {recursos.data?.map((recurso) => <button key={recurso.id} onClick={() => setRecursoId(recurso.id)} className={`w-full rounded-lg border p-3 text-left ${recurso.id === recursoId ? "border-[#8a6227] bg-[#f7edd8]" : "border-border hover:bg-muted/50"}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{recurso.titulo}</span><Badge variant={recurso.ativo ? "default" : "outline"} className={recurso.ativo ? "bg-[#6c2330] text-[10px]" : "text-[10px]"}>{recurso.ativo ? "ativo" : "inativo"}</Badge></div><p className="mt-1 truncate text-xs text-muted-foreground">{ROTULOS[recurso.tipo]} · {recurso.chave}</p></button>)}
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2"><div><Label>Chave técnica</Label><Input className="mt-1" value={form.chave} onChange={(event) => setForm({ ...form, chave: event.target.value })} placeholder="ex.: preco_relaxante_60" /></div><div><Label>Tipo</Label><Select value={form.tipo} onValueChange={(valor) => setForm({ ...form, tipo: valor as TipoRecurso })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{(Object.keys(ROTULOS) as TipoRecurso[]).map((tipo) => <SelectItem key={tipo} value={tipo}>{ROTULOS[tipo]}</SelectItem>)}</SelectContent></Select></div></div>
          <div><Label>Título</Label><Input className="mt-1" value={form.titulo} onChange={(event) => setForm({ ...form, titulo: event.target.value })} placeholder="Nome visível para a administração" /></div>
          <div><Label>Conteúdo oficial</Label><Textarea className="mt-1 min-h-36" value={form.conteudo} onChange={(event) => setForm({ ...form, conteudo: event.target.value })} placeholder="Texto, tabela ou regra aprovada pela unidade" /></div>
          <div><Label>URL opcional</Label><Input className="mt-1" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} placeholder="https://..." /></div>
          <div className="grid gap-3 md:grid-cols-2"><div><Label>Válido a partir de</Label><Input className="mt-1" type="date" value={form.vigenciaInicio} onChange={(event) => setForm({ ...form, vigenciaInicio: event.target.value })} /></div><div><Label>Válido até</Label><Input className="mt-1" type="date" value={form.vigenciaFim} onChange={(event) => setForm({ ...form, vigenciaFim: event.target.value })} /></div></div>
          <div className="flex items-center justify-between rounded-lg border border-[#eadfca] bg-[#fdf9f1] p-3"><div><p className="text-sm font-medium">Recurso ativo</p><p className="text-xs text-muted-foreground">Somente fontes ativas e dentro da vigência são entregues ao agente.</p></div><Switch checked={form.ativo} onCheckedChange={(ativo) => setForm({ ...form, ativo })} /></div>
          <Button size="sm" disabled={salvar.isPending || !unidadeId || form.chave.trim().length < 2 || form.titulo.trim().length < 2} onClick={gravar}>{salvar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{recursoId ? "Salvar alterações" : "Cadastrar recurso"}</Button>
          {salvar.error && <p className="text-xs text-rose-700">{salvar.error.message}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
