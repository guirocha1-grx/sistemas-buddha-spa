import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { HeartHandshake, Plus, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

type TerapeutaForm = { nomeCompleto: string; nomeAbreviado: string; celular: string; cpf: string };
const FORM_VAZIO: TerapeutaForm = { nomeCompleto: "", nomeAbreviado: "", celular: "", cpf: "" };

/**
 * CRUD de terapeutas (nome completo, nome abreviado, celular, CPF
 * opcional) pra uma unidade — hoje só cadastro de referência, sem
 * login. Renderizado dentro do card de cada unidade em
 * Configuracoes.tsx, mesmo padrão de AtendentesSection.
 */
export function TerapeutasSection({ unidadeId }: { unidadeId: number }) {
  const utils = trpc.useUtils();
  const { data: terapeutas, isLoading } = trpc.terapeutas.listAdmin.useQuery({ unidadeId });

  const [novo, setNovo] = useState<TerapeutaForm>(FORM_VAZIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [formEdicao, setFormEdicao] = useState<TerapeutaForm>(FORM_VAZIO);

  const criarMutation = trpc.terapeutas.criar.useMutation({
    onSuccess: () => {
      setNovo(FORM_VAZIO);
      utils.terapeutas.listAdmin.invalidate({ unidadeId });
      toast.success("Terapeuta cadastrado.");
    },
    onError: (e) => toast.error(e.message),
  });

  const atualizarMutation = trpc.terapeutas.atualizar.useMutation({
    onSuccess: () => {
      setEditandoId(null);
      utils.terapeutas.listAdmin.invalidate({ unidadeId });
    },
    onError: (e) => toast.error(e.message),
  });

  function handleCriar() {
    if (!novo.nomeCompleto.trim() || !novo.nomeAbreviado.trim()) return;
    criarMutation.mutate({
      unidadeId,
      nomeCompleto: novo.nomeCompleto.trim(),
      nomeAbreviado: novo.nomeAbreviado.trim(),
      celular: novo.celular.trim() || undefined,
      cpf: novo.cpf.trim() || undefined,
    });
  }

  function iniciarEdicao(t: { id: number; nomeCompleto: string; nomeAbreviado: string; celular: string | null; cpf: string | null }) {
    setEditandoId(t.id);
    setFormEdicao({ nomeCompleto: t.nomeCompleto, nomeAbreviado: t.nomeAbreviado, celular: t.celular ?? "", cpf: t.cpf ?? "" });
  }

  function handleSalvarEdicao(id: number) {
    if (!formEdicao.nomeCompleto.trim() || !formEdicao.nomeAbreviado.trim()) return;
    atualizarMutation.mutate({
      id,
      nomeCompleto: formEdicao.nomeCompleto.trim(),
      nomeAbreviado: formEdicao.nomeAbreviado.trim(),
      celular: formEdicao.celular.trim() || null,
      cpf: formEdicao.cpf.trim() || null,
    });
  }

  return (
    <div className="border-t pt-3 mt-1 space-y-3">
      <Label className="flex items-center gap-1.5 text-sm">
        <HeartHandshake className="h-3.5 w-3.5" /> Terapeutas
      </Label>
      <p className="text-xs text-muted-foreground">
        Cadastro dos profissionais desta unidade — nome completo, nome abreviado (usado em relatórios), celular e CPF (opcional).
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
                    <Input placeholder="CPF (opcional)" value={formEdicao.cpf} onChange={(e) => setFormEdicao((f) => ({ ...f, cpf: e.target.value }))} className="h-8" />
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
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">
                      {t.nomeCompleto} <span className="text-muted-foreground font-normal">({t.nomeAbreviado})</span>
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {t.celular || "sem celular"}{t.cpf ? ` · CPF ${t.cpf}` : ""}
                    </p>
                  </div>
                  {!t.ativo && <Badge variant="secondary">Inativo</Badge>}
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => iniciarEdicao(t)} title="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() => atualizarMutation.mutate({ id: t.id, ativo: !t.ativo })}
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
        <Input placeholder="CPF (opcional)" value={novo.cpf} onChange={(e) => setNovo((f) => ({ ...f, cpf: e.target.value }))} />
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
