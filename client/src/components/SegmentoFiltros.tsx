import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, Users } from "lucide-react";

export type CampoSegmento =
  | "unidade" | "sexo" | "diasDesdeUltimoAtendimento" | "diasDesdeCadastro" | "qtdAtendimentos" | "terapiaFeita" | "etiqueta" | "campoPersonalizado"
  | "terapeutaPreferencial" | "diasDesdeUltimoContato" | "diasAteAniversario" | "diaSemanaUltimaVisita" | "diaSemanaUltimos180Dias";
export type OperadorSegmento = "igual" | "diferente" | "maior" | "menor" | "maior_igual" | "menor_igual" | "contem";
export interface FiltroSegmento {
  campo: CampoSegmento;
  operador: OperadorSegmento;
  valor: string;
  /** Só quando campo === "campoPersonalizado": qual campo (campos_personalizados.id). */
  campoPersonalizadoId?: number;
}

type TipoValor = "unidade" | "sexo" | "numero" | "texto_livre" | "etiqueta" | "terapeuta" | "diaSemana";

/** DAYOFWEEK do MySQL: 1 = domingo ... 7 = sábado — mesma convenção usada em db.ts. */
const DIAS_SEMANA = [
  { valor: "1", label: "Domingo" }, { valor: "2", label: "Segunda" }, { valor: "3", label: "Terça" },
  { valor: "4", label: "Quarta" }, { valor: "5", label: "Quinta" }, { valor: "6", label: "Sexta" }, { valor: "7", label: "Sábado" },
];

const CAMPOS_BASE: Array<{ valor: CampoSegmento; label: string; tipoValor: TipoValor; operadores: Array<{ valor: OperadorSegmento; label: string }> }> = [
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

/**
 * Campos que dependem de uma única unidade (terapeuta preferencial e
 * último contato são por unidade — ver db.ts) — só aparecem quando o
 * construtor é usado dentro de um contexto de unidade só (o Funil de
 * Reativação); a Segmentação de Disparos, base inteira, não os oferece.
 */
const CAMPOS_POR_UNIDADE: Array<{ valor: CampoSegmento; label: string; tipoValor: TipoValor; operadores: Array<{ valor: OperadorSegmento; label: string }> }> = [
  { valor: "terapeutaPreferencial", label: "Terapeuta preferencial", tipoValor: "terapeuta", operadores: [
    { valor: "igual", label: "é" }, { valor: "diferente", label: "não é" },
  ] },
  { valor: "diasDesdeUltimoContato", label: "Dias desde o último contato", tipoValor: "numero", operadores: [
    { valor: "maior", label: "maior que" }, { valor: "menor", label: "menor que" }, { valor: "igual", label: "igual a" },
    { valor: "maior_igual", label: "maior ou igual a" }, { valor: "menor_igual", label: "menor ou igual a" },
  ] },
  { valor: "diasAteAniversario", label: "Dias até o aniversário", tipoValor: "numero", operadores: [
    { valor: "menor", label: "menor que" }, { valor: "menor_igual", label: "menor ou igual a" },
    { valor: "maior", label: "maior que" }, { valor: "igual", label: "igual a" },
  ] },
  { valor: "diaSemanaUltimaVisita", label: "Dia da semana na última visita", tipoValor: "diaSemana", operadores: [
    { valor: "igual", label: "é" }, { valor: "diferente", label: "não é" },
  ] },
  { valor: "diaSemanaUltimos180Dias", label: "Dia semana 180 dias", tipoValor: "diaSemana", operadores: [
    { valor: "igual", label: "esteve em" }, { valor: "diferente", label: "nunca esteve em" },
  ] },
];

function campos(unidadeId?: number) {
  return unidadeId ? [...CAMPOS_BASE, ...CAMPOS_POR_UNIDADE] : CAMPOS_BASE;
}

function campoInfo(campo: CampoSegmento, unidadeId?: number) {
  return campos(unidadeId).find((c) => c.valor === campo) ?? CAMPOS_BASE[0];
}

const UNIDADE_LABELS: Record<string, string> = { ssu: "Shopping Santa Úrsula", rbs: "Ribeirão Shopping" };

/** Texto legível de 1 filtro (ex.: "Dias desde a última visita maior ou igual a 30") — usado no tooltip do nome do funil. */
export function descreverFiltro(filtro: FiltroSegmento, unidadeId?: number): string {
  const info = campoInfo(filtro.campo, unidadeId);
  const operadorLabel = info.operadores.find((o) => o.valor === filtro.operador)?.label ?? filtro.operador;
  const valorLabel = info.tipoValor === "unidade" ? (UNIDADE_LABELS[filtro.valor] ?? filtro.valor)
    : info.tipoValor === "diaSemana" ? (DIAS_SEMANA.find((d) => d.valor === filtro.valor)?.label ?? filtro.valor)
    : filtro.valor;
  return `${info.label} ${operadorLabel} ${valorLabel}`;
}

/** Todos os filtros de um funil, um por linha — pro tooltip (title) do nome. */
export function descreverFiltros(filtros: FiltroSegmento[], unidadeId?: number): string {
  return filtros.map((f) => descreverFiltro(f, unidadeId)).join("\n");
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
export function SegmentoFiltros({ filtros, onChange, unidadeId }: { filtros: FiltroSegmento[]; onChange: (f: FiltroSegmento[]) => void; unidadeId?: number }) {
  const terapiasQuery = trpc.segmentos.opcoesTerapias.useQuery();
  const etiquetasQuery = trpc.etiquetas.list.useQuery();
  const terapeutasQuery = trpc.segmentos.opcoesTerapeutas.useQuery({ unidadeId: unidadeId ?? 0 }, { enabled: !!unidadeId });

  // Debounce evita 1 request por tecla digitada nos campos numéricos/texto.
  const [filtrosDebounced, setFiltrosDebounced] = useState(filtros);
  useEffect(() => {
    const timer = setTimeout(() => setFiltrosDebounced(filtros), 400);
    return () => clearTimeout(timer);
  }, [filtros]);

  const filtrosValidos = useMemo(() => filtrosDebounced.filter((f) => {
    if (!f.valor.trim()) return false;
    const tipoValor = campoInfo(f.campo, unidadeId).tipoValor;
    if (tipoValor === "numero") return Number.isFinite(Number(f.valor));
    return true;
  }), [filtrosDebounced, unidadeId]);

  const contagemQuery = trpc.segmentos.contar.useQuery({ filtros: filtrosValidos, unidadeId }, { enabled: filtrosValidos.length > 0 });

  function atualizarFiltro(i: number, patch: Partial<FiltroSegmento>) {
    onChange(filtros.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function trocarCampo(i: number, campo: CampoSegmento) {
    onChange(filtros.map((f, idx) => (idx === i ? { campo, operador: campoInfo(campo, unidadeId).operadores[0].valor, valor: "" } : f)));
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
        const info = campoInfo(filtro.campo, unidadeId);
        return (
          <div key={i} className="flex items-center gap-2 flex-wrap">
            <Select value={filtro.campo} onValueChange={(v) => trocarCampo(i, v as CampoSegmento)}>
              <SelectTrigger className="h-8 w-52 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {campos(unidadeId).map((c) => <SelectItem key={c.valor} value={c.valor}>{c.label}</SelectItem>)}
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
            ) : info.tipoValor === "terapeuta" ? (
              <Select value={filtro.valor} onValueChange={(v) => atualizarFiltro(i, { valor: v })}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder="Escolha o terapeuta" /></SelectTrigger>
                <SelectContent>
                  {(terapeutasQuery.data ?? []).map((t) => <SelectItem key={t.id} value={t.nomeAbreviado}>{t.nomeAbreviado}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : info.tipoValor === "diaSemana" ? (
              <Select value={filtro.valor} onValueChange={(v) => atualizarFiltro(i, { valor: v })}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Escolha o dia" /></SelectTrigger>
                <SelectContent>
                  {DIAS_SEMANA.map((d) => <SelectItem key={d.valor} value={d.valor}>{d.label}</SelectItem>)}
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
