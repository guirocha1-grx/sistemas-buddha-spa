import { describe, expect, it } from "vitest";
import { globalSyncReducer, initialGlobalSyncState } from "../client/src/lib/globalSyncController";
import { buildGlobalSyncPlan } from "../client/src/lib/globalSyncPlan";

describe("global sync controller", () => {
  it("cobre abertura, falha de etapa, minimizar, restaurar e conclusão", () => {
    const plan = buildGlobalSyncPlan([{ id: 1, nome: "Ribeirão Shopping" }]);
    const started = globalSyncReducer(initialGlobalSyncState, { type: "start", steps: plan });
    const failed = globalSyncReducer(started, { type: "updateStep", id: plan[0].id, patch: { status: "error", error: "Credencial expirada" } });
    const minimized = globalSyncReducer(failed, { type: "minimize" });
    const restored = globalSyncReducer(minimized, { type: "restore" });
    const complete = globalSyncReducer(restored, { type: "complete" });
    expect(started).toMatchObject({ isOpen: true, isRunning: true });
    expect(failed.steps[0]).toMatchObject({ status: "error", error: "Credencial expirada" });
    expect(minimized).toMatchObject({ isMinimized: true });
    expect(restored).toMatchObject({ isMinimized: false });
    expect(complete).toMatchObject({ isOpen: true, isRunning: false });
  });

  it("recoloca somente as etapas com erro na fila para uma nova tentativa", () => {
    const plan = buildGlobalSyncPlan([{ id: 1, nome: "Ribeirão Shopping" }]);
    const started = globalSyncReducer(initialGlobalSyncState, { type: "start", steps: plan });
    const withError = globalSyncReducer(started, { type: "updateStep", id: plan[0].id, patch: { status: "error", error: "Relatório indisponível" } });
    const withSuccess = globalSyncReducer(withError, { type: "updateStep", id: plan[1].id, patch: { status: "success" } });
    const restarted = globalSyncReducer(withSuccess, { type: "restartErrors" });

    expect(restarted).toMatchObject({ isOpen: true, isRunning: true });
    expect(restarted.steps[0]).toMatchObject({ status: "pending", detail: "Aguardando nova tentativa", error: undefined });
    expect(restarted.steps[1]).toMatchObject({ status: "success" });
  });
});
