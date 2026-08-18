import { useUnidade } from "@/contexts/UnidadeContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin } from "lucide-react";

export default function UnidadeSelector() {
  const { unidadeSelecionada, setUnidadeId, unidades } = useUnidade();

  if (!unidadeSelecionada || unidades.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <MapPin className="h-4 w-4 text-muted-foreground" />
      <Select
        value={String(unidadeSelecionada.id)}
        onValueChange={(val) => setUnidadeId(parseInt(val, 10))}
      >
        <SelectTrigger className="w-[220px] h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {unidades.map((u) => (
            <SelectItem key={u.id} value={String(u.id)}>
              {u.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
