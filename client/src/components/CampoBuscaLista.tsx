import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown } from "lucide-react";
import React, { useState, type ReactNode } from "react";

/**
 * Campo de texto com busca embutida contra uma lista de opções (ex.:
 * nome de terapia, terapeuta) — digitar filtra a lista, o botão de
 * seta mostra todas. Extraído de ChamadoTerapeutaDialog.tsx pra
 * reaproveitar no popup de Próximo Atendimento (Mensagens.tsx), que
 * antes deixava o campo de texto livre.
 */
export function CampoBuscaLista({ label, labelExtra, value, onChange, valores, placeholder, id }: {
  label: string;
  labelExtra?: ReactNode;
  value: string;
  onChange: (valor: string) => void;
  valores: string[];
  placeholder: string;
  id: string;
}) {
  const [aberta, setAberta] = useState(false);
  const [mostrarTodas, setMostrarTodas] = useState(false);
  const opcoes = Array.from(new Set(valores.filter(Boolean)));
  const filtro = value.trim().toLocaleLowerCase("pt-BR");
  const opcoesVisiveis = mostrarTodas || !filtro ? opcoes : opcoes.filter((opcao) => opcao.toLocaleLowerCase("pt-BR").includes(filtro));

  return (
    <div className="relative space-y-1.5">
      <div className="flex items-center gap-1"><Label htmlFor={id}>{label}</Label>{labelExtra}</div>
      <div className="flex gap-1">
        <Input
          id={id}
          value={value}
          onFocus={() => { setAberta(true); setMostrarTodas(false); }}
          onChange={(event) => { onChange(event.target.value); setAberta(true); setMostrarTodas(false); }}
          placeholder={placeholder}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => { setAberta((atual) => { const proxima = !atual; setMostrarTodas(proxima); return proxima; }); }}
          aria-label={`Mostrar todas as opções de ${label}`}
          aria-expanded={aberta}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
      {aberta ? (
        <div className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg">
          {opcoesVisiveis.length ? opcoesVisiveis.map((opcao) => (
            <button key={opcao} type="button" className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted" onClick={() => { onChange(opcao); setAberta(false); setMostrarTodas(false); }}>
              {opcao}
            </button>
          )) : <p className="px-2 py-2 text-sm text-muted-foreground">Nenhuma opção encontrada.</p>}
        </div>
      ) : null}
    </div>
  );
}
