import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronsUpDown, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export interface DreDescricaoOption {
  id: number;
  nome: string;
  categoriaNome: string;
}

export interface DreCategoriaOption {
  id: number;
  nome: string;
}

/**
 * Seletor de Descrição (nível intermediário entre Categoria e
 * lançamento — toda transação categorizada aponta pra uma Descrição,
 * nunca direto pra Categoria). Busca por nome, mostra a Categoria como
 * texto secundário, tem uma opção fixa "Criar nova descrição" e um
 * ícone de editar em cada item — os dois abrem o mesmo modal (Nome,
 * Categoria, Padrão de identificação no extrato), que por baixo dos
 * panos mexe em duas tabelas (dre_descricoes + a regra de match em
 * dre_regras) como se fosse uma coisa só, já que na prática 1 Descrição
 * quase sempre tem 1 padrão de texto associado.
 */
export function DescricaoCombobox({
  descricoes,
  categorias,
  value,
  status,
  onChange,
  placeholder = "Pendente",
}: {
  descricoes: DreDescricaoOption[];
  categorias: DreCategoriaOption[];
  value: number | null;
  status?: "pendente" | "sugerida" | "confirmada";
  onChange: (id: number | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nome, setNome] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [padrao, setPadrao] = useState("");
  const utils = trpc.useUtils();

  const regrasQuery = trpc.dreRegras.list.useQuery();
  const regras = regrasQuery.data ?? [];

  const atual = descricoes.find((d) => d.id === value);
  const corClasse = !status
    ? ""
    : status === "confirmada"
      ? "border-green-400 text-green-700 hover:text-green-700"
      : status === "sugerida"
        ? "border-blue-400 text-blue-700 hover:text-blue-700"
        : "border-amber-400 text-amber-700 hover:text-amber-700";

  function fecharModal() {
    setModalOpen(false);
    setEditandoId(null);
    setNome("");
    setCategoriaId("");
    setPadrao("");
  }

  function abrirCriar() {
    setEditandoId(null);
    setNome("");
    setCategoriaId("");
    setPadrao("");
    setModalOpen(true);
  }

  function abrirEditar(d: DreDescricaoOption) {
    const categoria = categorias.find((c) => c.nome === d.categoriaNome);
    const regrasDaDescricao = regras.filter((r) => r.dreDescricaoId === d.id);
    setEditandoId(d.id);
    setNome(d.nome);
    setCategoriaId(categoria ? String(categoria.id) : "");
    setPadrao(regrasDaDescricao[0]?.padrao ?? "");
    setModalOpen(true);
  }

  const criarDescricaoMutation = trpc.dreDescricoes.criar.useMutation();
  const atualizarDescricaoMutation = trpc.dreDescricoes.atualizar.useMutation();
  const criarRegraMutation = trpc.dreRegras.criar.useMutation();
  const atualizarRegraMutation = trpc.dreRegras.atualizar.useMutation();

  const salvando =
    criarDescricaoMutation.isPending || atualizarDescricaoMutation.isPending ||
    criarRegraMutation.isPending || atualizarRegraMutation.isPending;

  async function handleSalvar() {
    if (!nome.trim() || !categoriaId) return;
    const dreCategoriaId = Number(categoriaId);
    const padraoLimpo = padrao.trim();

    try {
      let descricaoId = editandoId;
      if (editandoId) {
        await atualizarDescricaoMutation.mutateAsync({ id: editandoId, nome: nome.trim(), dreCategoriaId });
        const regraExistente = regras.find((r) => r.dreDescricaoId === editandoId);
        if (regraExistente) {
          if (padraoLimpo && padraoLimpo !== regraExistente.padrao) {
            await atualizarRegraMutation.mutateAsync({ id: regraExistente.id, padrao: padraoLimpo });
          }
        } else if (padraoLimpo) {
          await criarRegraMutation.mutateAsync({ padrao: padraoLimpo, dreDescricaoId: editandoId });
        }
      } else {
        const resultado = await criarDescricaoMutation.mutateAsync({ nome: nome.trim(), dreCategoriaId });
        descricaoId = resultado.id ?? null;
        if (descricaoId && padraoLimpo) {
          await criarRegraMutation.mutateAsync({ padrao: padraoLimpo, dreDescricaoId: descricaoId });
        }
      }

      utils.dreDescricoes.list.invalidate();
      utils.dreRegras.list.invalidate();
      toast.success(editandoId ? "Descrição atualizada." : "Descrição criada.");
      fecharModal();
      if (descricaoId) onChange(descricaoId);
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao salvar descrição.");
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={`h-7 text-xs justify-between font-normal w-full px-2 ${corClasse}`}
          >
            <span className="truncate">{atual ? atual.nome : placeholder}</span>
            <ChevronsUpDown className="h-3 w-3 opacity-50 shrink-0 ml-1" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <CommandInput placeholder="Buscar descrição..." className="text-sm h-8" />
            <CommandList>
              <CommandEmpty>Nenhuma descrição encontrada.</CommandEmpty>
              <CommandGroup>
                <CommandItem value="Pendente" onSelect={() => { onChange(null); setOpen(false); }}>
                  Pendente
                </CommandItem>
                {descricoes.map((d) => (
                  <CommandItem
                    key={d.id}
                    value={`${d.nome} ${d.categoriaNome}`}
                    onSelect={() => { onChange(d.id); setOpen(false); }}
                    className="justify-between"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="truncate">{d.nome}</span>
                      <span className="text-[10px] text-muted-foreground truncate">{d.categoriaNome}</span>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); setOpen(false); abrirEditar(d); }}
                      title="Editar descrição"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem
                  value="__criar_nova_descricao__"
                  onSelect={() => { setOpen(false); abrirCriar(); }}
                  className="text-primary"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Criar nova descrição
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={modalOpen} onOpenChange={(v) => { if (!v) fecharModal(); else setModalOpen(true); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editandoId ? "Editar descrição" : "Nova descrição"}</DialogTitle>
            <DialogDescription>
              Toda Descrição pertence a 1 Categoria. O padrão (opcional) é o texto que o sistema procura no extrato pra
              categorizar sozinho da próxima vez.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome da descrição</Label>
              <Input
                placeholder='Ex.: "Yamada Contabilidade"'
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Padrão de identificação no extrato (opcional)</Label>
              <Input
                placeholder='Ex.: "MDS SERVICOS TERCEIRIZADOS"'
                value={padrao}
                onChange={(e) => setPadrao(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSalvar} disabled={!nome.trim() || !categoriaId || salvando}>
              {editandoId ? "Salvar" : "Criar e usar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
