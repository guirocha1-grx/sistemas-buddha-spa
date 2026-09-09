import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function anosDisponiveis(anoAtualDoValor: number): number[] {
  const anoAtual = new Date().getFullYear();
  const anoMin = Math.min(anoAtual - 4, anoAtualDoValor);
  const anoMax = Math.max(anoAtual + 1, anoAtualDoValor);
  const anos: number[] = [];
  for (let a = anoMax; a >= anoMin; a--) anos.push(a);
  return anos;
}

/**
 * Mês + ano como dois <Select>, no lugar do <input type="month">
 * nativo — mesmo motivo do SeletorHorario: o Chrome desktop usado
 * nesta recepção não abre o picker nativo direito (2026-09-08).
 */
export function SeletorMes({
  value, // "AAAA-MM"
  onChange,
  className,
  disabled,
  size = "default",
}: {
  value: string;
  onChange: (valor: string) => void;
  className?: string;
  disabled?: boolean;
  size?: "default" | "sm";
}) {
  const [anoStr, mesStr] = value ? value.split("-") : ["", ""];
  const ano = anoStr ? Number(anoStr) : new Date().getFullYear();
  const anos = anosDisponiveis(ano);
  const alturaClasse = size === "sm" ? "h-7 text-xs" : "h-9 text-sm";
  const larguraMesClasse = size === "sm" ? "w-24" : "w-36";
  const larguraAnoClasse = size === "sm" ? "w-16" : "w-24";
  const nomesMes = size === "sm" ? NOMES_MES.map((n) => n.slice(0, 3)) : NOMES_MES;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Select
        disabled={disabled}
        value={mesStr || undefined}
        onValueChange={(mes) => onChange(`${anoStr || ano}-${mes}`)}
      >
        <SelectTrigger className={cn(alturaClasse, larguraMesClasse)}><SelectValue placeholder="Mês" /></SelectTrigger>
        <SelectContent>
          {nomesMes.map((nome, i) => {
            const mm = String(i + 1).padStart(2, "0");
            return <SelectItem key={mm} value={mm}>{nome}</SelectItem>;
          })}
        </SelectContent>
      </Select>
      <Select
        disabled={disabled}
        value={anoStr || undefined}
        onValueChange={(novoAno) => onChange(`${novoAno}-${mesStr || "01"}`)}
      >
        <SelectTrigger className={cn(alturaClasse, larguraAnoClasse)}><SelectValue placeholder="Ano" /></SelectTrigger>
        <SelectContent>
          {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
