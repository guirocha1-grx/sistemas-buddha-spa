/** @vitest-environment jsdom */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ClienteWhatsAppButton } from "@/components/ClienteWhatsAppButton";

const mutationState = vi.hoisted(() => ({
  mutate: vi.fn(),
  options: null as any,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    inbox: {
      conversas: {
        abrirPorCliente: {
          useMutation: (options: any) => {
            mutationState.options = options;
            return { mutate: mutationState.mutate, isPending: false };
          },
        },
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

beforeEach(() => {
  mutationState.mutate.mockReset();
  mutationState.options = null;
});

describe("ClienteWhatsAppButton", () => {
  it("dispara a abertura e navega para uma conversa existente", () => {
    const onOpenInbox = vi.fn();
    render(
      <ClienteWhatsAppButton
        cliente={{ id: 10, nome: "Cliente Existente", celular: "(16) 97400-7994" }}
        unidadeId={1}
        onOpenInbox={onOpenInbox}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir WhatsApp de Cliente Existente" }));
    expect(mutationState.mutate).toHaveBeenCalledWith({ clienteId: 10, unidadeId: 1 });

    mutationState.options.onSuccess({ conversaId: 41 });
    expect(onOpenInbox).toHaveBeenCalledWith(41);
  });

  it("dispara a abertura e navega para uma conversa recém-criada", () => {
    const onOpenInbox = vi.fn();
    render(
      <ClienteWhatsAppButton
        cliente={{ id: 11, nome: "Cliente Novo", celular: "5516999999999" }}
        unidadeId={2}
        onOpenInbox={onOpenInbox}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir WhatsApp de Cliente Novo" }));
    expect(mutationState.mutate).toHaveBeenCalledWith({ clienteId: 11, unidadeId: 2 });

    mutationState.options.onSuccess({ conversaId: 42 });
    expect(onOpenInbox).toHaveBeenCalledWith(42);
  });
});
