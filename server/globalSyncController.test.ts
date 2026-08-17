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
    const interIndex = plan.findIndex((step) => step.kind === "inter");
    const caixaIndex = plan.findIndex((step) => step.kind === "caixa");
    const started = globalSyncReducer(initialGlobalSyncState, { type: "start", steps: plan });
    const withError = globalSyncReducer(started, { type: "updateStep", id: plan[interIndex].id, patch: { status: "error", error: "Relatório indisponível" } });
    const withSuccess = globalSyncReducer(withError, { type: "updateStep", id: plan[caixaIndex].id, patch: { status: "success" } });
    const restarted = globalSyncReducer(withSuccess, { type: "restartErrors" });

    expect(restarted).toMatchObject({ isOpen: true, isRunning: true });
    expect(restarted.steps[interIndex]).toMatchObject({ status: "pending", detail: "Aguardando nova tentativa", error: undefined });
    expect(restarted.steps[caixaIndex]).toMatchObject({ status: "success" });
  });

  it("não recoloca a Conta Corrente Mercado Pago na fila — ela roda em segundo plano e nunca entraria na retomada, ficando presa em pending pra sempre", () => {
    const plan = buildGlobalSyncPlan([{ id: 1, nome: "Ribeirão Shopping", mpAccessToken: "token" }]);
    const mpIndex = plan.findIndex((step) => step.kind === "mercadoPagoConta");
    const started = globalSyncReducer(initialGlobalSyncState, { type: "start", steps: plan });
    const withError = globalSyncReducer(started, { type: "updateStep", id: plan[mpIndex].id, patch: { status: "error", error: "Falha na Conta Corrente Mercado Pago" } });
    const restarted = globalSyncReducer(withError, { type: "restartErrors" });

    expect(restarted.steps[mpIndex]).toMatchObject({ status: "error", error: "Falha na Conta Corrente Mercado Pago" });
  });
});
