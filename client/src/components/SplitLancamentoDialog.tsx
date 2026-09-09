import React, { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useUnidade } from "@/contexts/UnidadeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DescricaoCombobox, type DreDescricaoOption } from "@/components/DescricaoCombobox";
import { SeletorMes } from "@/components/SeletorMes";
import type { DreCategoriaOption } from "@/components/CategoriaCombobox";
import { Plus, Trash2, Loader2, CalendarRange } from "lucide-react";
import { toast } from "sonner";

export interface TransacaoParaSplit {
  id: number;
  valor: string;
  titulo: string | null;
  unidadeId: number;
  dataEntrada: string;
}

export interface SplitExistente {
  dreDescricaoId: number;
  valor: string;
  unidadeId: number;
  observacao: string | null;
  mesReferencia: string;
}

interface LinhaSplitForm {
  dreDescricaoId: number | null;
  valor: string;
  unidadeId: number;
  observacao: string;
  mesReferencia: string;
}

function fmt(n: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function parseValor(raw: string): number {
  const n = parseFloat(raw.replace(",", "."));
  return Number.isNaN(n) ? 0 : n;
}

/** "AAAA-MM" -> próximo mês, cuidando da virada de ano. */
function proximoMes(mesAno: string): string {
  const [ano, mes] = mesAno.split("-").map(Number);
  const d = new Date(ano, mes - 1 + 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Divide uma transação do extrato em N linhas, cada uma com sua
 * Descrição e (quando o gasto é rateado entre unidades) sua própria
 * unidade — diferente da unidade da transação original. Reaproveita o
 * mesmo DescricaoCombobox usado na tabela de Extratos.
 *
 * Cada linha também tem seu próprio mês de competência ("Dividir em
 * vários meses" gera N linhas de uma vez, uma por mês — pra ratear uma
 * licença anual, por exemplo).
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
  const [dividindoLinha, setDividindoLinha] = useState<number | null>(null);
  const [qtdMeses, setQtdMeses] = useState("12");
  const [mesInicialDivisao, setMesInicialDivisao] = useState("");

  const mesTransacao = transacao?.dataEntrada.slice(0, 7) ?? "";

  useEffect(() => {
    if (!open || !transacao) return;
    if (splitsExistentes.length > 0) {
      setLinhas(splitsExistentes.map((s) => ({
        dreDescricaoId: s.dreDescricaoId,
        valor: s.valor,
        unidadeId: s.unidadeId,
        observacao: s.observacao ?? "",
        mesReferencia: s.mesReferencia || mesTransacao,
      })));
    } else {
      setLinhas([{ dreDescricaoId: null, valor: transacao.valor, unidadeId: transacao.unidadeId, observacao: "", mesReferencia: mesTransacao }]);
    }
    setDividindoLinha(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      mesReferencia: mesTransacao,
    }]);
  }

  function removerLinha(i: number) {
    if (linhas.length <= 1) return;
    setLinhas(linhas.filter((_, idx) => idx !== i));
    if (dividindoLinha === i) setDividindoLinha(null);
  }

  function abrirDivisaoEmMeses(i: number) {
    setDividindoLinha(i);
    setQtdMeses("12");
    setMesInicialDivisao(linhas[i]?.mesReferencia || mesTransacao);
  }

  /** Substitui a linha `i` por N linhas mensais — mesma Descrição/Unidade, valor dividido exato em centavos (resto vai pra última). */
  function aplicarDivisaoEmMeses(i: number) {
    const n = parseInt(qtdMeses, 10);
    const linha = linhas[i];
    if (!linha || !Number.isInteger(n) || n < 2 || n > 60) {
      toast.error("Informe uma quantidade de meses válida (2 a 60).");
      return;
    }
    const totalCentavos = Math.round(parseValor(linha.valor) * 100);
    const baseCentavos = Math.floor(totalCentavos / n);
    const restoCentavos = totalCentavos - baseCentavos * n;

    const geradas: LinhaSplitForm[] = [];
    let mes = mesInicialDivisao || mesTransacao;
    for (let idx = 0; idx < n; idx++) {
      const centavos = baseCentavos + (idx === n - 1 ? restoCentavos : 0);
      geradas.push({
        dreDescricaoId: linha.dreDescricaoId,
        valor: (centavos / 100).toFixed(2).replace(".", ","),
        unidadeId: linha.unidadeId,
        observacao: linha.observacao,
        mesReferencia: mes,
      });
      mes = proximoMes(mes);
    }

    setLinhas([...linhas.slice(0, i), ...geradas, ...linhas.slice(i + 1)]);
    setDividindoLinha(null);
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
        mesReferencia: l.mesReferencia || undefined,
      })),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dividir lançamento</DialogTitle>
          <DialogDescription>
            {transacao.titulo || "Transação"} — {fmt(valorTransacao)}. Cada linha pode ter uma Descrição, uma unidade
            diferente (rateio entre RBS e SSU) e um mês de competência diferente (rateio entre meses, ex.: licença anual).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {linhas.map((linha, i) => (
            <div key={i} className="border border-border/50 rounded-md p-2 space-y-1.5">
              <div className="flex items-start gap-1.5">
                <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-1.5 flex-1">
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
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Mês competência</Label>
                    <SeletorMes
                      size="sm"
                      value={linha.mesReferencia}
                      onChange={(mes) => atualizarLinha(i, { mesReferencia: mes })}
                    />
                  </div>
                  <div className="col-span-4 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Observação (opcional)</Label>
                    <Input
                      className="h-7 text-xs"
                      placeholder='Ex.: "Metade pro SSU"'
                      value={linha.observacao}
                      onChange={(e) => atualizarLinha(i, { observacao: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0 mt-4">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => (dividindoLinha === i ? setDividindoLinha(null) : abrirDivisaoEmMeses(i))}
                    title="Dividir em vários meses"
                  >
                    <CalendarRange className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => removerLinha(i)}
                    disabled={linhas.length <= 1}
                    title="Remover linha"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {dividindoLinha === i && (
                <div className="flex flex-wrap items-end gap-2 rounded-md bg-muted/40 p-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Dividir em quantos meses</Label>
                    <Input className="h-7 w-20 text-sm" value={qtdMeses} onChange={(e) => setQtdMeses(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">A partir do mês</Label>
                    <SeletorMes size="sm" value={mesInicialDivisao} onChange={setMesInicialDivisao} />
                  </div>
                  <Button type="button" size="sm" className="h-7 text-xs" onClick={() => aplicarDivisaoEmMeses(i)}>
                    Aplicar
                  </Button>
                  <span className="text-[10px] text-muted-foreground">
                    Substitui esta linha por N linhas mensais, mesma Descrição/Unidade, valor dividido exato (sobra de centavo fica no último mês).
                  </span>
                </div>
              )}
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
