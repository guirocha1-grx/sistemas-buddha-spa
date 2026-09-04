import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Users } from "lucide-react";

export type CampoSegmento =
  | "unidade" | "sexo" | "diasDesdeUltimoAtendimento" | "diasDesdeCadastro" | "qtdAtendimentos" | "terapiaFeita" | "etiqueta";
export type OperadorSegmento = "igual" | "diferente" | "maior" | "menor" | "maior_igual" | "menor_igual" | "contem";
export interface FiltroSegmento {
  campo: CampoSegmento;
  operador: OperadorSegmento;
  valor: string;
}

type TipoValor = "unidade" | "sexo" | "numero" | "texto_livre" | "etiqueta";

const CAMPOS: Array<{ valor: CampoSegmento; label: string; tipoValor: TipoValor; operadores: Array<{ valor: OperadorSegmento; label: string }> }> = [
  { valor: "unidade", label: "Unidade", tipoValor: "unidade", operadores: [
    { valor: "igual", label: "é" }, { valor: "diferente", label: "não é" },
  ] },
  { valor: "sexo", label: "Sexo", tipoValor: "sexo", operadores: [
    { valor: "igual", label: "é" }, { valor: "diferente", label: "não é" },
  ] },
  { valor: "diasDesdeUltimoAtendimento", label: "Dias desde a última visita", tipoValor: "numero", operadores: [
    { valor: "maior", label: "maior que" }, { valor: "menor", label: "menor que" }, { valor: "igual", label: "igual a" },
    { valor: "maior_igual", label: "maior ou igual a" }, { valor: "menor_igual", label: "menor ou igual a" },
  ] },
  { valor: "diasDesdeCadastro", label: "Dias desde o cadastro", tipoValor: "numero", operadores: [
    { valor: "maior", label: "maior que" }, { valor: "menor", label: "menor que" }, { valor: "igual", label: "igual a" },
    { valor: "maior_igual", label: "maior ou igual a" }, { valor: "menor_igual", label: "menor ou igual a" },
  ] },
  { valor: "qtdAtendimentos", label: "Quantidade de atendimentos", tipoValor: "numero", operadores: [
    { valor: "maior", label: "maior que" }, { valor: "menor", label: "menor que" }, { valor: "igual", label: "igual a" },
    { valor: "maior_igual", label: "maior ou igual a" }, { valor: "menor_igual", label: "menor ou igual a" },
  ] },
  { valor: "terapiaFeita", label: "Terapia já feita", tipoValor: "texto_livre", operadores: [
    { valor: "igual", label: "é exatamente" }, { valor: "contem", label: "contém" },
  ] },
  { valor: "etiqueta", label: "Etiqueta", tipoValor: "etiqueta", operadores: [
    { valor: "igual", label: "tem" }, { valor: "diferente", label: "não tem" },
  ] },
];

function campoInfo(campo: CampoSegmento) {
  return CAMPOS.find((c) => c.valor === campo) ?? CAMPOS[0];
}

export function filtroSegmentoVazio(): FiltroSegmento {
  return { campo: "unidade", operador: "igual", valor: "ssu" };
}

/**
 * Construtor de segmentação pra Disparos (2026-09-03) — substitui a busca por
 * nome numa base de ~10 mil clientes por filtros campo/operador/valor
 * combinados por E, com contagem ao vivo. Ver server/db.ts
 * (contarClientesSegmento) pros campos suportados.
 */
export function SegmentoFiltros({ filtros, onChange }: { filtros: FiltroSegmento[]; onChange: (f: FiltroSegmento[]) => void }) {
  const terapiasQuery = trpc.segmentos.opcoesTerapias.useQuery();
  const etiquetasQuery = trpc.etiquetas.list.useQuery();

  // Debounce evita 1 request por tecla digitada nos campos numéricos/texto.
  const [filtrosDebounced, setFiltrosDebounced] = useState(filtros);
  useEffect(() => {
    const timer = setTimeout(() => setFiltrosDebounced(filtros), 400);
    return () => clearTimeout(timer);
  }, [filtros]);

  const filtrosValidos = useMemo(() => filtrosDebounced.filter((f) => {
    if (!f.valor.trim()) return false;
    if (campoInfo(f.campo).tipoValor === "numero") return Number.isFinite(Number(f.valor));
    return true;
  }), [filtrosDebounced]);

  const contagemQuery = trpc.segmentos.contar.useQuery(filtrosValidos, { enabled: filtrosValidos.length > 0 });

  function atualizarFiltro(i: number, patch: Partial<FiltroSegmento>) {
    onChange(filtros.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function trocarCampo(i: number, campo: CampoSegmento) {
    onChange(filtros.map((f, idx) => (idx === i ? { campo, operador: campoInfo(campo).operadores[0].valor, valor: "" } : f)));
  }
  function remover(i: number) {
    onChange(filtros.filter((_, idx) => idx !== i));
  }
  function adicionar() {
    onChange([...filtros, filtroSegmentoVazio()]);
  }

  return (
    <div className="space-y-2">
      {filtros.map((filtro, i) => {
        const info = campoInfo(filtro.campo);
        return (
          <div key={i} className="flex items-center gap-2 flex-wrap">
            <Select value={filtro.campo} onValueChange={(v) => trocarCampo(i, v as CampoSegmento)}>
              <SelectTrigger className="h-8 w-52 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CAMPOS.map((c) => <SelectItem key={c.valor} value={c.valor}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filtro.operador} onValueChange={(v) => atualizarFiltro(i, { operador: v as OperadorSegmento })}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {info.operadores.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {info.tipoValor === "unidade" ? (
              <Select value={filtro.valor} onValueChange={(v) => atualizarFiltro(i, { valor: v })}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ssu">Shopping Santa Úrsula</SelectItem>
                  <SelectItem value="rbs">Ribeirão Shopping</SelectItem>
                </SelectContent>
              </Select>
            ) : info.tipoValor === "sexo" ? (
              <Select value={filtro.valor} onValueChange={(v) => atualizarFiltro(i, { valor: v })}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Feminino">Feminino</SelectItem>
                  <SelectItem value="Masculino">Masculino</SelectItem>
                  <SelectItem value="Outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            ) : info.tipoValor === "numero" ? (
              <Input
                type="number"
                className="h-8 w-24 text-xs"
                value={filtro.valor}
                onChange={(e) => atualizarFiltro(i, { valor: e.target.value })}
                placeholder="0"
              />
            ) : info.tipoValor === "etiqueta" ? (
              <Select value={filtro.valor} onValueChange={(v) => atualizarFiltro(i, { valor: v })}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Escolha a etiqueta" /></SelectTrigger>
                <SelectContent>
                  {(etiquetasQuery.data ?? []).map((e) => <SelectItem key={e.id} value={e.nome}>{e.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="h-8 w-52 text-xs"
                list="segmento-terapias-opcoes"
                value={filtro.valor}
                onChange={(e) => atualizarFiltro(i, { valor: e.target.value })}
                placeholder="Nome da terapia"
              />
            )}
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => remover(i)}>
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        );
      })}
      <datalist id="segmento-terapias-opcoes">
        {(terapiasQuery.data ?? []).map((t) => <option key={t} value={t} />)}
      </datalist>
      <div className="flex items-center justify-between gap-3 pt-1">
        <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={adicionar}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar filtro
        </Button>
        {filtros.length > 0 && (
          <Badge variant="secondary" className="text-xs gap-1.5">
            <Users className="h-3 w-3" />
            {contagemQuery.isFetching
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : contagemQuery.isError ? "erro no filtro" : `${contagemQuery.data?.total ?? 0} cliente(s)`}
          </Badge>
        )}
      </div>
    </div>
  );
}
