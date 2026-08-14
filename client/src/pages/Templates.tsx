import { useState } from "react";
import { trpc } from "@/lib/trpc";
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
import { FileCheck2, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  pendente: "Pendente (Meta revisando)",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  rascunho: "outline",
  pendente: "secondary",
  aprovado: "default",
  rejeitado: "destructive",
};

interface FormBotao {
  texto: string;
}

export default function Templates() {
  const utils = trpc.useUtils();
  const templatesQuery = trpc.templates.list.useQuery();

  const [showNew, setShowNew] = useState(false);
  const [nome, setNome] = useState("");
  const [idioma, setIdioma] = useState("pt_BR");
  const [categoria, setCategoria] = useState<"MARKETING" | "UTILITY">("MARKETING");
  const [cabecalho, setCabecalho] = useState("");
  const [corpo, setCorpo] = useState("");
  const [rodape, setRodape] = useState("");
  const [botoes, setBotoes] = useState<FormBotao[]>([]);

  const resetForm = () => {
    setNome(""); setIdioma("pt_BR"); setCategoria("MARKETING");
    setCabecalho(""); setCorpo(""); setRodape(""); setBotoes([]);
  };

  const createMut = trpc.templates.create.useMutation({
    onSuccess: () => {
      utils.templates.list.invalidate();
      toast.success("Template enviado pra revisão da Meta — status \"pendente\"");
      setShowNew(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const sincronizarMut = trpc.templates.sincronizarStatus.useMutation({
    onSuccess: (r) => {
      utils.templates.list.invalidate();
      toast.success(r.atualizados > 0 ? `${r.atualizados} template(s) atualizado(s)` : "Nenhuma mudança de status");
    },
    onError: (e) => toast.error(e.message),
  });

  const salvar = () => {
    if (!nome.trim() || !corpo.trim()) {
      toast.error("Nome (técnico) e corpo são obrigatórios");
      return;
    }
    createMut.mutate({
      nome: nome.trim(),
      idioma,
      categoria,
      corpo: corpo.trim(),
      cabecalho: cabecalho.trim() || undefined,
      rodape: rodape.trim() || undefined,
      botoes: botoes.filter((b) => b.texto.trim()).map((b) => ({ tipo: "QUICK_REPLY" as const, texto: b.texto.trim() })),
    });
  };

  const templates = templatesQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <FileCheck2 className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Templates (Buddha Mkt)
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Mensagens pré-aprovadas pela Meta pra iniciar contato frio no WhatsApp oficial.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => sincronizarMut.mutate()} disabled={sincronizarMut.isPending}>
            {sincronizarMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Sincronizar status
          </Button>
          <Button size="sm" onClick={() => setShowNew(true)}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo template
          </Button>
        </div>
      </div>

      {templatesQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 text-center py-6">
              <FileCheck2 className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhum template criado ainda.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <Card key={t.id} className="border-border/50 shadow-sm">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{t.nome}</span>
                    <Badge variant={STATUS_VARIANT[t.status]} className="text-xs shrink-0">{STATUS_LABEL[t.status]}</Badge>
                    <Badge variant="outline" className="text-xs shrink-0">{t.idioma}</Badge>
                  </div>
                </div>
                {t.cabecalho && <p className="text-sm font-medium">{t.cabecalho}</p>}
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{t.corpo}</p>
                {t.rodape && <p className="text-xs text-muted-foreground/70">{t.rodape}</p>}
                {t.status === "rejeitado" && t.motivoRejeicao && (
                  <p className="text-xs text-destructive">Motivo: {t.motivoRejeicao}</p>
                )}
                {Array.isArray(t.botoes) && t.botoes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {t.botoes.map((b, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">{b.texto}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={(open) => { setShowNew(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Novo template</DialogTitle>
            <DialogDescription>
              Enviado direto pra revisão da Meta ao salvar. Aprovação costuma levar de minutos a algumas horas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Nome técnico * (sem espaço, ex: convite_unidade_nov25)</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} placeholder="convite_unidade_nov25" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Idioma</Label>
                <Input value={idioma} onChange={(e) => setIdioma(e.target.value)} placeholder="pt_BR" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Categoria</Label>
                <Select value={categoria} onValueChange={(v) => setCategoria(v as "MARKETING" | "UTILITY")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="UTILITY">Utilidade</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Cabeçalho (opcional, até 60 caracteres)</Label>
              <Input value={cabecalho} onChange={(e) => setCabecalho(e.target.value.slice(0, 60))} />
              <p className="text-xs text-muted-foreground text-right mt-0.5">{cabecalho.length}/60</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Corpo *</Label>
              <Textarea value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={4} placeholder="Texto curto e pessoal — sem link de grupo." />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Rodapé (opcional, até 60 caracteres)</Label>
              <Input value={rodape} onChange={(e) => setRodape(e.target.value.slice(0, 60))} />
              <p className="text-xs text-muted-foreground text-right mt-0.5">{rodape.length}/60</p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs text-muted-foreground">Botões de resposta rápida (até 3)</Label>
                {botoes.length < 3 && (
                  <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setBotoes([...botoes, { texto: "" }])}>
                    <Plus className="h-3 w-3 mr-1" /> Adicionar
                  </Button>
                )}
              </div>
              {botoes.map((b, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <Input
                    value={b.texto}
                    onChange={(e) => setBotoes(botoes.map((bt, idx) => idx === i ? { texto: e.target.value.slice(0, 25) } : bt))}
                    placeholder="Ex: Quero ver as ofertas"
                  />
                  <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={() => setBotoes(botoes.filter((_, idx) => idx !== i))}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Enviar pra revisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
