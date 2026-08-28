import { describe, expect, it } from "vitest";
import { aberturaSemIntencao, destinoEspecialistaValido, envioAutomaticoPermitido, motivoEscalonamentoHumano, rotaDeterministica, rotasDeterministicas, taxaAprovacaoHumana } from "./agentesPolicy";

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
  it("prioriza a explicação antes do preço e preserva o escalonamento humano", () => {
    expect(rotaDeterministica("Quero saber o valor da relaxante")).toBe("estela");
    expect(rotaDeterministica("Quero falar com um atendente humano")).toBe("humano");
    expect(rotaDeterministica("Vocês trabalham com voucher?")).toBe("diana");
  });

  it("classifica situações humanas sem pedir que a IA invente um destino", () => {
    expect(motivoEscalonamentoHumano("Quero falar com um atendente humano")).toBe("solicitação explícita de atendimento humano");
    expect(motivoEscalonamentoHumano("Vou registrar uma reclamação no Procon")).toBe("reclamação ou questão jurídica");
    expect(motivoEscalonamentoHumano("Estou sofrendo assédio")).toBe("situação sensível ou potencialmente insegura");
    expect(rotasDeterministicas("Estou sofrendo assédio")).toEqual(["humano"]);
  });

  it("mantém a fila comercial: explicação, preço e depois agendamento", () => {
    expect(rotasDeterministicas("Quero agendar uma massagem, quanto custa?")).toEqual(["estela", "carol"]);
    expect(rotasDeterministicas("Quero entender como funciona o Day Spa e qual o valor?")).toEqual(["fabricia", "estela"]);
    expect(rotasDeterministicas("Quero entender como funciona o voucher, qual o valor e depois comprar.")).toEqual(["diana", "estela", "diana"]);
    expect(rotasDeterministicas("Quero emitir um voucher, quanto custa?")).toEqual(["estela", "diana"]);
    expect(rotasDeterministicas("Tenho voucher e quero agendar para sábado")).toEqual(["carol"]);
    expect(rotasDeterministicas("Ganhei um voucher de massagem e quero usar")).toEqual(["carol"]);
    expect(rotasDeterministicas("Preciso de nota fiscal e quero saber o valor")).toEqual(["humano"]);
  });

  it("reconhece uma abertura cordial sem encaminhar antes de entender a necessidade", () => {
    expect(aberturaSemIntencao("Bom dia, tudo bem?")).toBe(true);
    expect(aberturaSemIntencao("Olá, gostaria de saber o valor da massagem.")).toBe(false);
    expect(aberturaSemIntencao("Quero agendar para amanhã")).toBe(false);
  });

  it("respeita a autorização de automação para especialistas e preserva bloqueios de segurança", () => {
    expect(envioAutomaticoPermitido("bianca", "in_process", null)).toBe(true);
    expect(envioAutomaticoPermitido("carol", "in_process", null)).toBe(true);
    expect(envioAutomaticoPermitido("aurea", "in_process", null)).toBe(false);
    expect(envioAutomaticoPermitido("bianca", "failure", null)).toBe(false);
    expect(envioAutomaticoPermitido("bianca", "in_process", "enviar_video")).toBe(false);
  });
});
