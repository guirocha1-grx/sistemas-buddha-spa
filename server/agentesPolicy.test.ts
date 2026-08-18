import { describe, expect, it } from "vitest";
import { destinoEspecialistaValido, envioAutomaticoPermitido, rotaDeterministica, taxaAprovacaoHumana } from "./agentesPolicy";

describe("políticas dos agentes", () => {
  it("aceita apenas destinos presentes entre os especialistas ativos", () => {
    expect(destinoEspecialistaValido("agendamento", ["agendamento", "voucher"])).toBe("agendamento");
    expect(destinoEspecialistaValido("financeiro", ["agendamento", "voucher"])).toBeNull();
    expect(destinoEspecialistaValido(undefined, ["agendamento"])).toBeNull();
  });

  it("calcula a taxa com base somente nas decisões humanas", () => {
    expect(taxaAprovacaoHumana(8, 2)).toBe(80);
    expect(taxaAprovacaoHumana(1, 2)).toBe(33);
    expect(taxaAprovacaoHumana(0, 0)).toBeNull();
  });
});

describe("regras híbridas de atendimento", () => {
  it("prioriza os gatilhos determinísticos de preço e escalonamento humano", () => {
    expect(rotaDeterministica("Quero saber o valor da relaxante")).toBe("estela");
    expect(rotaDeterministica("Quero falar com um atendente humano")).toBe("humano");
  });

  it("respeita a autorização de automação para especialistas e preserva bloqueios de segurança", () => {
    expect(envioAutomaticoPermitido("bianca", "in_process", null)).toBe(true);
    expect(envioAutomaticoPermitido("carol", "in_process", null)).toBe(true);
    expect(envioAutomaticoPermitido("aurea", "in_process", null)).toBe(false);
    expect(envioAutomaticoPermitido("bianca", "failure", null)).toBe(false);
    expect(envioAutomaticoPermitido("bianca", "in_process", "enviar_video")).toBe(false);
  });
});
