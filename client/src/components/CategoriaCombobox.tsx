import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronsUpDown } from "lucide-react";

export interface DreCategoriaOption {
  id: number;
  nome: string;
}

/**
 * Seletor de Categoria — ordenado alfabeticamente com busca, em vez do
 * <Select> puro que listava na ordem de cadastro (difícil de achar
 * entre ~20 categorias).
 */
export function CategoriaCombobox({
  categorias,
  value,
  onChange,
  placeholder = "Selecione a categoria",
}: {
  categorias: DreCategoriaOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ordenadas = [...categorias].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const atual = categorias.find((c) => String(c.id) === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          <span className="truncate">{atual ? atual.nome : placeholder}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar categoria..." className="text-sm h-8" />
          <CommandList>
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
            <CommandGroup>
              {ordenadas.map((c) => (
                <CommandItem key={c.id} value={c.nome} onSelect={() => { onChange(String(c.id)); setOpen(false); }}>
                  {c.nome}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
