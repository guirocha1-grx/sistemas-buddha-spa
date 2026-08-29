import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HeartHandshake, Plus, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

type Vinculo = "fixo" | "freelancer";
type Nivel = "diamante" | "ouro" | "prata" | "bronze";
type TerapeutaForm = { nomeCompleto: string; nomeAbreviado: string; celular: string; whatsappParticipanteId: string; cpf: string; vinculo: Vinculo; nivel: Nivel };
const FORM_VAZIO: TerapeutaForm = { nomeCompleto: "", nomeAbreviado: "", celular: "", whatsappParticipanteId: "", cpf: "", vinculo: "fixo", nivel: "bronze" };

// Símbolo compacto por nível — cabe numa lista/relatório sem virar texto extra.
const SIMBOLO_NIVEL: Record<Nivel, string> = { diamante: "💎", ouro: "🥇", prata: "🥈", bronze: "🥉" };
const LABEL_NIVEL: Record<Nivel, string> = { diamante: "Diamante", ouro: "Ouro", prata: "Prata", bronze: "Bronze" };
const NIVEIS: Nivel[] = ["diamante", "ouro", "prata", "bronze"];

/**
 * CRUD de terapeutas (nome completo, nome abreviado, celular, ID do
 * participante WhatsApp, CPF opcional, vínculo fixo/freelancer) pra
 * uma unidade. Celular/ID WhatsApp/vínculo são editáveis direto na
 * lista (salvam sozinhos ao sair do campo ou trocar a opção) — nome/
 * CPF continuam só pelo lápis, edição menos frequente. Renderizado
 * dentro do card de cada unidade em Configuracoes.tsx, mesmo padrão
 * de AtendentesSection.
 */
export function TerapeutasSection({ unidadeId }: { unidadeId: number }) {
  const utils = trpc.useUtils();
  const { data: terapeutas, isLoading } = trpc.terapeutas.listAdmin.useQuery({ unidadeId });

  const [novo, setNovo] = useState<TerapeutaForm>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [formEdicao, setFormEdicao] = useState<TerapeutaForm>(FORM_VAZIO);

  const invalidar = () => utils.terapeutas.listAdmin.invalidate({ unidadeId });

  const criarMutation = trpc.terapeutas.criar.useMutation({
    onSuccess: () => {
      setNovo(FORM_VAZIO);
      invalidar();
      toast.success("Terapeuta cadastrado.");
    },
    onError: (e) => toast.error(e.message),
  });

  const atualizarMutation = trpc.terapeutas.atualizar.useMutation({
    onSuccess: () => {
      setEditandoId(null);
      invalidar();
    },
    onError: (e) => toast.error(e.message),
  });

  // Campo inline (celular/ID WhatsApp) salva sozinho ao sair do campo, só
  // se o valor realmente mudou — evita gravar a cada tecla ou re-salvar
  // sem necessidade quando o usuário só clica e sai do campo.
  const inlineMutation = trpc.terapeutas.atualizar.useMutation({
    onSuccess: () => invalidar(),
    onError: (e) => toast.error(e.message),
  });

  function handleCriar() {
    if (!novo.nomeCompleto.trim() || !novo.nomeAbreviado.trim()) return;
    criarMutation.mutate({
      unidadeId,
      nomeCompleto: novo.nomeCompleto.trim(),
      nomeAbreviado: novo.nomeAbreviado.trim(),
      celular: novo.celular.trim() || undefined,
      whatsappParticipanteId: novo.whatsappParticipanteId.trim() || undefined,
      cpf: novo.cpf.trim() || undefined,
      vinculo: novo.vinculo,
      nivel: novo.nivel,
    });
  }

  function iniciarEdicao(t: { id: number; nomeCompleto: string; nomeAbreviado: string; celular: string | null; whatsappParticipanteId: string | null; cpf: string | null; vinculo: Vinculo; nivel: Nivel }) {
    setEditandoId(t.id);
    setFormEdicao({ nomeCompleto: t.nomeCompleto, nomeAbreviado: t.nomeAbreviado, celular: t.celular ?? "", whatsappParticipanteId: t.whatsappParticipanteId ?? "", cpf: t.cpf ?? "", vinculo: t.vinculo, nivel: t.nivel });
  }

  function handleSalvarEdicao(id: number) {
    if (!formEdicao.nomeCompleto.trim() || !formEdicao.nomeAbreviado.trim()) return;
    atualizarMutation.mutate({
      id,
      unidadeId,
      nomeCompleto: formEdicao.nomeCompleto.trim(),
      nomeAbreviado: formEdicao.nomeAbreviado.trim(),
      celular: formEdicao.celular.trim() || null,
      whatsappParticipanteId: formEdicao.whatsappParticipanteId.trim() || null,
      cpf: formEdicao.cpf.trim() || null,
      vinculo: formEdicao.vinculo,
      nivel: formEdicao.nivel,
    });
  }

  return (
    <div className="border-t pt-3 mt-1 space-y-3">
      <Label className="flex items-center gap-1.5 text-sm">
        <HeartHandshake className="h-3.5 w-3.5" /> Terapeutas
      </Label>
      <p className="text-xs text-muted-foreground">
        Cadastro dos profissionais desta unidade. Celular, ID WhatsApp e vínculo editam direto na lista; nome e CPF ficam no lápis.
      </p>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-1.5">
          {(terapeutas ?? []).map((t) => (
            <div key={t.id} className="border rounded-lg px-3 py-2 text-sm">
              {editandoId === t.id ? (
                <div className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <Input placeholder="Nome completo" value={formEdicao.nomeCompleto} onChange={(e) => setFormEdicao((f) => ({ ...f, nomeCompleto: e.target.value }))} className="h-8" />
                    <Input placeholder="Nome abreviado" value={formEdicao.nomeAbreviado} onChange={(e) => setFormEdicao((f) => ({ ...f, nomeAbreviado: e.target.value }))} className="h-8" />
                    <Input placeholder="Celular" value={formEdicao.celular} onChange={(e) => setFormEdicao((f) => ({ ...f, celular: e.target.value }))} className="h-8" />
                    <Input placeholder="ID WhatsApp (LID, opcional)" value={formEdicao.whatsappParticipanteId} onChange={(e) => setFormEdicao((f) => ({ ...f, whatsappParticipanteId: e.target.value }))} className="h-8" />
                    <Input placeholder="CPF (opcional)" value={formEdicao.cpf} onChange={(e) => setFormEdicao((f) => ({ ...f, cpf: e.target.value }))} className="h-8" />
                    <Select value={formEdicao.vinculo} onValueChange={(v) => setFormEdicao((f) => ({ ...f, vinculo: v as Vinculo }))}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixo">Fixo</SelectItem>
                        <SelectItem value="freelancer">Freelancer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={formEdicao.nivel} onValueChange={(v) => setFormEdicao((f) => ({ ...f, nivel: v as Nivel }))}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {NIVEIS.map((n) => <SelectItem key={n} value={n}>{SIMBOLO_NIVEL[n]} {LABEL_NIVEL[n]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-8" onClick={() => handleSalvarEdicao(t.id)} disabled={atualizarMutation.isPending}>
                      {atualizarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salvar"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditandoId(null)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-base" title={`Nível ${LABEL_NIVEL[t.nivel]}`}>{SIMBOLO_NIVEL[t.nivel]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">
                      {t.nomeCompleto} <span className="text-muted-foreground font-normal">({t.nomeAbreviado})</span>
                    </p>
                    {t.cpf && <p className="text-[11px] text-muted-foreground truncate">CPF {t.cpf}</p>}
                  </div>
                  <Input
                    key={`cel-${t.id}-${t.celular ?? ""}`}
                    defaultValue={t.celular ?? ""}
                    placeholder="Celular"
                    className="h-8 w-32 shrink-0"
                    onBlur={(e) => {
                      const valor = e.target.value.trim() || null;
                      if (valor !== (t.celular ?? null)) inlineMutation.mutate({ id: t.id, unidadeId, celular: valor });
                    }}
                  />
                  <Input
                    key={`wid-${t.id}-${t.whatsappParticipanteId ?? ""}`}
                    defaultValue={t.whatsappParticipanteId ?? ""}
                    placeholder="ID WhatsApp"
                    className="h-8 w-32 shrink-0"
                    onBlur={(e) => {
                      const valor = e.target.value.trim() || null;
                      if (valor !== (t.whatsappParticipanteId ?? null)) inlineMutation.mutate({ id: t.id, unidadeId, whatsappParticipanteId: valor });
                    }}
                  />
                  <Select value={t.vinculo} onValueChange={(v) => inlineMutation.mutate({ id: t.id, unidadeId, vinculo: v as Vinculo })}>
                    <SelectTrigger className="h-8 w-28 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixo">Fixo</SelectItem>
                      <SelectItem value="freelancer">Freelancer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={t.nivel} onValueChange={(v) => inlineMutation.mutate({ id: t.id, unidadeId, nivel: v as Nivel })}>
                    <SelectTrigger className="h-8 w-28 shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NIVEIS.map((n) => <SelectItem key={n} value={n}>{SIMBOLO_NIVEL[n]} {LABEL_NIVEL[n]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!t.ativo && <Badge variant="secondary">Inativo</Badge>}
                  <Button size="sm" variant="ghost" className="h-8 px-2 shrink-0" onClick={() => iniciarEdicao(t)} title="Editar nome/CPF">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs shrink-0"
                    onClick={() => atualizarMutation.mutate({ id: t.id, unidadeId, ativo: !t.ativo })}
                    disabled={atualizarMutation.isPending}
                  >
                    {t.ativo ? "Desativar" : "Ativar"}
                  </Button>
                </div>
              )}
            </div>
          ))}
          {(terapeutas ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum terapeuta cadastrado ainda.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <Input placeholder="Nome completo" value={novo.nomeCompleto} onChange={(e) => setNovo((f) => ({ ...f, nomeCompleto: e.target.value }))} />
        <Input placeholder="Nome abreviado" value={novo.nomeAbreviado} onChange={(e) => setNovo((f) => ({ ...f, nomeAbreviado: e.target.value }))} />
        <Input placeholder="Celular" value={novo.celular} onChange={(e) => setNovo((f) => ({ ...f, celular: e.target.value }))} />
        <Input placeholder="ID WhatsApp (LID, opcional)" value={novo.whatsappParticipanteId} onChange={(e) => setNovo((f) => ({ ...f, whatsappParticipanteId: e.target.value }))} />
        <Input placeholder="CPF (opcional)" value={novo.cpf} onChange={(e) => setNovo((f) => ({ ...f, cpf: e.target.value }))} />
        <Select value={novo.vinculo} onValueChange={(v) => setNovo((f) => ({ ...f, vinculo: v as Vinculo }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fixo">Fixo</SelectItem>
            <SelectItem value="freelancer">Freelancer</SelectItem>
          </SelectContent>
        </Select>
        <Select value={novo.nivel} onValueChange={(v) => setNovo((f) => ({ ...f, nivel: v as Nivel }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {NIVEIS.map((n) => <SelectItem key={n} value={n}>{SIMBOLO_NIVEL[n]} {LABEL_NIVEL[n]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleCriar}
        disabled={!novo.nomeCompleto.trim() || !novo.nomeAbreviado.trim() || criarMutation.isPending}
      >
        {criarMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
        Adicionar
      </Button>
    </div>
  );
}
