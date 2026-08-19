import { describe, expect, it } from "vitest";
import { scriptCorrespondeBusca } from "../client/src/lib/scriptsSearch";

describe("scriptCorrespondeBusca", () => {
  it("retorna somente itens cujo título, descrição ou conteúdo corresponde ao termo", () => {
    const promocao = {
      titulo: "Inserir campanha do mês",
      descricao: "Usar quando houver promoção ou condição mensal.",
      script: "Confira a oferta vigente para este mês.",
    };
    const daySpa = {
      titulo: "Day Spa Prime",
      descricao: "Pacote de tratamentos e alimentação.",
      script: "Experiência de quatro horas e meia no spa.",
    };
    const categoriaComNomePromocional = {
      titulo: "Mensagem de boas-vindas",
      descricao: "Saudação inicial para novos contatos.",
      script: "Olá, seja bem-vindo ao Buddha Spa.",
    };

    expect(scriptCorrespondeBusca(promocao, "promo")).toBe(true);
    expect(scriptCorrespondeBusca(daySpa, "promo")).toBe(false);
    expect(scriptCorrespondeBusca(categoriaComNomePromocional, "promo")).toBe(false);
  });

  it("faz a correspondência ignorando acentos", () => {
    expect(scriptCorrespondeBusca({ titulo: "Promoção de setembro" }, "promocao")).toBe(true);
  });
});
