import { useState, useEffect, DragEvent } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Loader2, Flame, Thermometer, Snowflake, Phone, MessageCircle, Calendar } from "lucide-react";
import { toast } from "sonner";

export default function Reativacao() {
  const { unidadeSelecionada } = useUnidade();
  const [draggedItem, setDraggedItem] = useState<any>(null);
  const [selectedCliente, setSelectedCliente] = useState<any>(null);
  const [columns, setColumns] = useState<{ quente: any[]; morno: any[]; frio: any[] } | null>(null);

  const { data, isLoading } = trpc.kanban.list.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0 },
    { enabled: !!unidadeSelecionada }
  );

  // Sync data to local state for drag-and-drop
  useEffect(() => {
    if (data) {
      setColumns({
        quente: data.quente,
        morno: data.morno,
        frio: data.frio,
      });
    }
  }, [data]);

  const onDragStart = (e: DragEvent, item: any) => {
    setDraggedItem(item);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const onDrop = (e: DragEvent, colKey: "quente" | "morno" | "frio") => {
    e.preventDefault();
    if (!draggedItem || !columns) return;

    // Remove from current column
    const newColumns = { ...columns };
    for (const key of ["quente", "morno", "frio"] as const) {
      newColumns[key] = newColumns[key].filter((c) => c.codigo !== draggedItem.codigo);
    }
    // Add to target column
    newColumns[colKey] = [...newColumns[colKey], draggedItem];
    setColumns(newColumns);
    setDraggedItem(null);

    toast.success(`Cliente movido para ${colKey === "quente" ? "Quente" : colKey === "morno" ? "Morno" : "Frio"}`);
  };

  const colDefs = [
    { key: "quente" as const, label: "Quente", icon: Flame, color: "orange", items: columns?.quente || data?.quente || [] },
    { key: "morno" as const, label: "Morno", icon: Thermometer, color: "yellow", items: columns?.morno || data?.morno || [] },
    { key: "frio" as const, label: "Frio", icon: Snowflake, color: "blue", items: columns?.frio || data?.frio || [] },
  ];

  const handleReativar = (cliente: any, acao: string) => {
    toast.success(`Ação "${acao}" registrada para ${cliente.nome}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Kanban de Reativação
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Arraste cards entre colunas — alimentado automaticamente pelo Belle
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
          {colDefs.map((col) => (
            <div key={col.key} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <col.icon className={`h-4 w-4 text-${col.color}-500`} />
                <span className="font-medium text-sm">{col.label}</span>
                <Badge variant="secondary" className="ml-auto">
                  {col.items.length}
                </Badge>
              </div>
              <div
                className="space-y-2 min-h-[300px] rounded-lg bg-muted/30 p-2 transition-colors"
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, col.key)}
              >
                {col.items.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    Nenhum cliente
                  </p>
                ) : (
                  col.items.slice(0, 50).map((cliente: any) => (
                    <Dialog key={cliente.codigo}>
                      <DialogTrigger asChild>
                        <Card
                          className="border-border/50 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                          draggable
                          onDragStart={(e) => onDragStart(e, cliente)}
                          onClick={() => setSelectedCliente(cliente)}
                        >
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
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                            {selectedCliente?.nome}
                          </DialogTitle>
                        </DialogHeader>
                        {selectedCliente && (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <span className="text-muted-foreground">Celular:</span>
                                <p className="font-medium">{selectedCliente.celular || "—"}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Email:</span>
                                <p className="font-medium">{selectedCliente.email || "—"}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Cadastro:</span>
                                <p className="font-medium">{selectedCliente.dtCadastro || "—"}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Rating:</span>
                                <p className="font-medium">{"★".repeat(selectedCliente.rating || 0)}</p>
                              </div>
                            </div>
                            {selectedCliente.tags?.length > 0 && (
                              <div className="flex flex-wrap gap-2">
                                {selectedCliente.tags.map((tag: any) => (
                                  <Badge key={tag.id} variant="secondary">{tag.nome}</Badge>
                                ))}
                              </div>
                            )}
                            <div className="space-y-2 pt-2 border-t border-border/50">
                              <h3 className="text-sm font-semibold">Ações de Reativação</h3>
                              <div className="grid grid-cols-3 gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleReativar(selectedCliente, "Ligar")}
                                >
                                  <Phone className="h-3 w-3 mr-1" /> Ligar
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleReativar(selectedCliente, "WhatsApp")}
                                >
                                  <MessageCircle className="h-3 w-3 mr-1" /> WhatsApp
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleReativar(selectedCliente, "Agendar")}
                                >
                                  <Calendar className="h-3 w-3 mr-1" /> Agendar
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
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
