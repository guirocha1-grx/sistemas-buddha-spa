import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ user: { role: "user" as "user" | "admin" }, loading: false }));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => authState }));
vi.mock("wouter", () => ({ Redirect: ({ to }: { to: string }) => <span data-redirect={to}>redirecionado</span> }));

import { AdminOnly } from "../client/src/components/AdminOnly";

describe("AdminOnly", () => {
  beforeEach(() => {
    authState.user.role = "user";
    authState.loading = false;
  });

  it.each(["/agentes", "/configuracoes"])("redireciona usuário comum em %s", (rota) => {
    const html = renderToStaticMarkup(<AdminOnly rota={rota}><span>conteúdo sensível</span></AdminOnly>);
    expect(html).toContain('data-redirect="/"');
    expect(html).not.toContain("conteúdo sensível");
  });
});
