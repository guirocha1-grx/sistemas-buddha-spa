import React, { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useUnidade } from "@/contexts/UnidadeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DescricaoCombobox, type DreDescricaoOption } from "@/components/DescricaoCombobox";
import type { DreCategoriaOption } from "@/components/CategoriaCombobox";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface TransacaoParaSplit {
  id: number;
  valor: string;
  titulo: string | null;
  unidadeId: number;
}

export interface SplitExistente {
  dreDescricaoId: number;
  valor: string;
  unidadeId: number;
  observacao: string | null;
}

interface LinhaSplitForm {
  dreDescricaoId: number | null;
  valor: string;
  unidadeId: number;
  observacao: string;
}

function fmt(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function parseValor(raw: string): number {
  const n = parseFloat(raw.replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Divide uma transação do extrato em N linhas, cada uma com sua
 * Descrição e (quando o gasto é rateado entre unidades) sua própria
 * unidade — diferente da unidade da transação original. Reaproveita o
 * mesmo DescricaoCombobox usado na tabela de Extratos.
 */
export function SplitLancamentoDialog({
  open,
  onOpenChange,
  transacao,
  splitsExistentes,
  descricoes,
  categorias,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transacao: TransacaoParaSplit | null;
  splitsExistentes: SplitExistente[];
  descricoes: DreDescricaoOption[];
  categorias: DreCategoriaOption[];
}) {
  const { unidades } = useUnidade();
  const utils = trpc.useUtils();
  const [linhas, setLinhas] = useState<LinhaSplitForm[]>([]);

  useEffect(() => {
    if (!open || !transacao) return;
    if (splitsExistentes.length > 0) {
      setLinhas(splitsExistentes.map((s) => ({
        dreDescricaoId: s.dreDescricaoId,
        valor: s.valor,
        unidadeId: s.unidadeId,
        observacao: s.observacao ?? "",
      })));
    } else {
      setLinhas([{ dreDescricaoId: null, valor: transacao.valor, unidadeId: transacao.unidadeId, observacao: "" }]);
    }
  }, [open, transacao?.id]);

  const salvarMutation = trpc.inter.splits.salvar.useMutation({
    onSuccess: () => {
      toast.success("Lançamento dividido.");
      utils.inter.extratos.invalidate();
      utils.inter.splits.list.invalidate();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  const excluirMutation = trpc.inter.splits.excluir.useMutation({
    onSuccess: () => {
      toast.success("Split removido.");
      utils.inter.extratos.invalidate();
      utils.inter.splits.list.invalidate();
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message),
  });

  if (!transacao) return null;

  const valorTransacao = parseValor(transacao.valor);
  const somaLinhas = linhas.reduce((s, l) => s + parseValor(l.valor), 0);
  const restante = valorTransacao - somaLinhas;
  const podeSalvar = Math.abs(restante) < 0.01 && linhas.every((l) => l.dreDescricaoId !== null && parseValor(l.valor) > 0);

  function atualizarLinha(i: number, dados: Partial<LinhaSplitForm>) {
    setLinhas(linhas.map((l, idx) => (idx === i ? { ...l, ...dados } : l)));
  }

  function adicionarLinha() {
    setLinhas([...linhas, {
      dreDescricaoId: null,
      valor: restante > 0 ? restante.toFixed(2).replace(".", ",") : "",
      unidadeId: transacao!.unidadeId,
      observacao: "",
    }]);
  }

  function removerLinha(i: number) {
    if (linhas.length <= 1) return;
    setLinhas(linhas.filter((_, idx) => idx !== i));
  }

  function salvar() {
    if (!podeSalvar) return;
    salvarMutation.mutate({
      interExtratoId: transacao!.id,
      linhas: linhas.map((l) => ({
        dreDescricaoId: l.dreDescricaoId!,
        valor: parseValor(l.valor),
        unidadeId: l.unidadeId,
        observacao: l.observacao.trim() || undefined,
      })),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dividir lançamento</DialogTitle>
          <DialogDescription>
            {transacao.titulo || "Transação"} — {fmt(valorTransacao)}. Cada linha pode ter uma Descrição e uma unidade
            diferentes (use a unidade pra ratear um gasto entre RBS e SSU).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {linhas.map((linha, i) => (
            <div key={i} className="flex items-start gap-1.5 border border-border/50 rounded-md p-2">
              <div className="grid grid-cols-[1fr_auto_1fr] gap-1.5 flex-1">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Valor</Label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="0,00"
                    value={linha.valor}
                    onChange={(e) => atualizarLinha(i, { valor: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Descrição</Label>
                  <DescricaoCombobox
                    descricoes={descricoes}
                    categorias={categorias}
                    value={linha.dreDescricaoId}
                    onChange={(id) => atualizarLinha(i, { dreDescricaoId: id })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Unidade</Label>
                  <Select value={String(linha.unidadeId)} onValueChange={(v) => atualizarLinha(i, { unidadeId: Number(v) })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {unidades.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Observação (opcional)</Label>
                  <Input
                    className="h-7 text-xs"
                    placeholder='Ex.: "Metade pro SSU"'
                    value={linha.observacao}
                    onChange={(e) => atualizarLinha(i, { observacao: e.target.value })}
                  />
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0 mt-4"
                onClick={() => removerLinha(i)}
                disabled={linhas.length <= 1}
                title="Remover linha"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={adicionarLinha}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Adicionar linha
          </Button>
        </div>

        <div className={`text-sm font-medium ${Math.abs(restante) < 0.01 ? "text-green-700" : "text-amber-700"}`}>
          Restante a alocar: {fmt(restante)}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {splitsExistentes.length > 0 ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => excluirMutation.mutate({ interExtratoId: transacao!.id })}
              disabled={excluirMutation.isPending}
            >
              {excluirMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
              Remover split
            </Button>
          ) : <span />}
          <Button onClick={salvar} disabled={!podeSalvar || salvarMutation.isPending}>
            {salvarMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Salvar divisão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
