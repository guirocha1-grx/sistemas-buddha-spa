import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Users2, Plus, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

/**
 * CRUD de atendentes (identidade por PIN, ver drizzle/schema.ts) pra
 * uma unidade — nome + PIN de 4 dígitos, sem expor o hash. Renderizado
 * dentro do card de cada unidade em Configuracoes.tsx.
 */
export function AtendentesSection({ unidadeId }: { unidadeId: number }) {
  const utils = trpc.useUtils();
  const { data: atendentes, isLoading } = trpc.atendentes.listAdmin.useQuery({ unidadeId });

  const [novoNome, setNovoNome] = useState("");
  const [novoPin, setNovoPin] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [pinEdicao, setPinEdicao] = useState("");

  const criarMutation = trpc.atendentes.criar.useMutation({
    onSuccess: () => {
      setNovoNome("");
      setNovoPin("");
      utils.atendentes.listAdmin.invalidate({ unidadeId });
      toast.success("Atendente cadastrado.");
    },
    onError: (e) => toast.error(e.message),
  });

  const atualizarMutation = trpc.atendentes.atualizar.useMutation({
    onSuccess: () => {
      setEditandoId(null);
      setPinEdicao("");
      utils.atendentes.listAdmin.invalidate({ unidadeId });
    },
    onError: (e) => toast.error(e.message),
  });

  function handleCriar() {
    if (!novoNome.trim() || novoPin.length !== 4) return;
    criarMutation.mutate({ unidadeId, nome: novoNome.trim(), pin: novoPin });
  }

  function handleRedefinirPin(id: number) {
    if (pinEdicao.length !== 4) return;
    atualizarMutation.mutate({ id, pin: pinEdicao });
  }

  return (
    <div className="border-t pt-3 mt-1 space-y-3">
      <Label className="flex items-center gap-1.5 text-sm">
        <Users2 className="h-3.5 w-3.5" /> Atendentes (identidade por PIN)
      </Label>
      <p className="text-xs text-muted-foreground">
        Cada atendente entra com nome + PIN de 4 dígitos ao abrir o sistema — identifica quem
        realmente agiu no Log de Auditoria e nas respostas do Inbox, independente de qual conta
        Google está logada na máquina compartilhada.
      </p>

      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-1.5">
          {(atendentes ?? []).map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-sm border rounded-lg px-3 py-2">
              <span className="flex-1 truncate">{a.nome}</span>
              {!a.ativo && <Badge variant="secondary">Inativo</Badge>}
              {editandoId === a.id ? (
                <>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="Novo PIN"
                    value={pinEdicao}
                    onChange={(e) => setPinEdicao(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    className="w-24 h-8 text-center"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    onClick={() => handleRedefinirPin(a.id)}
                    disabled={pinEdicao.length !== 4 || atualizarMutation.isPending}
                  >
                    Salvar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => { setEditandoId(null); setPinEdicao(""); }}
                  >
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2"
                    onClick={() => setEditandoId(a.id)}
                    title="Redefinir PIN"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() => atualizarMutation.mutate({ id: a.id, ativo: !a.ativo })}
                    disabled={atualizarMutation.isPending}
                  >
                    {a.ativo ? "Desativar" : "Ativar"}
                  </Button>
                </>
              )}
            </div>
          ))}
          {(atendentes ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhum atendente cadastrado ainda.</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          placeholder="Nome do atendente"
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          className="flex-1"
        />
        <Input
          type="password"
          inputMode="numeric"
          maxLength={4}
          placeholder="PIN (4 dígitos)"
          value={novoPin}
          onChange={(e) => setNovoPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className="w-32"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleCriar}
          disabled={!novoNome.trim() || novoPin.length !== 4 || criarMutation.isPending}
        >
          {criarMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Adicionar
        </Button>
      </div>
    </div>
  );
}
