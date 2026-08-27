import { describe, expect, it } from "vitest";
import { normalizarSugestaoProximoAtendimento } from "./proximoAtendimentoIa";

describe("sugestão de próximo atendimento", () => {
  it("aceita somente a prévia estruturada com dados explícitos", () => {
    expect(normalizarSugestaoProximoAtendimento(JSON.stringify({
      dataAtendimento: "2026-08-28",
      horario: "14:15",
      servicoNome: "Reflexologia 45",
      confianca: 92,
      justificativa: "Cliente confirmou data, horário e serviço.",
    }))).toEqual({
      dataAtendimento: "2026-08-28",
      horario: "14:15",
      servicoNome: "Reflexologia 45",
      confianca: 92,
      justificativa: "Cliente confirmou data, horário e serviço.",
    });
  });

  it("preserva campos nulos quando a conversa não informa o dado", () => {
    expect(normalizarSugestaoProximoAtendimento(JSON.stringify({
      dataAtendimento: null,
      horario: null,
      servicoNome: "Massagem Relaxante 60",
      confianca: 58,
      justificativa: "O serviço foi citado, sem data ou horário.",
    }))).toMatchObject({ dataAtendimento: null, horario: null, servicoNome: "Massagem Relaxante 60" });
  });

  it("rejeita formatos fora do contrato", () => {
    expect(() => normalizarSugestaoProximoAtendimento('{"dataAtendimento":"amanhã"}')).toThrow("formato inválido");
  });
});
