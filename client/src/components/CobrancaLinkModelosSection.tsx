import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Loader2, Plus, Repeat2 } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";

function lerValor(valor: string) {
  const numero = Number(valor.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) && numero > 0 ? Math.round(numero * 100) / 100 : null;
}

export function CobrancaLinkModelosSection({ unidadeId }: { unidadeId: number }) {
  const utils = trpc.useUtils();
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [formaPagamentoInformada, setFormaPagamentoInformada] = useState("Não especificada");
  const [parcelas, setParcelas] = useState(1);
  const modelos = trpc.cobrancasLink.modelos.list.useQuery({ unidadeId, incluirInativos: true });
  const criar = trpc.cobrancasLink.modelos.create.useMutation({
    onSuccess: () => {
      setTitulo(""); setDescricao(""); setValor(""); setFormaPagamentoInformada("Não especificada"); setParcelas(1);
      utils.cobrancasLink.modelos.list.invalidate({ unidadeId });
      toast.success("Item recorrente cadastrado.");
    },
    onError: (erro) => toast.error(erro.message),
  });
  const atualizar = trpc.cobrancasLink.modelos.update.useMutation({
    onSuccess: () => utils.cobrancasLink.modelos.list.invalidate({ unidadeId }),
    onError: (erro) => toast.error(erro.message),
  });
  const valorNumerico = lerValor(valor);
  return <div className="rounded-lg border border-primary/15 bg-primary/[0.025] p-3 space-y-3">
    <div><p className="flex items-center gap-1.5 text-xs font-medium text-primary"><Repeat2 className="h-3.5 w-3.5" />Itens recorrentes da unidade</p><p className="mt-0.5 text-xs text-muted-foreground">Eles só preenchem o modal. Cada cobrança continuará criando um Link individual e rastreável.</p></div>
    <div className="grid gap-2 sm:grid-cols-2"><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Item ou serviço" /><Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor, ex.: 419,00" /><Textarea className="sm:col-span-2" rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição opcional" /><select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={formaPagamentoInformada} onChange={(e) => setFormaPagamentoInformada(e.target.value)}><option>Não especificada</option><option>Pix</option><option>Cartão</option><option>Pix ou cartão</option></select><select className="h-9 rounded-md border border-input bg-transparent px-3 text-sm" value={parcelas} onChange={(e) => setParcelas(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? "À vista" : `Até ${n}x`}</option>)}</select><Button size="sm" type="button" disabled={!titulo.trim() || !valorNumerico || criar.isPending} onClick={() => valorNumerico && criar.mutate({ unidadeId, titulo: titulo.trim(), descricao: descricao.trim() || undefined, valor: valorNumerico, formaPagamentoInformada: formaPagamentoInformada as "Não especificada" | "Pix" | "Cartão" | "Pix ou cartão", parcelas })}>{criar.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}Adicionar</Button></div>
    {modelos.isLoading ? <p className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />Carregando itens...</p> : modelos.data?.length ? <div className="space-y-1.5">{modelos.data.map((modelo) => <div className="flex items-center justify-between gap-2 rounded-md bg-background px-2.5 py-2 text-xs" key={modelo.id}><div className="min-w-0"><p className="truncate font-medium">{modelo.titulo}</p><p className="text-muted-foreground">R$ {Number(modelo.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}{modelo.formaPagamentoInformada ? ` · ${modelo.formaPagamentoInformada}` : ""}{modelo.parcelas > 1 ? ` · até ${modelo.parcelas}x` : " · à vista"}</p></div><Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" disabled={atualizar.isPending} onClick={() => atualizar.mutate({ id: modelo.id, unidadeId, titulo: modelo.titulo, descricao: modelo.descricao ?? undefined, valor: Number(modelo.valor), formaPagamentoInformada: (modelo.formaPagamentoInformada ?? "Não especificada") as "Não especificada" | "Pix" | "Cartão" | "Pix ou cartão", parcelas: modelo.parcelas, ativo: !modelo.ativo, ordem: modelo.ordem })}>{modelo.ativo ? "Desativar" : "Ativar"}</Button></div>)}</div> : <p className="text-xs text-muted-foreground">Nenhum item cadastrado ainda.</p>}
  </div>;
}
