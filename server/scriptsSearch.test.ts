import { describe, expect, it } from "vitest";
import { descricaoExibicaoScript, filtrarScriptsPorBusca, scriptCorrespondeBusca } from "../client/src/lib/scriptsSearch";

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

  it("filtra a lista localmente sem incluir itens apenas pela categoria", () => {
    const scripts = [
      { titulo: "Campanha mensal", descricao: "Comunicar promoção vigente.", script: "Oferta válida este mês.", categoriaScript: "Preços" },
      { titulo: "Yin-Yang", descricao: "Apresentar a terapia.", script: "Massagem relaxante e Shiatsu.", categoriaScript: "Terapias (descrição)" },
    ];

    expect(filtrarScriptsPorBusca(scripts, "promo")).toEqual([scripts[0]]);
  });

  it("prioriza o título como descrição visual e mantém a categoria separada", () => {
    expect(descricaoExibicaoScript({ titulo: "Encerramento por falta de interação", descricao: "Mensagem de despedida" }))
      .toBe("Encerramento por falta de interação");
  });
});
