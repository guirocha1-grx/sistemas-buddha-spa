import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useUnidade } from "@/contexts/UnidadeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Identidade de quem está atendendo (ver drizzle/schema.ts atendentes/
 * atendenteSessoes) — separada do login Google/Manus, que só autentica
 * a máquina/conta compartilhada da recepção. `atendente === null` com
 * `loading === false` significa que o gate (abaixo) deve aparecer.
 */
export function useAtendenteAtual() {
  const query = trpc.atendentes.atual.useQuery();
  return { atendente: query.data ?? null, loading: query.isLoading };
}

/**
 * Tela "Quem está atendendo?" — nome + PIN de 4 dígitos, escopado pela
 * unidade selecionada (cada unidade tem sua própria lista de
 * atendentes). Some sozinha assim que trpc.atendentes.entrar tem
 * sucesso, porque isso invalida atendentes.atual.
 */
export function AtendenteGate() {
  const { unidadeId, loading: unidadeLoading } = useUnidade();
  const utils = trpc.useUtils();
  const [selecionado, setSelecionado] = useState<number | null>(null);
  const [pin, setPin] = useState("");

  const listQuery = trpc.atendentes.list.useQuery({ unidadeId: unidadeId! }, { enabled: !!unidadeId });
  const entrarMutation = trpc.atendentes.entrar.useMutation({
    onSuccess: () => {
      setPin("");
      utils.atendentes.atual.invalidate();
    },
    onError: () => {
      toast.error("PIN inválido");
      setPin("");
    },
  });

  function handleEntrar() {
    if (!selecionado || pin.length !== 4) return;
    entrarMutation.mutate({ atendenteId: selecionado, pin });
  }

  if (unidadeLoading || listQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const atendentes = listQuery.data ?? [];

  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="flex flex-col items-center gap-6 p-8 max-w-sm w-full">
        <div className="flex flex-col items-center gap-2 text-center">
          <h2 className="text-xl font-semibold tracking-tight">Quem está atendendo?</h2>
          <p className="text-sm text-muted-foreground">
            Selecione seu nome e digite seu PIN pra continuar.
          </p>
        </div>

        {atendentes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center">
            Nenhum atendente cadastrado pra essa unidade ainda. Peça pra um administrador
            cadastrar em Configurações → Atendentes.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 w-full">
              {atendentes.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelecionado(a.id)}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                    selecionado === a.id ? "border-primary bg-primary/10 font-medium" : "hover:bg-accent"
                  }`}
                >
                  {a.nome}
                </button>
              ))}
            </div>

            <Input
              type="password"
              inputMode="numeric"
              maxLength={4}
              placeholder="PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              onKeyDown={(e) => e.key === "Enter" && handleEntrar()}
              className="text-center text-lg tracking-[0.5em]"
              disabled={!selecionado}
              autoFocus
            />

            <Button
              onClick={handleEntrar}
              disabled={!selecionado || pin.length !== 4 || entrarMutation.isPending}
              className="w-full"
            >
              {entrarMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Entrar
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
