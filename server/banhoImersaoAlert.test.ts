import { describe, expect, it } from "vitest";

function deveAlertar(horario: string, agora: string) {
  const atendimento = new Date(`2026-08-27T${horario}:00-03:00`).getTime();
  const momento = new Date(`2026-08-27T${agora}:00-03:00`).getTime();
  const minutos = (atendimento - momento) / 60_000;
  return minutos <= 60 && minutos >= 0;
}

describe("alerta de preparo de banho de imersão", () => {
  it("alerta a partir de uma hora antes e não alerta após o horário", () => {
    expect(deveAlertar("14:00", "13:00")).toBe(true);
    expect(deveAlertar("14:00", "13:30")).toBe(true);
    expect(deveAlertar("14:00", "12:59")).toBe(false);
    expect(deveAlertar("14:00", "14:01")).toBe(false);
  });
});
