import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return { ...original, getUnidadesParaUsuario: vi.fn() };
});

import { appRouter } from "./routers";
import { unidadeSemCredenciais } from "./db";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";

function createUserContext(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "consultor-teste",
      email: "consultor@example.com",
      name: "Consultor teste",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("unidades: dados públicos", () => {
  beforeEach(() => vi.mocked(db.getUnidadesParaUsuario).mockReset());

  it("remove tokens e certificados antes de expor dados da unidade a um usuário comum", () => {
    const unidade = unidadeSemCredenciais({
      id: 1,
      nome: "Ribeirão Shopping",
      belleToken: "belle-secreto",
      zapiToken: "zapi-secreto",
      zapiClientToken: "zapi-client-secreto",
      interChavePrivada: "chave-privada",
      mpAccessToken: "mp-secreto",
      sicrediClientSecret: "sicredi-secreto",
    });

    expect(unidade).toMatchObject({ id: 1, nome: "Ribeirão Shopping" });
    expect(unidade).not.toHaveProperty("belleToken");
    expect(unidade).not.toHaveProperty("zapiToken");
    expect(unidade).not.toHaveProperty("zapiClientToken");
    expect(unidade).not.toHaveProperty("interChavePrivada");
    expect(unidade).not.toHaveProperty("mpAccessToken");
    expect(unidade).not.toHaveProperty("sicrediClientSecret");
  });

  it("remove credenciais da resposta real de unidades.list e bloqueia unidades.get", async () => {
    vi.mocked(db.getUnidadesParaUsuario).mockResolvedValue([{
      id: 1,
      nome: "Ribeirão Shopping",
      belleToken: "belle-secreto",
      zapiToken: "zapi-secreto",
      zapiClientToken: "zapi-client-secreto",
    }] as never);
    const caller = appRouter.createCaller(createUserContext());

    await expect(caller.unidades.list()).resolves.toEqual([{ id: 1, nome: "Ribeirão Shopping" }]);
    await expect(caller.unidades.get({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
