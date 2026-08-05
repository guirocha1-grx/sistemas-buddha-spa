import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Settings2, ListTree } from "lucide-react";
import { toast } from "sonner";

const SECOES: { value: string; label: string }[] = [
  { value: "receitas", label: "Receitas" },
  { value: "impostos", label: "Impostos" },
  { value: "custos_diretos", label: "Custos Diretos" },
  { value: "despesas_pessoal", label: "Despesas com Pessoal" },
  { value: "marketing", label: "Marketing" },
  { value: "despesas_administrativas", label: "Despesas Administrativas" },
  { value: "despesas_financeiras", label: "Despesas Financeiras" },
  { value: "devolucoes", label: "Devoluções" },
  { value: "excluido", label: "Excluído do DRE" },
];

function labelSecao(secao: string) {
  return SECOES.find((s) => s.value === secao)?.label ?? secao;
}

const REGRA_FORM_VAZIO = { padrao: "", dreCategoriaId: "", valorMin: "", valorMax: "", alertaSeRepetirNoMes: false };

export default function Parametros() {
  const utils = trpc.useUtils();

  const categoriasQuery = trpc.dreCategorias.list.useQuery();
  const categorias = categoriasQuery.data ?? [];

  const regrasQuery = trpc.dreRegras.list.useQuery();
  const regras = regrasQuery.data ?? [];

  // ===== Nova categoria =====
  const [categoriaModalOpen, setCategoriaModalOpen] = useState(false);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState("");
  const [novaCategoriaSecao, setNovaCategoriaSecao] = useState("despesas_administrativas");

  const criarCategoriaMutation = trpc.dreCategorias.criar.useMutation({
    onSuccess: () => {
      toast.success("Categoria criada.");
      setNovaCategoriaNome("");
      setCategoriaModalOpen(false);
      utils.dreCategorias.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ===== Nova/editar regra =====
  const [regraModalOpen, setRegraModalOpen] = useState(false);
  const [regraEditandoId, setRegraEditandoId] = useState<number | null>(null);
  const [regraForm, setRegraForm] = useState(REGRA_FORM_VAZIO);

  const criarRegraMutation = trpc.dreRegras.criar.useMutation({
    onSuccess: () => {
      toast.success("Regra criada — já vale pro próximo import ou reprocessamento.");
      setRegraModalOpen(false);
      utils.dreRegras.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const atualizarRegraMutation = trpc.dreRegras.atualizar.useMutation({
    onSuccess: () => {
      toast.success("Regra atualizada.");
      setRegraModalOpen(false);
      utils.dreRegras.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const ativarDesativarMutation = trpc.dreRegras.ativarDesativar.useMutation({
    onSuccess: () => utils.dreRegras.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  function abrirNovaRegra() {
    setRegraEditandoId(null);
    setRegraForm(REGRA_FORM_VAZIO);
    setRegraModalOpen(true);
  }

  function abrirEditarRegra(r: typeof regras[number]) {
    setRegraEditandoId(r.id);
    setRegraForm({
      padrao: r.padrao,
      dreCategoriaId: String(r.dreCategoriaId),
      valorMin: r.valorMin ?? "",
      valorMax: r.valorMax ?? "",
      alertaSeRepetirNoMes: r.alertaSeRepetirNoMes === "true",
    });
    setRegraModalOpen(true);
  }

  function salvarRegra() {
    if (!regraForm.padrao.trim() || !regraForm.dreCategoriaId) return;
    const dados = {
      padrao: regraForm.padrao.trim(),
      dreCategoriaId: Number(regraForm.dreCategoriaId),
      valorMin: regraForm.valorMin ? parseFloat(regraForm.valorMin.replace(",", ".")) : undefined,
      valorMax: regraForm.valorMax ? parseFloat(regraForm.valorMax.replace(",", ".")) : undefined,
      alertaSeRepetirNoMes: regraForm.alertaSeRepetirNoMes,
    };
    if (regraEditandoId) {
      atualizarRegraMutation.mutate({ id: regraEditandoId, ...dados });
    } else {
      criarRegraMutation.mutate(dados);
    }
  }

  const categoriasPorSecao = SECOES.map((s) => ({
    ...s,
    itens: categorias.filter((c) => c.secao === s.value),
  })).filter((s) => s.itens.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Parâmetros
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Como o sistema identifica os lançamentos do extrato automaticamente, e o plano de contas do DRE
        </p>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                <Settings2 className="h-4 w-4" /> Regras de categorização
              </CardTitle>
              <CardDescription>Nome no extrato → categoria do DRE. Aplicadas na importação e no "Reprocessar pendentes".</CardDescription>
            </div>
            <Dialog open={regraModalOpen} onOpenChange={setRegraModalOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={abrirNovaRegra}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Nova regra
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{regraEditandoId ? "Editar regra" : "Nova regra"}</DialogTitle>
                  <DialogDescription>
                    O padrão é comparado (sem diferenciar maiúsculas) contra o tipo + descrição da transação. Faixa de valor é opcional —
                    útil quando a mesma contraparte significa coisas diferentes dependendo do valor.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Padrão de texto</Label>
                    <Input
                      placeholder='Ex.: "MDS SERVICOS TERCEIRIZADOS"'
                      value={regraForm.padrao}
                      onChange={(e) => setRegraForm({ ...regraForm, padrao: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Categoria DRE</Label>
                    <Select value={regraForm.dreCategoriaId} onValueChange={(v) => setRegraForm({ ...regraForm, dreCategoriaId: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {categorias.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Valor mínimo (opcional)</Label>
                      <Input
                        placeholder="0,00"
                        value={regraForm.valorMin}
                        onChange={(e) => setRegraForm({ ...regraForm, valorMin: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Valor máximo (opcional)</Label>
                      <Input
                        placeholder="0,00"
                        value={regraForm.valorMax}
                        onChange={(e) => setRegraForm({ ...regraForm, valorMax: e.target.value })}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={regraForm.alertaSeRepetirNoMes}
                      onCheckedChange={(v) => setRegraForm({ ...regraForm, alertaSeRepetirNoMes: !!v })}
                    />
                    Alertar se repetir no mesmo mês (despesa mensal única esperada)
                  </label>
                </div>
                <DialogFooter>
                  <Button
                    onClick={salvarRegra}
                    disabled={!regraForm.padrao.trim() || !regraForm.dreCategoriaId || criarRegraMutation.isPending || atualizarRegraMutation.isPending}
                  >
                    {(criarRegraMutation.isPending || atualizarRegraMutation.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {regraEditandoId ? "Salvar" : "Criar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {regrasQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : regras.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma regra cadastrada.</p>
          ) : (
            <div className="rounded-md border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs">Padrão</TableHead>
                    <TableHead className="text-xs">Categoria</TableHead>
                    <TableHead className="text-xs">Faixa de valor</TableHead>
                    <TableHead className="text-xs w-24">Origem</TableHead>
                    <TableHead className="text-xs w-20">Ativa</TableHead>
                    <TableHead className="text-xs w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {regras.map((r) => (
                    <TableRow key={r.id} className={`text-sm ${r.ativa === "false" ? "opacity-50" : ""}`}>
                      <TableCell className="font-mono text-xs">{r.padrao}</TableCell>
                      <TableCell className="text-sm">{r.categoriaNome}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.valorMin || r.valorMax
                          ? `${r.valorMin ? `de R$ ${r.valorMin}` : ""} ${r.valorMax ? `até R$ ${r.valorMax}` : ""}`.trim()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-normal">
                          {r.origem === "seed" ? "Padrão" : r.origem === "aprendida" ? "Aprendida" : "Manual"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={r.ativa === "true"}
                          onCheckedChange={(v) => ativarDesativarMutation.mutate({ id: r.id, ativa: !!v })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => abrirEditarRegra(r)}>
                          Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                <ListTree className="h-4 w-4" /> Plano de contas do DRE
              </CardTitle>
              <CardDescription>Estrutura usada nas categorias acima. Só inclusão — editar uma linha existente afeta histórico já categorizado.</CardDescription>
            </div>
            <Dialog open={categoriaModalOpen} onOpenChange={setCategoriaModalOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Nova categoria
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova categoria</DialogTitle>
                  <DialogDescription>Adiciona uma linha nova no plano de contas do DRE, dentro de uma seção existente.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Nome</Label>
                    <Input
                      placeholder="Ex.: Manutenção de Jardim"
                      value={novaCategoriaNome}
                      onChange={(e) => setNovaCategoriaNome(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Seção do DRE</Label>
                    <Select value={novaCategoriaSecao} onValueChange={setNovaCategoriaSecao}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SECOES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => novaCategoriaNome.trim() && criarCategoriaMutation.mutate({ nome: novaCategoriaNome.trim(), secao: novaCategoriaSecao as any })}
                    disabled={!novaCategoriaNome.trim() || criarCategoriaMutation.isPending}
                  >
                    {criarCategoriaMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Criar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {categoriasQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            categoriasPorSecao.map((s) => (
              <div key={s.value}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{s.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {s.itens.map((c) => (
                    <Badge key={c.id} variant="outline" className="text-xs font-normal">{c.nome}</Badge>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
