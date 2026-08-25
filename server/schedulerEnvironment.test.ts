import { describe, expect, it } from "vitest";
import { deveRegistrarTarefasAgendadas } from "./_core/scheduler";

describe("deveRegistrarTarefasAgendadas", () => {
  it("habilita tarefas agendadas no processo de produção do Railway", () => {
    expect(deveRegistrarTarefasAgendadas({ NODE_ENV: "production" })).toBe(true);
  });

  it("impede que o ambiente de desenvolvimento processe Fluxos do banco compartilhado", () => {
    expect(deveRegistrarTarefasAgendadas({ NODE_ENV: "development" })).toBe(false);
  });

  it("mantém tarefas desativadas quando NODE_ENV não está definido", () => {
    expect(deveRegistrarTarefasAgendadas({})).toBe(false);
  });
});
