import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Flame, Thermometer, Snowflake } from "lucide-react";

export default function Reativacao() {
  const { unidadeSelecionada } = useUnidade();

  const { data, isLoading } = trpc.kanban.list.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0 },
    { enabled: !!unidadeSelecionada }
  );

  const columns = [
    { key: "quente", label: "Quente", icon: Flame, color: "orange", items: data?.quente || [] },
    { key: "morno", label: "Morno", icon: Thermometer, color: "yellow", items: data?.morno || [] },
    { key: "frio", label: "Frio", icon: Snowflake, color: "blue", items: data?.frio || [] },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Kanban de Reativação
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Clientes segmentados por temperatura — alimentado automaticamente pelo Belle
          </p>
        </div>
        <UnidadeSelector />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {columns.map((col) => (
            <div key={col.key} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <col.icon className={`h-4 w-4 text-${col.color}-500`} />
                <span className="font-medium text-sm">{col.label}</span>
                <Badge variant="secondary" className="ml-auto">
                  {col.items.length}
                </Badge>
              </div>
              <div className="space-y-2 min-h-[200px] rounded-lg bg-muted/30 p-2">
                {col.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    Nenhum cliente
                  </p>
                ) : (
                  col.items.slice(0, 50).map((cliente: any) => (
                    <Card key={cliente.codigo} className="border-border/50 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="pt-3 pb-3">
                        <div className="space-y-1">
                          <div className="font-medium text-sm truncate">{cliente.nome}</div>
                          {cliente.celular && (
                            <div className="text-xs text-muted-foreground">{cliente.celular}</div>
                          )}
                          {cliente.email && (
                            <div className="text-xs text-muted-foreground truncate">{cliente.email}</div>
                          )}
                          <div className="flex flex-wrap gap-1 pt-1">
                            {cliente.tags?.slice(0, 3).map((tag: any) => (
                              <Badge key={tag.id} variant="outline" className="text-xs px-1.5 py-0">
                                {tag.nome}
                              </Badge>
                            ))}
                          </div>
                          {cliente.dtCadastro && (
                            <div className="text-xs text-muted-foreground/70 pt-1">
                              Desde {cliente.dtCadastro}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
