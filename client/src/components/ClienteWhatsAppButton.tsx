import React, { type MouseEvent } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export type ClienteComContato = {
  id: number;
  nome: string;
  celular?: string | null;
  celular2?: string | null;
  telefone?: string | null;
};

export function ClienteWhatsAppButton({
  cliente,
  unidadeId,
  onOpenInbox,
}: {
  cliente: ClienteComContato;
  unidadeId?: number;
  onOpenInbox: (conversaId: number) => void;
}) {
  const abrirConversaMutation = trpc.inbox.conversas.abrirPorCliente.useMutation({
    onSuccess: ({ conversaId }) => onOpenInbox(conversaId),
    onError: (error) => toast.error(error.message),
  });
  const temTelefone = Boolean(cliente.celular || cliente.celular2 || cliente.telefone);

  function abrirNoInbox(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    if (!temTelefone) {
      toast.error("Este cliente não possui telefone ou celular cadastrado.");
      return;
    }
    if (!unidadeId) {
      toast.error("Selecione uma unidade antes de abrir o Inbox.");
      return;
    }
    abrirConversaMutation.mutate({ clienteId: cliente.id, unidadeId });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
      aria-label={`Abrir WhatsApp de ${cliente.nome}`}
      title={temTelefone ? "Abrir conversa no Inbox" : "Cliente sem telefone cadastrado"}
      disabled={abrirConversaMutation.isPending || !temTelefone}
      onClick={abrirNoInbox}
    >
      <MessageCircle className="h-4 w-4" />
    </Button>
  );
}
