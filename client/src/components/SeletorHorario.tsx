import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTOS_5_EM_5 = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

/**
 * Hora + minuto como dois <Select>, pulando de 5 em 5 minutos — o
 * `step` do <input type="time"> nativo funciona no Android, mas o
 * seletor de roleta do Chrome desktop (único ambiente usado aqui,
 * 2026-09-04) ignora o step e sempre deixa escolher minuto a minuto.
 * Se o valor atual já tiver um minuto "quebrado" (ex.: horário antigo
 * importado do Belle), ele entra como opção extra pra não sumir da tela.
 */
export function SeletorHorario({
  value,
  onChange,
  className,
  disabled,
}: {
  value: string;
  onChange: (valor: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const [horaAtual, minutoAtual] = value ? value.split(":") : ["", ""];
  const opcoesMinuto = minutoAtual && !MINUTOS_5_EM_5.includes(minutoAtual) ? [minutoAtual, ...MINUTOS_5_EM_5] : MINUTOS_5_EM_5;

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Select disabled={disabled} value={horaAtual || undefined} onValueChange={(hora) => onChange(`${hora}:${minutoAtual || "00"}`)}>
        <SelectTrigger className="h-8 w-[4.25rem] text-xs"><SelectValue placeholder="--" /></SelectTrigger>
        <SelectContent>{HORAS.map((hora) => <SelectItem key={hora} value={hora}>{hora}</SelectItem>)}</SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select disabled={disabled} value={minutoAtual || undefined} onValueChange={(minuto) => onChange(`${horaAtual || "00"}:${minuto}`)}>
        <SelectTrigger className="h-8 w-[4.25rem] text-xs"><SelectValue placeholder="--" /></SelectTrigger>
        <SelectContent>{opcoesMinuto.map((minuto) => <SelectItem key={minuto} value={minuto}>{minuto}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
