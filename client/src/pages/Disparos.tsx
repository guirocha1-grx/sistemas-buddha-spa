import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Megaphone, Plus, Search, Send } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  enviando: "Enviando",
  concluido: "Concluído",
  erro: "Erro",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  rascunho: "outline",
  enviando: "secondary",
  concluido: "default",
  erro: "destructive",
};

export default function Disparos() {
  const utils = trpc.useUtils();
  const disparosQuery = trpc.disparos.list.useQuery();
  const templatesQuery = trpc.templates.list.useQuery();
  const unidadeBuddhaMktQuery = trpc.disparos.unidadeBuddhaMkt.useQuery();
  const clientesQuery = trpc.clientes.listImportados.useQuery();
  const fluxosQuery = trpc.fluxos.list.useQuery(
    { unidadeId: unidadeBuddhaMktQuery.data?.id ?? 0 },
    { enabled: !!unidadeBuddhaMktQuery.data?.id },
  );

  const [showNew, setShowNew] = useState(false);
  const [nome, setNome] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [fluxoRespostaId, setFluxoRespostaId] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  const templatesAprovados = (templatesQuery.data ?? []).filter((t) => t.status === "aprovado");

  const termoBusca = busca.trim().toLowerCase();
  const clientesFiltrados = useMemo(() => {
    const lista = clientesQuery.data ?? [];
    if (!termoBusca) return lista;
    return lista.filter((c) =>
      c.nome.toLowerCase().includes(termoBusca) || (c.celular ?? "").toLowerCase().includes(termoBusca),
    );
  }, [clientesQuery.data, termoBusca]);

  const resetForm = () => {
    setNome(""); setTemplateId(""); setFluxoRespostaId(""); setBusca(""); setSelecionados(new Set());
  };

  const createMut = trpc.disparos.create.useMutation({
    onSuccess: () => {
      utils.disparos.list.invalidate();
      toast.success("Disparo criado — clique em \"Enviar\" na lista quando estiver pronto");
      setShowNew(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const enviarMut = trpc.disparos.enviar.useMutation({
    onSuccess: (r) => {
      utils.disparos.list.invalidate();
      toast.success(`Envio concluído: ${r.enviados} enviado(s), ${r.erros} erro(s)`);
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleCliente = (id: number) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const marcarTodosFiltrados = () => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      clientesFiltrados.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const salvar = () => {
    if (!nome.trim() || !templateId) {
      toast.error("Nome e template são obrigatórios");
      return;
    }
    if (selecionados.size === 0) {
      toast.error("Selecione pelo menos um cliente");
      return;
    }
    createMut.mutate({
      nome: nome.trim(),
      templateId: Number(templateId),
      fluxoRespostaId: fluxoRespostaId ? Number(fluxoRespostaId) : undefined,
      clienteIds: Array.from(selecionados),
    });
  };

  const disparos = disparosQuery.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Disparos (Buddha Mkt)
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Campanhas de WhatsApp oficial pra base geral — quem responder cai no fluxo-roteador.
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowNew(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo disparo
        </Button>
      </div>

      {disparosQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : disparos.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 text-center py-6">
              <Megaphone className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Nenhum disparo criado ainda.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {disparos.map((d) => (
            <Card key={d.id} className="border-border/50 shadow-sm">
              <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{d.nome}</span>
                    <Badge variant={STATUS_VARIANT[d.status]} className="text-xs shrink-0">{STATUS_LABEL[d.status]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {d.totalEnviados}/{d.totalDestinatarios} enviado(s){d.totalErros > 0 ? ` · ${d.totalErros} erro(s)` : ""}
                  </p>
                </div>
                {d.status === "rascunho" && (
                  <Button
                    size="sm"
                    onClick={() => enviarMut.mutate({ id: d.id })}
                    disabled={enviarMut.isPending}
                  >
                    {enviarMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                    Enviar
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showNew} onOpenChange={(open) => { setShowNew(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Novo disparo</DialogTitle>
            <DialogDescription>
              Manda o template escolhido pra todos os clientes selecionados. Quem responder é roteado pelo fluxo escolhido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto flex-1 min-h-0">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Nome da campanha *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Zen Friday — Novembro" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Template (aprovado) *</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Escolha um template" /></SelectTrigger>
                  <SelectContent>
                    {templatesAprovados.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum template aprovado ainda</div>
                    ) : templatesAprovados.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Fluxo-resposta (opcional)</Label>
                <Select value={fluxoRespostaId} onValueChange={setFluxoRespostaId}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    {(fluxosQuery.data ?? []).map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-2">
              <div className="flex items-center justify-between mb-2 gap-2">
                <Label className="text-xs text-muted-foreground">
                  Destinatários * ({selecionados.size} selecionado{selecionados.size !== 1 ? "s" : ""})
                </Label>
                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={marcarTodosFiltrados}>
                  Marcar todos filtrados
                </Button>
              </div>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="pl-8 h-8" placeholder="Buscar por nome ou celular" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              <div className="border rounded-md max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Celular</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientesQuery.isLoading ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-4">Carregando...</TableCell></TableRow>
                    ) : clientesFiltrados.slice(0, 200).map((c) => (
                      <TableRow key={c.id} className="cursor-pointer" onClick={() => toggleCliente(c.id)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selecionados.has(c.id)} onCheckedChange={() => toggleCliente(c.id)} />
                        </TableCell>
                        <TableCell className="text-sm">{c.nome}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{c.celular || c.telefone || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {clientesFiltrados.length > 200 && (
                <p className="text-xs text-muted-foreground mt-1">Mostrando os primeiros 200 — refine a busca pra ver mais.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Criar disparo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
