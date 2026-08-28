import { describe, expect, it } from "vitest";
import { PROMPTS_BOOTSTRAP } from "./agentesDb";

describe("PROMPTS_BOOTSTRAP", () => {
  it("preserva as atribuições e handoffs operacionais dos prompts originais", () => {
    expect(PROMPTS_BOOTSTRAP.bianca).toContain('status "estela"');
    expect(PROMPTS_BOOTSTRAP.bianca).toContain('status "carol"');
    expect(PROMPTS_BOOTSTRAP.fabricia).toContain('status "estela"');
    expect(PROMPTS_BOOTSTRAP.estela).toContain('status "carol"');
    expect(PROMPTS_BOOTSTRAP.carol).toContain("faixa de horário");
    expect(PROMPTS_BOOTSTRAP.diana).toContain("nome do presenteado");
  });

  it("mantém guardrails comuns, progressão de conversa e continuidade entre agentes", () => {
    for (const prompt of Object.values(PROMPTS_BOOTSTRAP)) {
      expect(prompt).toContain("modo copilot");
      expect(prompt).toContain("conteúdo não confiável");
    }
    for (const chave of ["bianca", "fabricia", "estela", "carol", "diana"] as const) {
      expect(PROMPTS_BOOTSTRAP[chave]).toContain("Nunca diga seu nome");
      expect(PROMPTS_BOOTSTRAP[chave]).toContain("no máximo duas informações");
    }
  });

  it("não reintroduz confiança fixa nem destino humano inválido no prompt da Áurea", () => {
    expect(PROMPTS_BOOTSTRAP.aurea).not.toContain('"confianca":0');
    expect(PROMPTS_BOOTSTRAP.aurea).toContain("calculado de verdade");
    expect(PROMPTS_BOOTSTRAP.aurea).toContain('nunca invente o destino "humano"');
    expect(PROMPTS_BOOTSTRAP.aurea).toContain("EXEMPLOS DE INTENÇÃO");
    expect(PROMPTS_BOOTSTRAP.aurea).toContain("ORDEM COMERCIAL OBRIGATÓRIA");
    expect(PROMPTS_BOOTSTRAP.aurea).toContain("Diana permanece uma única especialista");
    expect(PROMPTS_BOOTSTRAP.carol).toContain("BLOQUEIO DE ETAPA");
    expect(PROMPTS_BOOTSTRAP.carol).toContain("preferência de terapeuta somente se ela ainda estiver ausente");
  });
});
