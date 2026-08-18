import { describe, expect, it } from "vitest";
import { listarHeartbeatsSincronizacaoDiaria } from "./dailySyncReport";

describe("agendamento diário de sincronização", () => {
  it("divide as etapas por callbacks independentes e agenda o relatório depois delas", () => {
    const jobs = listarHeartbeatsSincronizacaoDiaria();
    const nomes = jobs.map((job) => job.name);
    const caminhos = jobs.map((job) => job.path);

    expect(jobs).toHaveLength(15);
    expect(new Set(nomes).size).toBe(jobs.length);
    expect(new Set(caminhos).size).toBe(jobs.length);
    expect(jobs.at(-1)).toMatchObject({
      name: "cron-relatorio-sincronizacao-diaria",
      cron: "0 20 10 * * *",
      path: "/api/scheduled/relatorio-sincronizacao-diaria",
    });
    expect(jobs.slice(0, -1).every((job) => job.path.startsWith("/api/scheduled/sincronizar-tudo-diario-"))).toBe(true);
  });
});
