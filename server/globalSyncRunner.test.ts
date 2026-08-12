import { describe, expect, it } from "vitest";
import { buildGlobalSyncPlan, getSyncProgress } from "../client/src/lib/globalSyncPlan";
import { runGlobalSyncQueue } from "../client/src/lib/globalSyncRunner";

describe("global sync runner", () => {
  it("conclui as demais etapas sem aguardar o relatório Mercado Pago pendente", async () => {
    const plan = buildGlobalSyncPlan([{ id: 1, nome: "Ribeirão Shopping", mpAccessToken: "token" }]).slice(0, 4);
    expect(plan[0]?.label).toBe("Conta Corrente Mercado Pago");
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
    await execution;
    expect(started).toEqual(["mercadoPagoConta", "inter", "sicredi", "caixa"]);
    finishMercadoPago?.();
  });

  it("considera processamento externo como concluído para liberar o painel global", () => {
    const [mercadoPago] = buildGlobalSyncPlan([{ id: 1, nome: "Ribeirão Shopping", mpAccessToken: "token" }]);
    expect(getSyncProgress([{ ...mercadoPago!, status: "background" }])).toBe(100);
  });
});
