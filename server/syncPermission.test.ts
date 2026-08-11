import { describe, expect, it } from "vitest";
import { MODULOS, MODULOS_CHAVES } from "../shared/modulos";
import { router, syncProcedure } from "./_core/trpc";
import type { TrpcContext } from "./_core/context";

const permissionProbe = router({
  execute: syncProcedure.query(() => ({ allowed: true })),
});

function contextWith(modulos: string[]): TrpcContext {
  return {
    user: {
      id: 99,
      openId: "sync-test-user",
      name: "Sync Test",
      email: "sync@test.local",
      loginMethod: "test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    permissoesModulos: new Set(modulos),
    permissoesSubsecoes: new Set(),
  } as TrpcContext;
}

describe("permissão de sincronização global", () => {
  it("é disponibilizada no catálogo único consumido pela tela de Usuários", () => {
    expect(MODULOS.find((modulo) => modulo.chave === "sincronizacao")).toEqual({
      chave: "sincronizacao",
      label: "Sincronização Global",
    });
    expect(MODULOS_CHAVES).toContain("sincronizacao");
  });

  it("bloqueia a execução para conta restrita sem a permissão e libera a conta autorizada", async () => {
    const denied = permissionProbe.createCaller(contextWith(["financeiro"]));
    await expect(denied.execute()).rejects.toMatchObject({ code: "FORBIDDEN" });

    const allowed = permissionProbe.createCaller(contextWith(["sincronizacao"]));
    await expect(allowed.execute()).resolves.toEqual({ allowed: true });
  });
});
