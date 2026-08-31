import { describe, expect, it } from "vitest";
import { deveAlertarReprovacao } from "./agentesQualidadeAlerta";

describe("deveAlertarReprovacao", () => {
  it("não alerta com amostra pequena mesmo com taxa alta", () => {
    expect(deveAlertarReprovacao({ avaliadas: 2, reprovadas: 2, taxa: 1 }, undefined)).toBe(false);
  });

  it("alerta quando a taxa absoluta já é alta, mesmo sem baseline", () => {
    expect(deveAlertarReprovacao({ avaliadas: 10, reprovadas: 3, taxa: 0.3 }, undefined)).toBe(true);
  });

  it("não alerta quando a taxa está baixa e estável", () => {
    expect(deveAlertarReprovacao(
      { avaliadas: 20, reprovadas: 1, taxa: 0.05 },
      { avaliadas: 50, reprovadas: 2, taxa: 0.04 },
    )).toBe(false);
  });

  it("alerta quando a taxa subiu bastante em relação à semana anterior, mesmo sem estourar o absoluto", () => {
    expect(deveAlertarReprovacao(
      { avaliadas: 10, reprovadas: 2, taxa: 0.2 },
      { avaliadas: 50, reprovadas: 2, taxa: 0.04 },
    )).toBe(true);
  });

  it("ignora baseline com amostra pequena (trata como zero)", () => {
    expect(deveAlertarReprovacao(
      { avaliadas: 10, reprovadas: 1, taxa: 0.1 },
      { avaliadas: 2, reprovadas: 2, taxa: 1 },
    )).toBe(false);
  });
});
