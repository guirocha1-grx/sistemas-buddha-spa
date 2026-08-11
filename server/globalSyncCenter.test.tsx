// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/trpc", () => ({
  trpc: {
    inter: { sincronizar: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) }, extratos: { invalidate: mocks.invalidate } },
    sicredi: { sincronizar: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) } },
    contas: { sincronizarCaixaFisico: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) }, sincronizarMercadoPago: { useMutation: () => ({ mutateAsync: mocks.mutateAsync }) } },
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
});
