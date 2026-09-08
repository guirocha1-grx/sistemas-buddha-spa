import { useEffect, useMemo, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, ArrowLeftRight, Plus, Scale, Pencil, Check, X, Hash, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

function fmtCurrency(value: string | number) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function fmtCurrencySigned(value: number) {
  const texto = fmtCurrency(Math.abs(value));
  return value < 0 ? `-${texto}` : texto;
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
 * "Conta corrente" entre RBS/Satori e SSU/Agama — a lista em si não
 * filtra por unidade (mostra as duas juntas, sempre), mas o
 * UnidadeSelector aqui define a PERSPECTIVA de sinal do saldo corrido
 * e do saldo inicial: "logado" numa unidade, dinheiro que sai dela é
 * negativo, que entra é positivo — pedido do usuário 2026-09-08.
 */
export default function TransacoesEntreUnidades() {
  const { unidades, unidadeSelecionada } = useUnidade();
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [editandoSaldoInicial, setEditandoSaldoInicial] = useState(false);
  const [saldoInicialInput, setSaldoInicialInput] = useState("");

  const listQuery = trpc.transacoesEntreUnidades.list.useQuery();
  const saldoQuery = trpc.transacoesEntreUnidades.saldo.useQuery();
  const saldoInicialQuery = trpc.transacoesEntreUnidades.saldoInicial.useQuery();
  const transacoes = listQuery.data ?? [];
  const saldos = saldoQuery.data ?? [];
  const perspectiva = unidadeSelecionada?.id ?? null;

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

  const definirSaldoInicialMutation = trpc.transacoesEntreUnidades.definirSaldoInicial.useMutation({
    onSuccess: () => {
      toast.success("Saldo inicial atualizado.");
      setEditandoSaldoInicial(false);
      utils.transacoesEntreUnidades.saldoInicial.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function nomeUnidade(id: number) {
    return unidades.find((u) => u.id === id)?.nome ?? `Unidade ${id}`;
  }

  // Saldo inicial sempre guardado na perspectiva da unidade 1 (server) —
  // converte pra perspectiva de quem está vendo a tela agora.
  const saldoInicialUnidade1 = saldoInicialQuery.data?.valorUnidade1 ?? 0;
  const saldoInicialNaPerspectiva = perspectiva === 1 ? saldoInicialUnidade1 : -saldoInicialUnidade1;

  useEffect(() => {
    if (!editandoSaldoInicial) setSaldoInicialInput(saldoInicialNaPerspectiva.toFixed(2).replace(".", ","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saldoInicialNaPerspectiva, editandoSaldoInicial]);

  // Sinal de cada lançamento na perspectiva escolhida: dinheiro que SAI
  // da unidade selecionada (ela é a credora — mandou, tem a receber) é
  // negativo; que ENTRA (ela é a devedora — recebeu) é positivo.
  function sinalNaPerspectiva(t: { unidadeCredora: number; unidadeDevedora: number; valor: string | number }) {
    const valor = typeof t.valor === "string" ? parseFloat(t.valor) : t.valor;
    if (t.unidadeCredora === perspectiva) return -valor;
    if (t.unidadeDevedora === perspectiva) return valor;
    return 0;
  }

  // Saldo corrido em ordem cronológica (mais antigo primeiro, como um
  // extrato bancário de verdade) — o servidor manda mais recente
  // primeiro, então inverte antes de acumular.
  const transacoesComSaldo = useMemo(() => {
    const ordemCronologica = [...transacoes].reverse();
    let acumulado = saldoInicialNaPerspectiva;
    return ordemCronologica.map((t) => {
      acumulado += sinalNaPerspectiva(t);
      return { ...t, saldoCorrido: acumulado };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transacoes, saldoInicialNaPerspectiva, perspectiva]);

  const estatisticas = useMemo(() => {
    const pares = new Map<string, { de: number; para: number; total: number; qtd: number }>();
    for (const t of transacoes) {
      const chave = `${t.unidadeCredora}->${t.unidadeDevedora}`;
      const atual = pares.get(chave) ?? { de: t.unidadeCredora, para: t.unidadeDevedora, total: 0, qtd: 0 };
      atual.total += parseFloat(t.valor);
      atual.qtd += 1;
      pares.set(chave, atual);
    }
    return { porDirecao: Array.from(pares.values()), totalTransacoes: transacoes.length };
  }, [transacoes]);

  const saldoFinalNaPerspectiva = transacoesComSaldo.at(-1)?.saldoCorrido ?? saldoInicialNaPerspectiva;

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

  function salvarSaldoInicial() {
    if (!perspectiva) return;
    const valorNum = parseFloat(saldoInicialInput.replace(",", "."));
    if (Number.isNaN(valorNum)) { toast.error("Valor inválido."); return; }
    definirSaldoInicialMutation.mutate({ unidadeId: perspectiva, valor: valorNum });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Transações entre Unidades
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Rateio de despesa + transferência bancária real entre RBS e SSU, num só lugar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <UnidadeSelector />
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
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/50 shadow-sm py-2.5">
          <CardContent className="px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs"><Hash className="h-3.5 w-3.5" /> Transações</CardDescription>
            <div className="text-base font-bold mt-0.5">{estatisticas.totalTransacoes}</div>
          </CardContent>
        </Card>
        {estatisticas.porDirecao.map((p, i) => (
          <Card key={i} className="border-border/50 shadow-sm py-2.5">
            <CardContent className="px-4">
              <CardDescription className="flex items-center gap-1.5 text-xs">
                <TrendingUp className="h-3.5 w-3.5" /> {nomeUnidade(p.de)} → {nomeUnidade(p.para)}
              </CardDescription>
              <div className="text-base font-bold mt-0.5">{fmtCurrency(p.total)}</div>
              <div className="text-[11px] text-muted-foreground">{p.qtd} lançamento{p.qtd === 1 ? "" : "s"}</div>
            </CardContent>
          </Card>
        ))}
        <Card className="border-border/50 shadow-sm py-2.5">
          <CardContent className="px-4">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <Scale className="h-3.5 w-3.5" /> Saldo {perspectiva ? `(${nomeUnidade(perspectiva)})` : ""}
            </CardDescription>
            {saldos.length === 0 ? (
              <div className="text-sm text-muted-foreground mt-0.5">Nenhum saldo pendente.</div>
            ) : (
              <div className={`text-base font-bold mt-0.5 flex items-center gap-1 ${saldoFinalNaPerspectiva < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                {saldoFinalNaPerspectiva < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                {fmtCurrencySigned(saldoFinalNaPerspectiva)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {perspectiva && (
        <Card className="border-border/50 shadow-sm py-2.5">
          <CardContent className="px-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardDescription className="text-xs">Saldo inicial da conta corrente — perspectiva {nomeUnidade(perspectiva)}</CardDescription>
              {editandoSaldoInicial ? (
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    className="h-7 w-32 text-sm"
                    value={saldoInicialInput}
                    onChange={(e) => setSaldoInicialInput(e.target.value)}
                    placeholder="0,00"
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={definirSaldoInicialMutation.isPending} onClick={salvarSaldoInicial}>
                    {definirSaldoInicialMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditandoSaldoInicial(false)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="text-base font-bold mt-0.5">
                  {fmtCurrencySigned(saldoInicialNaPerspectiva)}
                  <span className="text-xs font-normal text-muted-foreground ml-1">(empréstimo/saldo anterior ao rastreamento)</span>
                </div>
              )}
            </div>
            {user?.role === "admin" && !editandoSaldoInicial && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditandoSaldoInicial(true)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}

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
                  {perspectiva && <TableHead className="text-xs text-right w-32">Saldo</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...transacoesComSaldo].reverse().map((t) => (
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
                    {perspectiva && (
                      <TableCell className={`text-right font-medium ${t.saldoCorrido < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                        {fmtCurrencySigned(t.saldoCorrido)}
                      </TableCell>
                    )}
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
