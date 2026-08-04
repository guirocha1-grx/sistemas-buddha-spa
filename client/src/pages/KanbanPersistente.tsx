import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useUnidade } from "@/contexts/UnidadeContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Flame, Coffee, Snowflake, X, TrendingUp, Calendar } from "lucide-react";

export default function KanbanPersistente() {
  const { unidadeSelecionada } = useUnidade();
  const [oportunidades, setOportunidades] = useState<any[]>([]);
  const [fases, setFases] = useState<any[]>([]);
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [dialogPerda, setDialogPerda] = useState<number | null>(null);
  const [motivoPerda, setMotivoPerda] = useState("");

  const { data: fasesData } = trpc.kanbanPersistente.fases.useQuery();
  const { data: oportData, refetch } = trpc.kanbanPersistente.list.useQuery({
    unidadeId: unidadeSelecionada?.id,
  });

  const moverMutation = trpc.kanbanPersistente.mover.useMutation({
    onSuccess: () => {
      toast.success("Oportunidade movida");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const perdaMutation = trpc.kanbanPersistente.registrarPerda.useMutation({
    onSuccess: () => {
      toast.success("Perda registrada");
      setDialogPerda(null);
      setMotivoPerda("");
      refetch();
    },
  });

  useEffect(() => {
    if (fasesData) setFases(fasesData);
  }, [fasesData]);

  useEffect(() => {
    if (oportData) setOportunidades(oportData as any[]);
  }, [oportData]);

  const handleDragStart = (e: React.DragEvent, atendimentoId: number) => {
    setDraggedItem(atendimentoId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, faseCod: number) => {
    e.preventDefault();
    if (draggedItem === null) return;
    moverMutation.mutate({
      atendimentoId: draggedItem,
      novaFaseCod: faseCod,
    });
    setDraggedItem(null);
  };

  const handleConfirmarPerda = () => {
    if (!dialogPerda || !motivoPerda.trim()) return;
    perdaMutation.mutate({
      atendimentoId: dialogPerda,
      motivoPerda: motivoPerda.trim(),
    });
  };

  const getOportunidadesByFase = (faseCod: number) => {
    return oportunidades.filter((o) => o.atendimento?.statusAtendimentoNew === faseCod);
  };

  const fmtDate = (d: any) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("pt-BR");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-light text-foreground">Kanban de Vendas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {unidadeSelecionada?.nome} — Arraste cards entre as colunas
          </p>
        </div>
        <Badge variant="outline">{oportunidades.length} oportunidades</Badge>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {fases.filter(f => f.codFase !== 99).map((fase) => {
          const items = getOportunidadesByFase(fase.codFase);
          return (
            <div
              key={fase.codFase}
              className="min-w-[280px] w-[280px] shrink-0"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, fase.codFase)}
            >
              <div className="rounded-lg bg-card/50 border border-border/40 h-full flex flex-col">
                <div className="p-3 border-b border-border/40">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium font-serif">{fase.nomeFase}</h3>
                    <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                  </div>
                </div>
                <div className="p-2 space-y-2 flex-1 min-h-[200px]">
                  {items.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">
                      Nenhuma oportunidade
                    </p>
                  ) : (
                    items.map((item) => (
                      <div
                        key={item.atendimento.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.atendimento.id)}
                        className={cn(
                          "p-3 rounded-md bg-background border border-border/40 cursor-move hover:shadow-md transition-shadow",
                          draggedItem === item.atendimento.id && "opacity-50"
                        )}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-sm font-medium truncate">
                            {item.cliente?.nome || "Sem nome"}
                          </span>
                        </div>
                        {item.atendimento.observacoes && (
                          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                            {item.atendimento.observacoes}
                          </p>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {fmtDate(item.atendimento.dataAtendimento)}
                          </span>
                          {item.atendimento.tipoAtendimento && (
                            <Badge variant="outline" className="text-xs">
                              {item.atendimento.tipoAtendimento.replace(/_/g, " ")}
                            </Badge>
                          )}
                        </div>
                        {item.atendimento.tipoAtendimento !== "venda_concretizada" && (
                          <button
                            onClick={() => setDialogPerda(item.atendimento.id)}
                            className="mt-2 text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                          >
                            <X className="h-3 w-3" /> Registrar perda
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dialog de perda */}
      <Dialog open={dialogPerda !== null} onOpenChange={(open) => !open && setDialogPerda(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar Perda</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Descreva o motivo da perda:</p>
            <Textarea
              value={motivoPerda}
              onChange={(e) => setMotivoPerda(e.target.value)}
              rows={3}
              placeholder="Ex: Cliente não respondeu, preço muito alto, desistiu..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogPerda(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleConfirmarPerda}
              disabled={!motivoPerda.trim() || perdaMutation.isPending}
            >
              Confirmar Perda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
