import { useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, ArrowLeftRight, Plus, Scale } from "lucide-react";
import { toast } from "sonner";

function fmtCurrency(value: string | number) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const LABEL_TIPO: Record<string, string> = {
  rateio_despesa: "Rateio de despesa",
  transferencia_real: "Transferência bancária",
  manual: "Manual",
};

const COR_TIPO: Record<string, string> = {
  rateio_despesa: "border-purple-400 text-purple-700",
  transferencia_real: "border-blue-400 text-blue-700",
  manual: "border-amber-400 text-amber-700",
};

const FORM_VAZIO = { data: new Date().toISOString().split("T")[0], unidadeCredora: "", unidadeDevedora: "", valor: "", descricao: "" };

/**
 * "Conta corrente" entre RBS/Satori e SSU/Agama — não usa
 * UnidadeSelector nem filtra por unidade selecionada de propósito,
 * já que é inerentemente uma visão das duas unidades juntas.
 */
export default function TransacoesEntreUnidades() {
  const { unidades } = useUnidade();
  const utils = trpc.useUtils();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);

  const listQuery = trpc.transacoesEntreUnidades.list.useQuery();
  const saldoQuery = trpc.transacoesEntreUnidades.saldo.useQuery();
  const transacoes = listQuery.data ?? [];
  const saldos = saldoQuery.data ?? [];

  const criarMutation = trpc.transacoesEntreUnidades.criar.useMutation({
    onSuccess: () => {
      toast.success("Lançamento registrado.");
      setModalOpen(false);
      setForm(FORM_VAZIO);
      utils.transacoesEntreUnidades.list.invalidate();
      utils.transacoesEntreUnidades.saldo.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function nomeUnidade(id: number) {
    return unidades.find((u) => u.id === id)?.nome ?? `Unidade ${id}`;
  }

  function salvar() {
    const valorNum = parseFloat(form.valor.replace(",", "."));
    if (!form.unidadeCredora || !form.unidadeDevedora || !form.descricao.trim() || !valorNum || valorNum <= 0) return;
    if (form.unidadeCredora === form.unidadeDevedora) {
      toast.error("A unidade credora e devedora precisam ser diferentes.");
      return;
    }
    criarMutation.mutate({
      data: form.data,
      unidadeCredora: Number(form.unidadeCredora),
      unidadeDevedora: Number(form.unidadeDevedora),
      valor: valorNum,
      descricao: form.descricao.trim(),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Transações entre Unidades
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Rateio de despesa + transferência bancária real entre RBS e SSU, num só lugar.
          </p>
        </div>
        <Dialog open={modalOpen} onOpenChange={(v) => { setModalOpen(v); if (!v) setForm(FORM_VAZIO); }}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-3.5 w-3.5 mr-1.5" /> Lançamento manual</Button>
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Lançamento manual</DialogTitle>
              <DialogDescription>Pra casos sem transação bancária por trás — ex.: mercadoria que voltou de uma unidade pra outra.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Data</Label>
                <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Quem "pagou" (credora, tem a receber)</Label>
                <Select value={form.unidadeCredora} onValueChange={(v) => setForm({ ...form, unidadeCredora: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {unidades.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Quem deve (devedora)</Label>
                <Select value={form.unidadeDevedora} onValueChange={(v) => setForm({ ...form, unidadeDevedora: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {unidades.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Valor</Label>
                <Input placeholder="0,00" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Descrição</Label>
                <Input placeholder='Ex.: "Mercadoria devolvida"' value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={salvar} disabled={criarMutation.isPending}>
                {criarMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {saldoQuery.isLoading ? (
          <Card className="border-border/50 shadow-sm py-2.5"><CardContent className="px-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></CardContent></Card>
        ) : saldos.length === 0 ? (
          <Card className="border-border/50 shadow-sm py-2.5">
            <CardContent className="px-4">
              <CardDescription className="flex items-center gap-1.5 text-xs"><Scale className="h-3.5 w-3.5" /> Saldo entre unidades</CardDescription>
              <div className="text-sm text-muted-foreground mt-0.5">Nenhum saldo pendente.</div>
            </CardContent>
          </Card>
        ) : (
          saldos.map((s, i) => (
            <Card key={i} className="border-border/50 shadow-sm py-2.5">
              <CardContent className="px-4">
                <CardDescription className="flex items-center gap-1.5 text-xs"><Scale className="h-3.5 w-3.5" /> Saldo entre unidades</CardDescription>
                <div className="text-base font-bold mt-0.5">
                  {nomeUnidade(s.unidadeDevedora)} deve {fmtCurrency(s.saldo)} pra {nomeUnidade(s.unidadeCredora)}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardContent>
          {listQuery.isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : transacoes.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground flex flex-col items-center gap-2">
              <ArrowLeftRight className="h-8 w-8 opacity-40" />
              Nenhuma transação entre unidades ainda.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-24">Data</TableHead>
                  <TableHead className="text-xs w-40">Tipo</TableHead>
                  <TableHead className="text-xs">De → Para</TableHead>
                  <TableHead className="text-xs">Descrição</TableHead>
                  <TableHead className="text-xs text-right w-32">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transacoes.map((t) => (
                  <TableRow key={t.id} className="text-sm">
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(t.data)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs font-normal ${COR_TIPO[t.tipo] ?? ""}`}>
                        {LABEL_TIPO[t.tipo] ?? t.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{nomeUnidade(t.unidadeCredora)} → {nomeUnidade(t.unidadeDevedora)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.descricao}</TableCell>
                    <TableCell className="text-right font-medium">{fmtCurrency(t.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
