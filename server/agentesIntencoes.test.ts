import { describe, expect, it } from "vitest";
import {
  detectarForaDoEscopo,
  detectarPesquisaSatisfacaoBelle,
  intencaoDaRotaDeterministica,
  rotuloIntencaoAtendimento,
} from "./agentesIntencoes";

describe("taxonomia de intenções dos agentes", () => {
  it("reconhece resposta da experiência Belle pelo convite anterior, mesmo quando a nota é curta", () => {
    expect(detectarPesquisaSatisfacaoBelle([
      { direcao: "enviada", conteudo: "*Como foi sua Experiência Buddha Spa?*\nClique na opção abaixo para avaliar sua experiência." },
      { direcao: "recebida", conteudo: "10 - Excelente" },
    ])).toEqual({ intencao: "pesquisa_satisfacao_belle", detalhe: "avaliação da experiência geral" });
  });

  it("reconhece a segunda etapa de avaliação do profissional", () => {
    expect(detectarPesquisaSatisfacaoBelle([
      { direcao: "enviada", conteudo: "*Como foi o atendimento do nosso profissional?*" },
      { direcao: "recebida", conteudo: "10 - Excelente" },
    ])).toEqual({ intencao: "pesquisa_satisfacao_belle", detalhe: "avaliação do profissional" });
  });

  it("registra oferta de marketing externo como fora do escopo", () => {
    expect(detectarForaDoEscopo("Você investe em divulgação pelo WhatsApp? Somos uma agência de marketing digital e geramos leads.")).toBe("oferta de serviço B2B ou marketing");
  });

  it("mantém a intenção auditável alinhada à rota determinística", () => {
    expect(intencaoDaRotaDeterministica("carol", "Tem horário hoje? ")).toBe("agendamento");
    expect(rotuloIntencaoAtendimento("pesquisa_satisfacao_belle")).toBe("Pesquisa de satisfação Belle");
  });
});
