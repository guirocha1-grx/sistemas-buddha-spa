import { useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Loader2, CheckCircle, XCircle, Clock } from "lucide-react";

export default function Leads() {
  const { unidadeSelecionada } = useUnidade();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    nome: "",
    celular: "",
    email: "",
    cpf: "",
    dataNascimento: "",
    genero: "",
    profissao: "",
    observacao: "",
    tipoOrigem: "",
    codOrigem: "",
  });

  const { data: leads, isLoading } = trpc.leads.list.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0 },
    { enabled: !!unidadeSelecionada }
  );

  const createLead = trpc.leads.create.useMutation({
    onSuccess: () => {
      setShowForm(false);
      setFormData({
        nome: "", celular: "", email: "", cpf: "", dataNascimento: "",
        genero: "", profissao: "", observacao: "", tipoOrigem: "", codOrigem: "",
      });
    },
  });

  const handleSubmit = () => {
    if (!formData.nome || !unidadeSelecionada) return;
    createLead.mutate({
      unidadeId: unidadeSelecionada.id,
      ...formData,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Leads
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Captura e envio automático de leads para o Belle Software
          </p>
        </div>
        <div className="flex items-center gap-3">
          <UnidadeSelector />
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <UserPlus className="h-4 w-4 mr-1" /> Novo Lead
          </Button>
        </div>
      </div>

      {showForm && (
        <Card className="border-border/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              Novo Lead
            </CardTitle>
            <CardDescription>
              O lead será enviado automaticamente para o Belle via endpoint POST /cliente/gravar-lead
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Nome *</Label>
                <Input value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
              </div>
              <div>
                <Label>Celular</Label>
                <Input value={formData.celular} onChange={(e) => setFormData({ ...formData, celular: e.target.value })} />
              </div>
              <div>
                <Label>Email</Label>
                <Input value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div>
                <Label>CPF</Label>
                <Input value={formData.cpf} onChange={(e) => setFormData({ ...formData, cpf: e.target.value })} />
              </div>
              <div>
                <Label>Data de Nascimento</Label>
                <Input value={formData.dataNascimento} onChange={(e) => setFormData({ ...formData, dataNascimento: e.target.value })} placeholder="DD/MM/AAAA" />
              </div>
              <div>
                <Label>Gênero</Label>
                <Input value={formData.genero} onChange={(e) => setFormData({ ...formData, genero: e.target.value })} placeholder="M / F" />
              </div>
              <div>
                <Label>Profissão</Label>
                <Input value={formData.profissao} onChange={(e) => setFormData({ ...formData, profissao: e.target.value })} />
              </div>
              <div>
                <Label>Tipo de Origem</Label>
                <Input value={formData.tipoOrigem} onChange={(e) => setFormData({ ...formData, tipoOrigem: e.target.value })} placeholder="Ex: Instagram" />
              </div>
            </div>
            <div>
              <Label>Observação</Label>
              <Input value={formData.observacao} onChange={(e) => setFormData({ ...formData, observacao: e.target.value })} />
            </div>
            <Button onClick={handleSubmit} disabled={!formData.nome || createLead.isPending}>
              {createLead.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enviar para Belle
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : leads && leads.length > 0 ? (
        <div className="grid gap-3">
          {leads.map((lead: any) => (
            <Card key={lead.id} className="border-border/50 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="font-medium text-sm">{lead.nome}</div>
                    {lead.celular && <div className="text-xs text-muted-foreground">{lead.celular}</div>}
                    {lead.email && <div className="text-xs text-muted-foreground">{lead.email}</div>}
                    {lead.observacao && <div className="text-xs text-muted-foreground mt-1">{lead.observacao}</div>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {lead.status === "enviado" && (
                      <Badge className="bg-green-100 text-green-700 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> Enviado
                      </Badge>
                    )}
                    {lead.status === "erro" && (
                      <Badge className="bg-red-100 text-red-700 flex items-center gap-1">
                        <XCircle className="h-3 w-3" /> Erro
                      </Badge>
                    )}
                    {lead.status === "pendente" && (
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Pendente
                      </Badge>
                    )}
                    {lead.belleCodigo && (
                      <span className="text-xs text-muted-foreground">Belle #{lead.belleCodigo}</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 text-center">
            <UserPlus className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {unidadeSelecionada ? "Nenhum lead capturado ainda." : "Selecione uma unidade."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
