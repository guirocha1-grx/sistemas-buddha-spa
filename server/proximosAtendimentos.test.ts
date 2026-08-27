import { describe, expect, it } from "vitest";
import { deduplicarProximosAtendimentos } from "./proximosAtendimentos";

describe("próximos atendimentos", () => {
  it("mantém o atendimento oficial quando existe um espelho local de IA equivalente", () => {
    const registros = [
      { id: 1, clienteNome: "Maria Angelica Parro", dataAtendimento: "2026-08-27", horario: "11:30", servicoNome: "Relaxante 60", status: "Agendado (IA)" },
      { id: 2, clienteNome: "Maria Angelica Parro", dataAtendimento: "2026-08-27", horario: "11:30", servicoNome: "Relaxante 60", status: "Marcado" },
    ];
    expect(deduplicarProximosAtendimentos(registros)).toEqual([registros[1]]);
  });
});
