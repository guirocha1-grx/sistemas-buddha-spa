import { useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar } from "lucide-react";

export default function Agenda() {
  const { unidadeSelecionada } = useUnidade();
  const today = new Date();
  const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  const { data: agendamentos, isLoading } = trpc.agenda.list.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0 },
    { enabled: !!unidadeSelecionada }
  );

  const agendamentosHoje = agendamentos?.filter((a: any) => a.data === fmtDate(today)) || [];
  const proximosAgendamentos = agendamentos?.filter((a: any) => a.data !== fmtDate(today)).slice(0, 20) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Agenda
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Agendamentos sincronizados com o Belle Software
          </p>
        </div>
        <UnidadeSelector />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Today */}
          <div>
            <h2 className="text-lg font-semibold mb-3" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Hoje — {fmtDate(today)}
            </h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {agendamentosHoje.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="pt-6 text-center">
                    <Calendar className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhum agendamento para hoje.</p>
                  </CardContent>
                </Card>
              ) : (
                agendamentosHoje.map((ag: any) => (
                  <Card key={ag.codigo} className="border-border/50 shadow-sm">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-sm">{ag.nomeCliente || ag.cliente}</div>
                          <div className="text-xs text-muted-foreground mt-1">{ag.servico}</div>
                          {ag.profissional && (
                            <div className="text-xs text-muted-foreground">Profissional: {ag.profissional}</div>
                          )}
                        </div>
                        <Badge variant="outline">{ag.hora}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Upcoming */}
          {proximosAgendamentos.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                Próximos Agendamentos
              </h2>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {proximosAgendamentos.map((ag: any) => (
                  <Card key={ag.codigo} className="border-border/50 shadow-sm">
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-sm">{ag.nomeCliente || ag.cliente}</div>
                          <div className="text-xs text-muted-foreground mt-1">{ag.servico}</div>
                          <div className="text-xs text-muted-foreground">{ag.data} às {ag.hora}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
