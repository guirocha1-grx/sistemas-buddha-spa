import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ user: { role: "user" as "user" | "admin" }, loading: false }));
const vazio = () => null;

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: vazio }));
vi.mock("@/components/ui/tooltip", () => ({ TooltipProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../client/src/components/ErrorBoundary", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../client/src/contexts/ThemeContext", () => ({ ThemeProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../client/src/components/DashboardLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("../client/src/pages/NotFound", () => ({ default: vazio }));
vi.mock("../client/src/pages/Dashboard", () => ({ default: vazio }));
vi.mock("../client/src/pages/Clientes", () => ({ default: vazio }));
vi.mock("../client/src/pages/Reativacao", () => ({ default: vazio }));
vi.mock("../client/src/pages/Agenda", () => ({ default: vazio }));
vi.mock("../client/src/pages/Mensagens", () => ({ default: vazio }));
vi.mock("../client/src/pages/Scripts", () => ({ default: vazio }));
vi.mock("../client/src/pages/Fluxos", () => ({ default: vazio }));
vi.mock("../client/src/pages/FluxoDetalhe", () => ({ default: vazio }));
vi.mock("../client/src/pages/Templates", () => ({ default: vazio }));
vi.mock("../client/src/pages/Disparos", () => ({ default: vazio }));
vi.mock("../client/src/pages/Financeiro", () => ({ default: vazio }));
vi.mock("../client/src/pages/Extratos", () => ({ default: vazio }));
vi.mock("../client/src/pages/ComandaRecepcao", () => ({ default: vazio }));
vi.mock("../client/src/pages/Adquirentes", () => ({ default: vazio }));
vi.mock("../client/src/pages/TransacoesEntreUnidades", () => ({ default: vazio }));
vi.mock("../client/src/pages/Parametros", () => ({ default: vazio }));
vi.mock("../client/src/pages/Copilot", () => ({ default: vazio }));
vi.mock("../client/src/pages/Agentes", () => ({ default: () => <span>fila de agentes</span> }));
vi.mock("../client/src/pages/Tabela", () => ({ default: vazio }));
vi.mock("../client/src/pages/Laminas", () => ({ default: vazio }));
vi.mock("../client/src/pages/Leads", () => ({ default: vazio }));
vi.mock("../client/src/pages/Configuracoes", () => ({ default: () => <span>configurações sensíveis</span> }));
vi.mock("../client/src/pages/ConfigInbox", () => ({ default: vazio }));
vi.mock("../client/src/pages/AuditLog", () => ({ default: vazio }));
vi.mock("../client/src/pages/Usuarios", () => ({ default: vazio }));
vi.mock("../client/src/pages/TratamentoErros", () => ({ default: vazio }));
vi.mock("../client/src/pages/PoliticaPrivacidade", () => ({ default: vazio }));
vi.mock("wouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("wouter")>();
  return { ...actual, Redirect: ({ to }: { to: string }) => <span data-redirect={to}>redirecionado</span> };
});

describe("navegação administrativa do App", () => {
  it.each(["/agentes", "/configuracoes"])("redireciona usuário comum que acessa %s", async (path) => {
    const { default: App } = await import("../client/src/App");
    const hook = () => [path, () => undefined] as [string, () => void];
    const html = renderToStaticMarkup(<Router hook={hook}><App /></Router>);

    expect(html).toContain('data-redirect="/"');
    expect(html).not.toContain("fila de agentes");
    expect(html).not.toContain("configurações sensíveis");
  });
});
