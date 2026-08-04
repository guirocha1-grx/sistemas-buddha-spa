import { useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Image, Plus, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

export default function Laminas() {
  const { unidadeSelecionada } = useUnidade();
  const [showForm, setShowForm] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [template, setTemplate] = useState("promocional");
  const [prompt, setPrompt] = useState("");
  const [gerandoId, setGerandoId] = useState<number | null>(null);

  const { data: laminas, isLoading } = trpc.laminas.list.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0 },
    { enabled: !!unidadeSelecionada }
  );

  const createLamina = trpc.laminas.create.useMutation({
    onSuccess: () => {
      setShowForm(false);
      setTitulo("");
      setPrompt("");
    },
  });

  const gerarLamina = trpc.laminas.gerar.useMutation({
    onSuccess: (data) => {
      if (data.imageUrl) {
        toast.success("Imagem gerada com sucesso!");
      } else if ((data as any).error) {
        toast.error(`Erro: ${(data as any).error}`);
      }
      setGerandoId(null);
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
      setGerandoId(null);
    },
  });

  const templates = [
    { id: "promocional", nome: "Promocional", desc: "Descontos e ofertas especiais" },
    { id: "institucional", nome: "Institucional", desc: "Identidade e serviços do spa" },
    { id: "evento", nome: "Evento", desc: "Eventos e workshops" },
    { id: "stories", nome: "Stories", desc: "Formato vertical para redes sociais" },
  ];

  const handleGerar = (laminaId: number) => {
    if (!prompt || !unidadeSelecionada) {
      toast.error("Digite um prompt para gerar a imagem");
      return;
    }

    const promptCompleto = `${prompt}. Estilo elegante e sofisticado para o Buddha Spa unidade ${unidadeSelecionada.nome}. Cores dourado e bordô. ${template === "stories" ? "Formato vertical 9:16." : "Formato paisagem."}`;
    setGerandoId(laminaId);
    gerarLamina.mutate({ id: laminaId, prompt: promptCompleto });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Lâminas de Divulgação
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Criação de imagens para campanhas de marketing com IA
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
            <CardDescription>Crie uma lâmina e gere a imagem com IA</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Título</label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex: Promoção Dia das Mães" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Template</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {templates.map((t) => (
                  <Button
                    key={t.id}
                    variant={template === t.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTemplate(t.id)}
                    className="flex-col h-auto py-2"
                  >
                    <span className="font-medium">{t.nome}</span>
                    <span className="text-xs text-muted-foreground">{t.desc}</span>
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Prompt para geração (opcional)</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ex: Imagem de uma mulher recebendo massagem relaxante em ambiente spa com velas e aromaterapia"
                rows={3}
              />
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
              {createLamina.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar Lâmina"}
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
              <div className="aspect-video bg-muted flex items-center justify-center relative">
                {lamina.imagemUrl ? (
                  <img src={lamina.imagemUrl} alt={lamina.titulo} className="w-full h-full object-cover" />
                ) : gerandoId === lamina.id ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
                    <span className="text-xs text-muted-foreground">Gerando imagem...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <Image className="h-10 w-10 text-muted-foreground/30" />
                    <span className="text-xs text-muted-foreground">Sem imagem</span>
                  </div>
                )}
              </div>
              <CardContent className="pt-3 pb-3 space-y-2">
                <div className="font-medium text-sm">{lamina.titulo}</div>
                <div className="flex items-center justify-between">
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
                {!lamina.imagemUrl && (
                  <div className="space-y-2 pt-2 border-t border-border/30">
                    <Input
                      placeholder="Prompt para gerar imagem..."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      className="text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleGerar(lamina.id)}
                      disabled={gerandoId === lamina.id}
                    >
                      <Wand2 className="h-3 w-3 mr-1" />
                      {gerandoId === lamina.id ? "Gerando..." : "Gerar com IA"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 text-center">
            <Sparkles className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {unidadeSelecionada ? "Nenhuma lâmina criada ainda. Clique em \"Nova Lâmina\" para começar." : "Selecione uma unidade."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
