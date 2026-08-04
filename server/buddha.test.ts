import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type CookieCall = {
  name: string;
  options: Record<string, unknown>;
};

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext; clearedCookies: CookieCall[] } {
  const clearedCookies: CookieCall[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-admin",
    email: "admin@buddhaspa.com",
    name: "Admin Buddha",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
  });
});

describe("unidades.list", () => {
  it("returns unidades from database", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // This will query the real database which has 2 unidades seeded
    const result = await caller.unidades.list();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toHaveProperty("nome");
    expect(result[0]).toHaveProperty("codEstab");
  });
});

describe("unidades.get", () => {
  it("returns a specific unidade by id", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.unidades.get({ id: 1 });

    expect(result).toBeDefined();
    expect(result?.nome).toContain("Santa Úrsula");
  });
});

describe("leads.create", () => {
  it("creates a lead locally when Belle token is not configured", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.leads.create({
      unidadeId: 1,
      nome: "Lead Teste Vitest",
      celular: "11999999999",
      email: "teste@vitest.com",
    });

    expect(result).toHaveProperty("success");
  });
});

describe("laminas.create", () => {
  it("creates a lamina record", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.laminas.create({
      unidadeId: 1,
      titulo: "Lâmina Teste Vitest",
      template: "promocional",
    });

    expect(result).toEqual({ success: true });
  });
});

describe("laminas.list", () => {
  it("returns laminas for a unidade", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.laminas.list({ unidadeId: 1 });

    expect(Array.isArray(result)).toBe(true);
  });
});

describe("financeiro.metas.list", () => {
  it("returns metas for a unidade", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.financeiro.metas.list({ unidadeId: 1 });

    expect(Array.isArray(result)).toBe(true);
  });
});

describe("syncLogs.list", () => {
  it("returns sync logs for a unidade", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.syncLogs.list({ unidadeId: 1 });

    expect(Array.isArray(result)).toBe(true);
  });
});
