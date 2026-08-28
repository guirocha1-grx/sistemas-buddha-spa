// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn().mockResolvedValue({ success: true }),
  invalidate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/contexts/UnidadeContext", () => ({
  useUnidade: () => ({
    loading: false,
    unidades: [
      { id: 1, nome: "Ribeirão Shopping", interClientId: "id", interClientSecret: "secret", interCertificado: "cert", interChavePrivada: "key", mpAccessToken: "token" },
      { id: 2, nome: "Shopping Santa Úrsula" },
    ],
  }),
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 1, role: "admin", name: "Teste" } }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    inter: { sincronizar: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) }, extratos: { invalidate: mocks.invalidate } },
    sicredi: { sincronizar: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) } },
    contas: {
      sincronizarCaixaFisico: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) },
      sincronizarMercadoPago: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) },
      registrarHeartbeatSincronizacaoDiaria: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    adquirentes: { sincronizarMercadoPago: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) }, vendas: { invalidate: mocks.invalidate } },
    comandaRecepcao: {
      sincronizar: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) },
      sincronizarItens: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) },
      sincronizarContasBancariasParaDrive: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) },
      resumo: { invalidate: mocks.invalidate }, itensDetalhe: { invalidate: mocks.invalidate },
    },
    financeiro: { dashboard: { invalidate: mocks.invalidate }, dashboardConsolidado: { invalidate: mocks.invalidate } },
    permissoes: { minhas: { useQuery: () => ({ data: { restrito: false, modulos: [], subsecoes: [] }, isLoading: false }) } },
    useUtils: () => ({
      inter: { extratos: { invalidate: mocks.invalidate } }, adquirentes: { vendas: { invalidate: mocks.invalidate } },
      comandaRecepcao: { resumo: { invalidate: mocks.invalidate }, itensDetalhe: { invalidate: mocks.invalidate } },
      financeiro: { dashboard: { invalidate: mocks.invalidate }, dashboardConsolidado: { invalidate: mocks.invalidate } },
    }),
  },
}));

import GlobalSyncCenter from "../client/src/components/GlobalSyncCenter";

// Sem isso, os testes deste arquivo compartilham o mesmo document (o
// projeto não tem globals:true nem setupFiles pra RTL limpar sozinho
// entre "it"s) — um render de um teste anterior que também chega em
// "finalizado" fica montado e colide com o do teste seguinte.
afterEach(cleanup);

describe("GlobalSyncCenter", () => {
  it("abre o modal, lista etapas por unidade e mostra o resumo final", async () => {
    mocks.mutateAsync.mockReset();
    mocks.mutateAsync.mockResolvedValue({ success: true });
    render(<GlobalSyncCenter />);

    fireEvent.click(screen.getByRole("button", { name: "Sincronizar tudo" }));
    expect(await screen.findByRole("heading", { name: "Sincronização em andamento" })).toBeInTheDocument();
    expect(screen.getByText("Ribeirão Shopping")).toBeInTheDocument();
    expect(screen.getByText("Shopping Santa Úrsula")).toBeInTheDocument();
    expect(screen.getAllByText("Conta corrente · Banco Inter")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Iniciar sincronização" }));
    expect(await screen.findByText("Sincronização finalizada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    expect(mocks.mutateAsync).toHaveBeenCalled();
  });

  it("mantém a ação de início acessível no rodapé do modal em telas estreitas", async () => {
    render(<GlobalSyncCenter />);

    fireEvent.click(screen.getByRole("button", { name: "Sincronizar tudo" }));
    const dialog = await screen.findByRole("dialog");
    const startButton = screen.getByRole("button", { name: "Iniciar sincronização" });

    expect(dialog).toHaveClass("flex", "h-[92dvh]", "flex-col");
    expect(dialog).toHaveClass("sm:h-[86vh]");
    expect(startButton.parentElement?.parentElement).toHaveClass("sticky", "bottom-0", "shrink-0");
    expect(startButton).toHaveClass("w-full", "sm:w-auto");
    expect(startButton).not.toBeDisabled();
  });

  it("minimiza e permite restaurar o acompanhamento enquanto uma etapa está em curso", async () => {
    mocks.mutateAsync.mockReset();
    mocks.mutateAsync.mockImplementation(() => new Promise(() => undefined));
    render(<GlobalSyncCenter />);

    fireEvent.click(screen.getByRole("button", { name: "Sincronizar tudo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Iniciar sincronização" }));
    fireEvent.click(await screen.findByRole("button", { name: "Minimizar" }));

    const bar = await screen.findByRole("button", { name: "Restaurar acompanhamento da sincronização" });
    expect(bar).toHaveTextContent("Sincronização em andamento");
    fireEvent.click(bar);
    expect(await screen.findByRole("heading", { name: "Sincronização em andamento" })).toBeInTheDocument();
  });

  it("oferece a repetição seletiva quando uma ou mais etapas terminam com erro", async () => {
    mocks.mutateAsync.mockReset();
    mocks.mutateAsync.mockRejectedValue(new Error("Relatório ainda indisponível"));
    render(<GlobalSyncCenter />);

    fireEvent.click(screen.getByRole("button", { name: "Sincronizar tudo" }));
    fireEvent.click(await screen.findByRole("button", { name: "Iniciar sincronização" }));

    // A retomada automática de erros (1x) faz "finalizada" aparecer
    // brevemente após a 1ª passada, antes da 2ª tentativa rodar e
    // falhar de novo — por isso as 3 asserções vão juntas num único
    // waitFor, esperando o estado final estável em vez do 1º mutation.
    // Timeout maior que o padrão (1000ms): a auto-retry roda 2 passadas
    // sobre as 14 etapas (2 unidades × 7), o que leva mais ciclos de
    // act()/render pra estabilizar do que uma única passada.
    await waitFor(() => {
      expect(screen.getByText("Sincronização finalizada")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sincronizar erros" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Sincronizar novamente" })).toBeInTheDocument();
    }, { timeout: 5000 });
  }, 10000);
});
