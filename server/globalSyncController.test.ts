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
});
