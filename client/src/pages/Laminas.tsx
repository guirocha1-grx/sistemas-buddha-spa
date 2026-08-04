import { useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Image, Plus, Loader2 } from "lucide-react";

export default function Laminas() {
  const { unidadeSelecionada } = useUnidade();
  const [showForm, setShowForm] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [template, setTemplate] = useState("promocional");

  const { data: laminas, isLoading } = trpc.laminas.list.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0 },
    { enabled: !!unidadeSelecionada }
  );

  const createLamina = trpc.laminas.create.useMutation({
    onSuccess: () => {
      setShowForm(false);
      setTitulo("");
    },
  });

  const templates = [
    { id: "promocional", nome: "Promocional" },
    { id: "institucional", nome: "Institucional" },
    { id: "evento", nome: "Evento" },
    { id: "stories", nome: "Stories" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Lâminas de Divulgação
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Criação de imagens para campanhas de marketing
          </p>
        </div>
        <div className="flex items-center gap-3">
          <UnidadeSelector />
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" /> Nova Lâmina
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Nova Lâmina
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Título</label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Promoção Dia das Mães" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Template</label>
              <div className="flex gap-2 flex-wrap">
                {templates.map((t) => (
                  <Button
                    key={t.id}
                    variant={template === t.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTemplate(t.id)}
                  >
                    {t.nome}
                  </Button>
                ))}
              </div>
            </div>
            <Button
              onClick={() => {
                if (titulo && unidadeSelecionada) {
                  createLamina.mutate({
                    unidadeId: unidadeSelecionada.id,
                    titulo,
                    template,
                  });
                }
              }}
              disabled={!titulo || createLamina.isPending}
            >
              {createLamina.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : laminas && laminas.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {laminas.map((lamina: any) => (
            <Card key={lamina.id} className="border-border/50 shadow-sm overflow-hidden">
              <div className="aspect-video bg-muted flex items-center justify-center">
                {lamina.imagemUrl ? (
                  <img src={lamina.imagemUrl} alt={lamina.titulo} className="w-full h-full object-cover" />
                ) : (
                  <Image className="h-10 w-10 text-muted-foreground/30" />
                )}
              </div>
              <CardContent className="pt-3 pb-3">
                <div className="font-medium text-sm">{lamina.titulo}</div>
                <div className="flex items-center justify-between mt-2">
                  <Badge variant="outline" className="text-xs">{lamina.template}</Badge>
                  <Badge
                    variant="secondary"
                    className={
                      lamina.status === "publicado" ? "bg-green-100 text-green-700" :
                      lamina.status === "pronto" ? "bg-blue-100 text-blue-700" :
                      ""
                    }
                  >
                    {lamina.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 text-center">
            <Image className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {unidadeSelecionada ? "Nenhuma lâmina criada ainda." : "Selecione uma unidade."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
