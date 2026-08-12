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
import { Loader2, Plus, ListTree, Tags, Trash2, ArrowUp, ArrowDown, ArrowUpDown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type ColunaDescricao = "nome" | "categoriaNome";

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

  // ===== Nova/editar descrição (+ padrões, gerenciados dentro do mesmo modal) =====
  const [descricaoModalOpen, setDescricaoModalOpen] = useState(false);
  const [descricaoEditandoId, setDescricaoEditandoId] = useState<number | null>(null);
  const [descricaoForm, setDescricaoForm] = useState(DESCRICAO_FORM_VAZIO);
  const [novoPadraoTexto, setNovoPadraoTexto] = useState("");

  const criarDescricaoMutation = trpc.dreDescricoes.criar.useMutation({
    onSuccess: (data) => {
      toast.success("Descrição criada.");
      utils.dreDescricoes.list.invalidate();
      if (data.id) {
        setDescricaoEditandoId(data.id);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const atualizarDescricaoMutation = trpc.dreDescricoes.atualizar.useMutation({
    onSuccess: () => {
      toast.success("Descrição atualizada.");
      utils.dreDescricoes.list.invalidate();
      utils.dreRegras.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const criarRegraMutation = trpc.dreRegras.criar.useMutation({
    onSuccess: () => {
      setNovoPadraoTexto("");
      utils.dreRegras.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const atualizarRegraMutation = trpc.dreRegras.atualizar.useMutation({
    onSuccess: () => utils.dreRegras.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const ativarDesativarMutation = trpc.dreRegras.ativarDesativar.useMutation({
    onSuccess: () => utils.dreRegras.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const excluirRegraMutation = trpc.dreRegras.excluir.useMutation({
    onSuccess: () => {
      toast.success("Padrão removido.");
      utils.dreRegras.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function abrirNovaDescricao() {
    setDescricaoEditandoId(null);
    setDescricaoForm(DESCRICAO_FORM_VAZIO);
    setNovoPadraoTexto("");
    setDescricaoModalOpen(true);
  }

  function abrirEditarDescricao(d: typeof descricoes[number]) {
    setDescricaoEditandoId(d.id);
    setDescricaoForm({ nome: d.nome, dreCategoriaId: String(d.dreCategoriaId) });
    setNovoPadraoTexto("");
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

  function adicionarPadrao() {
    if (!novoPadraoTexto.trim() || descricaoEditandoId === null) return;
    criarRegraMutation.mutate({ padrao: novoPadraoTexto.trim(), dreDescricaoId: descricaoEditandoId });
  }

  const padroesDaDescricaoEditando = descricaoEditandoId
    ? regras.filter((r) => r.dreDescricaoId === descricaoEditandoId)
    : [];

  const descricaoEditando = descricaoEditandoId
    ? descricoes.find((d) => d.id === descricaoEditandoId)
    : undefined;

  // ===== Ordenação da tabela de Descrições =====
  const [ordenarPor, setOrdenarPor] = useState<ColunaDescricao>("nome");
  const [ordemAsc, setOrdemAsc] = useState(true);

  function alternarOrdenacao(coluna: ColunaDescricao) {
    if (ordenarPor === coluna) {
      setOrdemAsc(!ordemAsc);
    } else {
      setOrdenarPor(coluna);
      setOrdemAsc(true);
    }
  }

  const descricoesOrdenadas = [...descricoes].sort((a, b) => {
    const cmp = a[ordenarPor].toLowerCase().localeCompare(b[ordenarPor].toLowerCase(), "pt-BR");
    return ordemAsc ? cmp : -cmp;
  });

  function IconeOrdenacao({ coluna }: { coluna: ColunaDescricao }) {
    if (ordenarPor !== coluna) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return ordemAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  }

  function padroesPreview(descricaoId: number): string {
    const padroes = regras.filter((r) => r.dreDescricaoId === descricaoId).map((r) => r.padrao);
    if (padroes.length === 0) return "—";
    return padroes.join(" ou ");
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
                <Tags className="h-4 w-4" /> Descrições
              </CardTitle>
              <CardDescription>
                Cada Descrição pode ter vários padrões de texto (usados com "ou") — clique numa linha pra gerenciar.
              </CardDescription>
            </div>
            <Dialog open={descricaoModalOpen} onOpenChange={setDescricaoModalOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={abrirNovaDescricao}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Nova descrição
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{descricaoEditandoId ? "Editar descrição" : "Nova descrição"}</DialogTitle>
                  <DialogDescription>Toda Descrição pertence a 1 Categoria.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  {descricaoEditando?.chave && (
                    <div className="flex gap-2 rounded-md border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30 p-2.5 text-xs text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        Esta descrição tem um papel especial no sistema: é atribuída
                        automaticamente sempre que aparece uma transferência entre contas
                        próprias ou uma liquidação do Mercado Pago — <strong>independente
                        dos padrões abaixo</strong>. Dá pra renomear à vontade, mas não
                        reaproveite pra rastrear outro tipo de lançamento (ex.: aporte de
                        sócio); crie uma descrição nova pra isso.
                      </span>
                    </div>
                  )}
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
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={salvarDescricao}
                      disabled={!descricaoForm.nome.trim() || !descricaoForm.dreCategoriaId || criarDescricaoMutation.isPending || atualizarDescricaoMutation.isPending}
                    >
                      {(criarDescricaoMutation.isPending || atualizarDescricaoMutation.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      {descricaoEditandoId ? "Salvar nome/categoria" : "Criar descrição"}
                    </Button>
                  </div>

                  {descricaoEditandoId && (
                    <div className="space-y-2 border-t pt-3">
                      <Label className="text-xs">Padrões de texto no extrato (qualquer um identifica essa descrição — relação "ou")</Label>
                      <div className="space-y-1.5">
                        {padroesDaDescricaoEditando.length === 0 && (
                          <p className="text-xs text-muted-foreground">Nenhum padrão ainda — sem padrão, essa descrição só pode ser aplicada manualmente.</p>
                        )}
                        {padroesDaDescricaoEditando.map((r) => (
                          <div key={r.id} className="flex items-center gap-1.5">
                            <Input
                              key={r.id}
                              defaultValue={r.padrao}
                              className="h-7 text-xs font-mono"
                              onBlur={(e) => {
                                const novoValor = e.target.value.trim();
                                if (novoValor && novoValor !== r.padrao) {
                                  atualizarRegraMutation.mutate({ id: r.id, padrao: novoValor });
                                }
                              }}
                            />
                            <Checkbox
                              checked={r.ativa === "true"}
                              onCheckedChange={(v) => ativarDesativarMutation.mutate({ id: r.id, ativa: !!v })}
                              title="Ativo"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                              title="Excluir padrão"
                              onClick={() => excluirRegraMutation.mutate({ id: r.id })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex items-center gap-1.5">
                          <Input
                            placeholder='Novo padrão, ex.: "MDS SERVICOS TERCEIRIZADOS"'
                            className="h-7 text-xs"
                            value={novoPadraoTexto}
                            onChange={(e) => setNovoPadraoTexto(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarPadrao(); } }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            onClick={adicionarPadrao}
                            disabled={!novoPadraoTexto.trim() || criarRegraMutation.isPending}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
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
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir descrição
                    </Button>
                  ) : <span />}
                  <Button variant="ghost" onClick={() => setDescricaoModalOpen(false)}>Fechar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {descricoesQuery.isLoading || regrasQuery.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : descricoes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhuma descrição cadastrada.</p>
          ) : (
            <div className="rounded-md border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs min-w-[220px]">
                      <button className="flex items-center gap-1 hover:text-foreground" onClick={() => alternarOrdenacao("nome")}>
                        Descrição <IconeOrdenacao coluna="nome" />
                      </button>
                    </TableHead>
                    <TableHead className="text-xs min-w-[200px]">
                      <button className="flex items-center gap-1 hover:text-foreground" onClick={() => alternarOrdenacao("categoriaNome")}>
                        Categoria <IconeOrdenacao coluna="categoriaNome" />
                      </button>
                    </TableHead>
                    <TableHead className="text-xs">Padrões (ou)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {descricoesOrdenadas.map((d) => (
                    <TableRow
                      key={d.id}
                      className="text-sm cursor-pointer hover:bg-muted/40"
                      onClick={() => abrirEditarDescricao(d)}
                    >
                      <TableCell className="text-sm min-w-[220px] whitespace-normal">{d.nome}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.categoriaNome}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-xs">{padroesPreview(d.id)}</TableCell>
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
                ? "Isso exclui todas as Descrições dentro dessa categoria e os padrões ligados a elas. Lançamentos já categorizados voltam pra \"Pendente\"."
                : "Isso exclui os padrões ligados a essa Descrição. Lançamentos já categorizados com ela voltam pra \"Pendente\"."}
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
              <span className="text-muted-foreground">Padrões removidos</span>
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
