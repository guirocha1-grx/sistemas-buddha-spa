import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronsUpDown, Plus } from "lucide-react";
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
 * texto secundário, e tem uma opção fixa "Criar nova descrição" que
 * abre um mini-modal (Nome + Categoria) — ao salvar, já aplica a nova
 * descrição no lugar de quem chamou o combobox.
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
  const [criarModalOpen, setCriarModalOpen] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novaCategoriaId, setNovaCategoriaId] = useState("");
  const utils = trpc.useUtils();

  const atual = descricoes.find((d) => d.id === value);
  const corClasse = !status
    ? ""
    : status === "confirmada"
      ? "border-green-400 text-green-700 hover:text-green-700"
      : status === "sugerida"
        ? "border-blue-400 text-blue-700 hover:text-blue-700"
        : "border-amber-400 text-amber-700 hover:text-amber-700";

  const criarMutation = trpc.dreDescricoes.criar.useMutation({
    onSuccess: (data) => {
      utils.dreDescricoes.list.invalidate();
      toast.success("Descrição criada.");
      setCriarModalOpen(false);
      setNovoNome("");
      setNovaCategoriaId("");
      if (data.id) onChange(data.id);
    },
    onError: (err) => toast.error(err.message),
  });

  function handleCriar() {
    if (!novoNome.trim() || !novaCategoriaId) return;
    criarMutation.mutate({ nome: novoNome.trim(), dreCategoriaId: Number(novaCategoriaId) });
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
        <PopoverContent className="w-72 p-0" align="start">
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
                  >
                    <div className="flex flex-col">
                      <span>{d.nome}</span>
                      <span className="text-[10px] text-muted-foreground">{d.categoriaNome}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem
                  value="__criar_nova_descricao__"
                  onSelect={() => { setOpen(false); setCriarModalOpen(true); }}
                  className="text-primary"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Criar nova descrição
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={criarModalOpen} onOpenChange={setCriarModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova descrição</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                placeholder='Ex.: "Yamada Contabilidade"'
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={novaCategoriaId} onValueChange={setNovaCategoriaId}>
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
          </div>
          <DialogFooter>
            <Button
              onClick={handleCriar}
              disabled={!novoNome.trim() || !novaCategoriaId || criarMutation.isPending}
            >
              Criar e usar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
