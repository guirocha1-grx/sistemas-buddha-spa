import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Zap } from "lucide-react";
import { trpc } from "@/lib/trpc";

interface ScriptPickerProps {
  onSelect: (texto: string) => void;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

/**
 * Popover de scripts prontos — mesmo conceito do mobai-crm (busca +
 * filtro de categoria + recentes). `open`/`onOpenChange` controlados
 * pelo componente pai pra que o atalho "/" na caixa de texto também
 * consiga abrir.
 */
export function ScriptPicker({ onSelect, disabled, open, onOpenChange }: ScriptPickerProps) {
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null);

  const categoriasQuery = trpc.scripts.listCategorias.useQuery(undefined, { enabled: open });
  const scriptsQuery = trpc.scripts.list.useQuery(
    { busca: busca || undefined, categoria: categoriaFiltro || undefined },
    { enabled: open },
  );
  const recentesQuery = trpc.scripts.listRecentes.useQuery(undefined, { enabled: open });
  const registrarUsoMutation = trpc.scripts.registrarUso.useMutation();

  const fechar = () => {
    onOpenChange(false);
    setBusca("");
    setCategoriaFiltro(null);
  };

  const handleSelect = (script: { id: number; script: string }) => {
    onSelect(script.script);
    registrarUsoMutation.mutate({ scriptId: script.id });
    fechar();
  };

  return (
    <Popover open={open} onOpenChange={(v) => (v ? onOpenChange(true) : fechar())}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="shrink-0" disabled={disabled} title="Scripts e mensagens rápidas (ou digite / na caixa)">
          <Zap className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" side="top" align="start">
        <div className="p-2 border-b space-y-2">
          <Input
            autoFocus
            placeholder="Buscar script..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-8 text-sm"
          />
          {(categoriasQuery.data?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              <Badge
                variant={categoriaFiltro === null ? "default" : "outline"}
                className="cursor-pointer text-[10px]"
                onClick={() => setCategoriaFiltro(null)}
              >
                Todos
              </Badge>
              {categoriasQuery.data?.map((c) => (
                <Badge
                  key={c}
                  variant={categoriaFiltro === c ? "default" : "outline"}
                  className="cursor-pointer text-[10px]"
                  onClick={() => setCategoriaFiltro(c)}
                >
                  {c}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {!busca && !categoriaFiltro && (recentesQuery.data?.length ?? 0) > 0 && (
            <div className="mb-1">
              <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Recentes</p>
              {recentesQuery.data!.map((s) => (
                <button
                  key={`recente-${s.id}`}
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-xs"
                  onClick={() => handleSelect(s)}
                >
                  <span className="font-medium text-[10px] text-muted-foreground block">{s.categoriaScript}</span>
                  {s.script.slice(0, 80)}
                </button>
              ))}
            </div>
          )}
          {scriptsQuery.isLoading ? (
            <p className="p-3 text-xs text-muted-foreground text-center">Carregando...</p>
          ) : (scriptsQuery.data?.length ?? 0) === 0 ? (
            <p className="p-3 text-xs text-muted-foreground text-center">Nenhum script encontrado.</p>
          ) : (
            scriptsQuery.data!.map((s) => (
              <button
                key={s.id}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-muted text-xs"
                onClick={() => handleSelect(s)}
              >
                <span className="font-medium text-[10px] text-muted-foreground block">{s.categoriaScript}</span>
                {s.script.slice(0, 80)}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
