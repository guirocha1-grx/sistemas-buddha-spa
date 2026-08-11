import { describe, expect, it } from "vitest";
import { buildGlobalSyncPlan } from "../client/src/lib/globalSyncPlan";
import { runGlobalSyncQueue } from "../client/src/lib/globalSyncRunner";

describe("global sync runner", () => {
  it("continua disparando as demais etapas enquanto o relatório Mercado Pago permanece pendente", async () => {
    const plan = buildGlobalSyncPlan([{ id: 1, nome: "Ribeirão Shopping", mpAccessToken: "token" }]).slice(0, 4);
    const started: string[] = [];
    let finishMercadoPago: (() => void) | undefined;
    let finishInter: (() => void) | undefined;
    let finishSicredi: (() => void) | undefined;

    const execution = runGlobalSyncQueue(
      plan,
      async (step) => {
        started.push(step.kind);
        if (step.kind === "mercadoPagoConta") await new Promise<void>((resolve) => { finishMercadoPago = resolve; });
        if (step.kind === "inter") await new Promise<void>((resolve) => { finishInter = resolve; });
        if (step.kind === "sicredi") await new Promise<void>((resolve) => { finishSicredi = resolve; });
      },
    );

    const flushQueue = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };

    await flushQueue();
    expect(started).toEqual(["mercadoPagoConta", "inter"]);
    finishInter?.();
    await flushQueue();
    expect(started).toEqual(["mercadoPagoConta", "inter", "sicredi"]);
    finishSicredi?.();
    await flushQueue();
    expect(started).toEqual(["mercadoPagoConta", "inter", "sicredi", "caixa"]);
    finishMercadoPago?.();
    await execution;
  });
});
