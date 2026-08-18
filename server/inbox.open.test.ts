import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function createFakeDb(selectResults: unknown[][]) {
  let selectIndex = 0;
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const fakeDb = {
    select: vi.fn(() => {
      const rows = selectResults[selectIndex++] ?? [];
      const chain: any = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn().mockResolvedValue(rows),
      };
      return chain;
    }),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: updateWhere })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ $returningId: vi.fn().mockResolvedValue([{ id: 202 }]) })),
    })),
    updateWhere,
  };
  return fakeDb;
}

afterEach(() => vi.restoreAllMocks());

describe("db.abrirInboxPorCliente", () => {
  it("localiza uma conversa existente e atualiza o vínculo do cliente", async () => {
    const fakeDb = createFakeDb([
      [{ id: 10, nome: "Cliente Existente", celular: "(16) 97400-7994", celular2: null, telefone: null }],
      [{ id: 101 }],
    ]);
    await expect(db.abrirInboxPorCliente({ clienteId: 10, unidadeId: 1 }, fakeDb)).resolves.toBe(101);
    expect(fakeDb.update).toHaveBeenCalledTimes(1);
    expect(fakeDb.insert).not.toHaveBeenCalled();
  });

  it("cria uma conversa quando o cliente ainda não possui histórico", async () => {
    const fakeDb = createFakeDb([
      [{ id: 11, nome: "Cliente Novo", celular: "5516999999999", celular2: null, telefone: null }],
      [],
    ]);

    await expect(db.abrirInboxPorCliente({ clienteId: 11, unidadeId: 2 }, fakeDb)).resolves.toBe(202);
    expect(fakeDb.insert).toHaveBeenCalledTimes(1);
  });
});

describe("inbox.conversas.abrirPorCliente", () => {
  it("retorna a conversa localizada para o cliente", async () => {
    const abrirPorCliente = vi.spyOn(db, "abrirInboxPorCliente").mockResolvedValue(41);
    const caller = appRouter.createCaller(createAuthContext());

    await expect(caller.inbox.conversas.abrirPorCliente({ clienteId: 10, unidadeId: 1 }))
      .resolves.toEqual({ conversaId: 41 });
    expect(abrirPorCliente).toHaveBeenCalledWith({ clienteId: 10, unidadeId: 1 });
  });

  it("retorna a nova conversa criada quando não havia histórico", async () => {
    const abrirPorCliente = vi.spyOn(db, "abrirInboxPorCliente").mockResolvedValue(42);
    const caller = appRouter.createCaller(createAuthContext());

    await expect(caller.inbox.conversas.abrirPorCliente({ clienteId: 11, unidadeId: 2 }))
      .resolves.toEqual({ conversaId: 42 });
    expect(abrirPorCliente).toHaveBeenCalledWith({ clienteId: 11, unidadeId: 2 });
  });
});
