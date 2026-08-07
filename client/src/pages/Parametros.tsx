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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DescricaoCombobox } from "@/components/DescricaoCombobox";
import { Loader2, Plus, Settings2, ListTree, Tags, Trash2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

type ColunaOrdenavel = "descricaoNome" | "categoriaNome" | "padrao";

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

const REGRA_FORM_VAZIO = { padrao: "", dreDescricaoId: "", valorMin: "", valorMax: "", alertaSeRepetirNoMes: false };
const DESCRICAO_FORM_VAZIO = { nome: "", dreCategoriaId: "" };

interface RelatorioExclusao {
  tipo: "categoria" | "descricao";
  nome: string;
  regrasRemovidas: number;
  extratosAfetados: number;
  adquirenteAfetados: number;
  descricoesRemovidas?: number;
}

export default function Parametros() {
  const utils = trpc.useUtils();

  const categoriasQuery = trpc.dreCategorias.list.useQuery();
  const categorias = categoriasQuery.data ?? [];

  const descricoesQuery = trpc.dreDescricoes.list.useQuery();
  const descricoes = descricoesQuery.data ?? [];

  const regrasQuery = trpc.dreRegras.list.useQuery();
  const regras = regrasQuery.data ?? [];

  // ===== Exclusão (categoria ou descrição) — confirmação + relatório =====
  const [confirmacaoExclusao, setConfirmacaoExclusao] = useState<{ tipo: "categoria" | "descricao"; id: number; nome: string } | null>(null);
  const [relatorioExclusao, setRelatorioExclusao] = useState<RelatorioExclusao | null>(null);

  const excluirCategoriaMutation = trpc.dreCategorias.excluir.useMutation({
    onSuccess: (data) => {
      setConfirmacaoExclusao(null);
      setCategoriaModalOpen(false);
      setRelatorioExclusao({ tipo: "categoria", ...data });
      utils.dreCategorias.list.invalidate();
      utils.dreDescricoes.list.invalidate();
      utils.dreRegras.list.invalidate();
    },
    onError: (err) => { toast.error(err.message); setConfirmacaoExclusao(null); },
  });

  const excluirDescricaoMutation = trpc.dreDescricoes.excluir.useMutation({
    onSuccess: (data) => {
      setConfirmacaoExclusao(null);
      setDescricaoModalOpen(false);
      setRelatorioExclusao({ tipo: "descricao", ...data });
      utils.dreDescricoes.list.invalidate();
      utils.dreRegras.list.invalidate();
    },
    onError: (err) => { toast.error(err.message); setConfirmacaoExclusao(null); },
  });

  function confirmarExclusao() {
    if (!confirmacaoExclusao) return;
    if (confirmacaoExclusao.tipo === "categoria") {
      excluirCategoriaMutation.mutate({ id: confirmacaoExclusao.id });
    } else {
      excluirDescricaoMutation.mutate({ id: confirmacaoExclusao.id });
    }
  }

  // ===== Nova/editar categoria =====
  const [categoriaModalOpen, setCategoriaModalOpen] = useState(false);
  const [categoriaEditandoId, setCategoriaEditandoId] = useState<number | null>(null);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState("");
  const [novaCategoriaSecao, setNovaCategoriaSecao] = useState("despesas_administrativas");

  const criarCategoriaMutation = trpc.dreCategorias.criar.useMutation({
    onSuccess: () => {
      toast.success("Categoria criada.");
      setCategoriaModalOpen(false);
      utils.dreCategorias.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const atualizarCategoriaMutation = trpc.dreCategorias.atualizar.useMutation({
    onSuccess: () => {
      toast.success("Categoria atualizada.");
      setCategoriaModalOpen(false);
      utils.dreCategorias.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function abrirNovaCategoria() {
    setCategoriaEditandoId(null);
    setNovaCategoriaNome("");
    setNovaCategoriaSecao("despesas_administrativas");
    setCategoriaModalOpen(true);
  }

  function abrirEditarCategoria(c: typeof categorias[number]) {
    setCategoriaEditandoId(c.id);
    setNovaCategoriaNome(c.nome);
    setNovaCategoriaSecao(c.secao);
    setCategoriaModalOpen(true);
  }

  function salvarCategoria() {
    if (!novaCategoriaNome.trim()) return;
    if (categoriaEditandoId) {
      atualizarCategoriaMutation.mutate({ id: categoriaEditandoId, nome: novaCategoriaNome.trim(), secao: novaCategoriaSecao as any });
    } else {
      criarCategoriaMutation.mutate({ nome: novaCategoriaNome.trim(), secao: novaCategoriaSecao as any });
    }
  }

  // ===== Nova/editar descrição =====
  const [descricaoModalOpen, setDescricaoModalOpen] = useState(false);
  const [descricaoEditandoId, setDescricaoEditandoId] = useState<number | null>(null);
  const [descricaoForm, setDescricaoForm] = useState(DESCRICAO_FORM_VAZIO);

  const criarDescricaoMutation = trpc.dreDescricoes.criar.useMutation({
    onSuccess: () => {
      toast.success("Descrição criada.");
      setDescricaoModalOpen(false);
      utils.dreDescricoes.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const atualizarDescricaoMutation = trpc.dreDescricoes.atualizar.useMutation({
    onSuccess: () => {
      toast.success("Descrição atualizada.");
      setDescricaoModalOpen(false);
      utils.dreDescricoes.list.invalidate();
      utils.dreRegras.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function abrirNovaDescricao() {
    setDescricaoEditandoId(null);
    setDescricaoForm(DESCRICAO_FORM_VAZIO);
    setDescricaoModalOpen(true);
  }

  function abrirEditarDescricao(d: typeof descricoes[number]) {
    setDescricaoEditandoId(d.id);
    setDescricaoForm({ nome: d.nome, dreCategoriaId: String(d.dreCategoriaId) });
    setDescricaoModalOpen(true);
  }

  function salvarDescricao() {
    if (!descricaoForm.nome.trim() || !descricaoForm.dreCategoriaId) return;
    const dados = { nome: descricaoForm.nome.trim(), dreCategoriaId: Number(descricaoForm.dreCategoriaId) };
    if (descricaoEditandoId) {
      atualizarDescricaoMutation.mutate({ id: descricaoEditandoId, ...dados });
    } else {
      criarDescricaoMutation.mutate(dados);
    }
  }

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
      dreDescricaoId: String(r.dreDescricaoId),
      valorMin: r.valorMin ?? "",
      valorMax: r.valorMax ?? "",
      alertaSeRepetirNoMes: r.alertaSeRepetirNoMes === "true",
    });
    setRegraModalOpen(true);
  }

  function salvarRegra() {
    if (!regraForm.padrao.trim() || !regraForm.dreDescricaoId) return;
    const dados = {
      padrao: regraForm.padrao.trim(),
      dreDescricaoId: Number(regraForm.dreDescricaoId),
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

  // ===== Ordenação =====
  const [ordenarPor, setOrdenarPor] = useState<ColunaOrdenavel>("descricaoNome");
  const [ordemAsc, setOrdemAsc] = useState(true);

  function alternarOrdenacao(coluna: ColunaOrdenavel) {
    if (ordenarPor === coluna) {
      setOrdemAsc(!ordemAsc);
    } else {
      setOrdenarPor(coluna);
      setOrdemAsc(true);
    }
  }

  function valorOrdenavel(r: typeof regras[number], coluna: ColunaOrdenavel): string {
    return r[coluna].toLowerCase();
  }

  const regrasOrdenadas = [...regras].sort((a, b) => {
    const cmp = valorOrdenavel(a, ordenarPor).localeCompare(valorOrdenavel(b, ordenarPor), "pt-BR");
    return ordemAsc ? cmp : -cmp;
  });

  function IconeOrdenacao({ coluna }: { coluna: ColunaOrdenavel }) {
    if (ordenarPor !== coluna) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return ordemAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  }

  const categoriasPorSecao = SECOES.map((s) => ({
    ...s,
    itens: categorias.filter((c) => c.secao === s.value),
  })).filter((s) => s.itens.length > 0);

  const descricoesPorCategoria = categorias
    .map((c) => ({ categoria: c, itens: descricoes.filter((d) => d.dreCategoriaId === c.id) }))
    .filter((g) => g.itens.length > 0);

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
              <CardDescription>Nome no extrato → Descrição do DRE. Aplicadas na importação e no "Reprocessar pendentes".</CardDescription>
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
                    <Label className="text-xs">Descrição (a categoria vem por herança)</Label>
                    <DescricaoCombobox
                      descricoes={descricoes}
                      categorias={categorias}
                      value={regraForm.dreDescricaoId ? Number(regraForm.dreDescricaoId) : null}
                      placeholder="Selecione ou crie..."
                      onChange={(id) => setRegraForm({ ...regraForm, dreDescricaoId: id ? String(id) : "" })}
                    />
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
                    disabled={!regraForm.padrao.trim() || !regraForm.dreDescricaoId || criarRegraMutation.isPending || atualizarRegraMutation.isPending}
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
                    <TableHead className="text-xs min-w-[220px]">
                      <button className="flex items-center gap-1 hover:text-foreground" onClick={() => alternarOrdenacao("descricaoNome")}>
                        Descrição <IconeOrdenacao coluna="descricaoNome" />
                      </button>
                    </TableHead>
                    <TableHead className="text-xs">
                      <button className="flex items-center gap-1 hover:text-foreground" onClick={() => alternarOrdenacao("categoriaNome")}>
                        Categoria <IconeOrdenacao coluna="categoriaNome" />
                      </button>
                    </TableHead>
                    <TableHead className="text-xs">
                      <button className="flex items-center gap-1 hover:text-foreground" onClick={() => alternarOrdenacao("padrao")}>
                        Padrão <IconeOrdenacao coluna="padrao" />
                      </button>
                    </TableHead>
                    <TableHead className="text-xs">Faixa de valor</TableHead>
                    <TableHead className="text-xs w-24">Origem</TableHead>
                    <TableHead className="text-xs w-20">Ativa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {regrasOrdenadas.map((r) => (
                    <TableRow
                      key={r.id}
                      className={`text-sm cursor-pointer hover:bg-muted/40 ${r.ativa === "false" ? "opacity-50" : ""}`}
                      onClick={() => abrirEditarRegra(r)}
                    >
                      <TableCell className="text-sm min-w-[220px] whitespace-normal">{r.descricaoNome}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.categoriaNome}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.padrao}</TableCell>
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
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={r.ativa === "true"}
                          onCheckedChange={(v) => ativarDesativarMutation.mutate({ id: r.id, ativa: !!v })}
                        />
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
                <Tags className="h-4 w-4" /> Descrições
              </CardTitle>
              <CardDescription>
                O nível que fica direto no lançamento — clique numa descrição pra editar ou excluir.
              </CardDescription>
            </div>
            <Dialog open={descricaoModalOpen} onOpenChange={setDescricaoModalOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" onClick={abrirNovaDescricao}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Nova descrição
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{descricaoEditandoId ? "Editar descrição" : "Nova descrição"}</DialogTitle>
                  <DialogDescription>
                    Toda Descrição pertence a 1 Categoria. Pra definir o padrão de texto que identifica ela sozinha no
                    extrato, use "Nova regra" acima (uma Descrição pode ter várias regras).
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Nome da descrição</Label>
                    <Input
                      placeholder='Ex.: "Yamada Contabilidade"'
                      value={descricaoForm.nome}
                      onChange={(e) => setDescricaoForm({ ...descricaoForm, nome: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Categoria</Label>
                    <Select value={descricaoForm.dreCategoriaId} onValueChange={(v) => setDescricaoForm({ ...descricaoForm, dreCategoriaId: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                      <SelectContent>
                        {categorias.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter className="flex items-center justify-between sm:justify-between">
                  {descricaoEditandoId ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        const d = descricoes.find((x) => x.id === descricaoEditandoId);
                        if (d) setConfirmacaoExclusao({ tipo: "descricao", id: d.id, nome: d.nome });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir
                    </Button>
                  ) : <span />}
                  <Button
                    onClick={salvarDescricao}
                    disabled={!descricaoForm.nome.trim() || !descricaoForm.dreCategoriaId || criarDescricaoMutation.isPending || atualizarDescricaoMutation.isPending}
                  >
                    {(criarDescricaoMutation.isPending || atualizarDescricaoMutation.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {descricaoEditandoId ? "Salvar" : "Criar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {descricoesQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : descricoesPorCategoria.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma descrição cadastrada.</p>
          ) : (
            descricoesPorCategoria.map((g) => (
              <div key={g.categoria.id}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{g.categoria.nome}</p>
                <div className="flex flex-wrap gap-1.5">
                  {g.itens.map((d) => (
                    <button key={d.id} onClick={() => abrirEditarDescricao(d)}>
                      <Badge variant="outline" className="text-xs font-normal cursor-pointer hover:bg-muted">{d.nome}</Badge>
                    </button>
                  ))}
                </div>
              </div>
            ))
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
              <CardDescription>Clique numa categoria pra editar o nome/seção ou excluir.</CardDescription>
            </div>
            <Dialog open={categoriaModalOpen} onOpenChange={setCategoriaModalOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" onClick={abrirNovaCategoria}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Nova categoria
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{categoriaEditandoId ? "Editar categoria" : "Nova categoria"}</DialogTitle>
                  <DialogDescription>
                    {categoriaEditandoId
                      ? "Renomear ou mudar a seção não afeta as Descrições já ligadas a essa categoria."
                      : "Adiciona uma linha nova no plano de contas do DRE, dentro de uma seção existente."}
                  </DialogDescription>
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
                <DialogFooter className="flex items-center justify-between sm:justify-between">
                  {categoriaEditandoId ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmacaoExclusao({ tipo: "categoria", id: categoriaEditandoId, nome: novaCategoriaNome })}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir
                    </Button>
                  ) : <span />}
                  <Button
                    onClick={salvarCategoria}
                    disabled={!novaCategoriaNome.trim() || criarCategoriaMutation.isPending || atualizarCategoriaMutation.isPending}
                  >
                    {(criarCategoriaMutation.isPending || atualizarCategoriaMutation.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    {categoriaEditandoId ? "Salvar" : "Criar"}
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
                    <button key={c.id} onClick={() => abrirEditarCategoria(c)}>
                      <Badge variant="outline" className="text-xs font-normal cursor-pointer hover:bg-muted">{c.nome}</Badge>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmacaoExclusao} onOpenChange={(v) => { if (!v) setConfirmacaoExclusao(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{confirmacaoExclusao?.nome}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmacaoExclusao?.tipo === "categoria"
                ? "Isso exclui todas as Descrições dentro dessa categoria e as regras ligadas a elas. Lançamentos já categorizados voltam pra \"Pendente\"."
                : "Isso exclui as regras ligadas a essa Descrição. Lançamentos já categorizados com ela voltam pra \"Pendente\"."}
              {" "}Não dá pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusao}
              disabled={excluirCategoriaMutation.isPending || excluirDescricaoMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!relatorioExclusao} onOpenChange={(v) => { if (!v) setRelatorioExclusao(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>"{relatorioExclusao?.nome}" excluída</DialogTitle>
            <DialogDescription>Resumo do que foi afetado:</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {relatorioExclusao?.tipo === "categoria" && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Descrições removidas</span>
                <span className="font-medium">{relatorioExclusao?.descricoesRemovidas}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Regras removidas</span>
              <span className="font-medium">{relatorioExclusao?.regrasRemovidas}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lançamentos do extrato que voltaram a "Pendente"</span>
              <span className="font-medium">{relatorioExclusao?.extratosAfetados}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vendas de adquirente afetadas</span>
              <span className="font-medium">{relatorioExclusao?.adquirenteAfetados}</span>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setRelatorioExclusao(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
