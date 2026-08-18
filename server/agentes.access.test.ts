import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
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

describe("agentes: acesso administrativo", () => {
  it("bloqueia um consultor da fila de sugestões", async () => {
    const caller = appRouter.createCaller(createUserContext());

    await expect(caller.agentes.fila.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("bloqueia um consultor da configuração de prompts", async () => {
    const caller = appRouter.createCaller(createUserContext());

    await expect(caller.agentes.configuracao.list({ unidadeId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("bloqueia um consultor da ativação coletiva dos agentes", async () => {
    const caller = appRouter.createCaller(createUserContext());

    await expect(caller.agentes.configuracao.atualizarTodos({ unidadeId: 1, ativo: true })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("bloqueia um consultor do diagnóstico operacional por conversa", async () => {
    const caller = appRouter.createCaller(createUserContext());

    await expect(caller.agentes.diagnostico.conversa({ conversaId: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
