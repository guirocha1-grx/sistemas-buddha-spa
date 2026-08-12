import { describe, expect, it } from "vitest";
import { buildGlobalSyncPlan, getSyncProgress, getSyncSummary } from "../client/src/lib/globalSyncPlan";

describe("global sync plan", () => {
  it("organiza as duas unidades e sinaliza integrações não configuradas", () => {
    const plan = buildGlobalSyncPlan([{ id: 2, nome: "Shopping Santa Úrsula" }, { id: 1, nome: "Ribeirão Shopping", interClientId: "id", interClientSecret: "secret", interCertificado: "cert", interChavePrivada: "key", mpAccessToken: "token" }]);
    expect(plan).toHaveLength(16);
    expect(plan[0]).toMatchObject({ unidadeNome: "Ribeirão Shopping", kind: "mercadoPagoConta", category: "Contas Bancárias", status: "pending" });
    expect(plan.find((item) => item.id === "2-mercadoPagoConta")).toMatchObject({ status: "skipped" });
  });

  it("calcula progresso e resumo pelos estados finais", () => {
    const plan = buildGlobalSyncPlan([{ id: 1, nome: "Ribeirão Shopping" }]);
    plan[0] = { ...plan[0], status: "success" };
    plan[1] = { ...plan[1], status: "error" };
    expect(getSyncProgress(plan)).toBe(50);
    expect(getSyncSummary(plan)).toEqual({ success: 1, error: 1, skipped: 2, background: 0 });
  });
});
