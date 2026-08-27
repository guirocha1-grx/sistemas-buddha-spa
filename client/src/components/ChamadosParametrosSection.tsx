import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { BellRing, Loader2, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type Tipo = "aguardando" | "sala" | "taa";
const ROTULOS: Record<Tipo, string> = { aguardando: "Situações de espera", sala: "Salas", taa: "TAA" };
const VAZIO = { tipo: "aguardando" as Tipo, nome: "", descricao: "", ordem: "" };

export function ChamadosParametrosSection({ unidadeId }: { unidadeId: number }) {
  const utils = trpc.useUtils();
  const { data: parametros, isLoading } = trpc.chamados.listAdmin.useQuery({ unidadeId });
  const [novo, setNovo] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [edicao, setEdicao] = useState({ nome: "", descricao: "", ordem: "" });
  const atualizar = trpc.chamados.atualizarParametro.useMutation({
    onSuccess: () => { setEditandoId(null); utils.chamados.listAdmin.invalidate({ unidadeId }); },
    onError: (erro) => toast.error(erro.message),
  });
  const criar = trpc.chamados.criarParametro.useMutation({
    onSuccess: () => { setNovo(VAZIO); utils.chamados.listAdmin.invalidate({ unidadeId }); toast.success("Parâmetro de chamado adicionado."); },
    onError: (erro) => toast.error(erro.message),
  });
  const porTipo = (tipo: Tipo) => (parametros ?? []).filter((item) => item.tipo === tipo);
  return <div className="border-t pt-3 mt-1 space-y-3">
    <Label className="flex items-center gap-1.5 text-sm"><BellRing className="h-3.5 w-3.5" /> Parâmetros de chamado</Label>
    <p className="text-xs text-muted-foreground">Estas opções aparecem no modal de chamado da unidade. Salas compartilhadas devem ser cadastradas como uma opção própria.</p>
    {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <div className="space-y-3">
      {(["aguardando", "sala", "taa"] as Tipo[]).map((tipo) => <div key={tipo} className="rounded-lg border p-2.5"><p className="mb-1.5 text-xs font-semibold text-primary">{ROTULOS[tipo]}</p><div className="space-y-1.5">{porTipo(tipo).map((item) => editandoId === item.id ? <div key={item.id} className="space-y-1.5 rounded-md bg-muted/40 p-2"><Input value={edicao.nome} onChange={(e) => setEdicao((valor) => ({ ...valor, nome: e.target.value }))} className="h-8" /><div className="grid grid-cols-2 gap-1.5"><Input placeholder="Descrição interna" value={edicao.descricao} onChange={(e) => setEdicao((valor) => ({ ...valor, descricao: e.target.value }))} className="h-8" /><Input type="number" min="0" placeholder="Ordem" value={edicao.ordem} onChange={(e) => setEdicao((valor) => ({ ...valor, ordem: e.target.value }))} className="h-8" /></div><div className="flex gap-2"><Button size="sm" className="h-7" disabled={!edicao.nome.trim() || atualizar.isPending} onClick={() => atualizar.mutate({ id: item.id, nome: edicao.nome.trim(), descricao: edicao.descricao.trim() || null, ordem: Number(edicao.ordem) || 0 })}>Salvar</Button><Button size="sm" variant="ghost" className="h-7" onClick={() => setEditandoId(null)}>Cancelar</Button></div></div> : <div key={item.id} className="flex items-center gap-2 rounded-md px-1 py-1"><div className="min-w-0 flex-1"><p className="truncate text-sm">{item.nome}</p>{item.descricao && <p className="truncate text-[11px] text-muted-foreground">{item.descricao}</p>}</div>{!item.ativo && <Badge variant="secondary">Inativo</Badge>}<Button size="sm" variant="ghost" className="h-7 px-2" title="Editar" onClick={() => { setEditandoId(item.id); setEdicao({ nome: item.nome, descricao: item.descricao ?? "", ordem: item.ordem.toString() }); }}><Pencil className="h-3.5 w-3.5" /></Button><Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={atualizar.isPending} onClick={() => atualizar.mutate({ id: item.id, nome: item.nome, ativo: !item.ativo })}>{item.ativo ? "Desativar" : "Ativar"}</Button></div>)}{porTipo(tipo).length === 0 && <p className="text-xs text-muted-foreground">Nenhuma opção cadastrada.</p>}</div></div>)}
    </div>}
    <div className="rounded-lg border border-dashed p-2.5 space-y-1.5"><p className="text-xs font-medium">Adicionar opção</p><div className="grid gap-1.5 sm:grid-cols-2"><Select value={novo.tipo} onValueChange={(valor) => setNovo((item) => ({ ...item, tipo: valor as Tipo }))}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent>{(["aguardando", "sala", "taa"] as Tipo[]).map((tipo) => <SelectItem key={tipo} value={tipo}>{ROTULOS[tipo]}</SelectItem>)}</SelectContent></Select><Input placeholder="Nome exibido" value={novo.nome} onChange={(e) => setNovo((item) => ({ ...item, nome: e.target.value }))} className="h-8" /><Input placeholder="Descrição interna (opcional)" value={novo.descricao} onChange={(e) => setNovo((item) => ({ ...item, descricao: e.target.value }))} className="h-8" /><Input type="number" min="0" placeholder="Ordem" value={novo.ordem} onChange={(e) => setNovo((item) => ({ ...item, ordem: e.target.value }))} className="h-8" /></div><Button size="sm" variant="outline" disabled={!novo.nome.trim() || criar.isPending} onClick={() => criar.mutate({ unidadeId, tipo: novo.tipo, nome: novo.nome.trim(), descricao: novo.descricao.trim() || null, ordem: Number(novo.ordem) || 0 })}>{criar.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}Adicionar</Button></div>
  </div>;
}
