import { describe, expect, it } from "vitest";
import { verificarViolacoes } from "./agentesRegressao";

describe("verificarViolacoes", () => {
  it("não acusa violação quando a mensagem não contém frase proibida", () => {
    expect(verificarViolacoes({ regrasProibidas: ["qual será a terapia"], mensagemDeveSerVazia: false }, "Anotei Drenagem 60. Tem preferência de terapeuta?")).toEqual([]);
  });

  it("acusa violação por substring, ignorando maiúsculas e acento", () => {
    const violacoes = verificarViolacoes({ regrasProibidas: ["qual será a terapia"], mensagemDeveSerVazia: false }, "Oi! QUAL SERA A TERAPIA que você deseja?");
    expect(violacoes).toHaveLength(1);
  });

  it("acusa violação de quantidade de pessoas mesmo com pontuação ao redor", () => {
    const violacoes = verificarViolacoes({ regrasProibidas: ["quantas pessoas"], mensagemDeveSerVazia: false }, "Tem preferência de terapeuta? Será para quantas pessoas?");
    expect(violacoes).toHaveLength(1);
  });

  it("exige mensagem vazia quando mensagemDeveSerVazia é true", () => {
    const violacoes = verificarViolacoes({ regrasProibidas: [], mensagemDeveSerVazia: true }, "Por favor, aguarde um momento ✨");
    expect(violacoes).toHaveLength(1);
  });

  it("não acusa nada quando mensagemDeveSerVazia é true e a mensagem está vazia", () => {
    expect(verificarViolacoes({ regrasProibidas: [], mensagemDeveSerVazia: true }, "")).toEqual([]);
  });

  it("acumula violações de mais de uma regra", () => {
    const violacoes = verificarViolacoes(
      { regrasProibidas: ["qual será a terapia", "quantas pessoas"], mensagemDeveSerVazia: false },
      "Qual será a terapia e para quantas pessoas será o atendimento?",
    );
    expect(violacoes).toHaveLength(2);
  });
});
