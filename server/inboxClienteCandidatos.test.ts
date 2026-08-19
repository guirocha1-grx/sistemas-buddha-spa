import { describe, expect, it } from "vitest";
import { filtrarCandidatosPorUnidade } from "./db";

describe("filtrarCandidatosPorUnidade", () => {
  const cadastros = [
    { id: 1289, nome: "Guilherme Busch Rocha", clienteSsu: true, clienteRbs: false },
    { id: 30165, nome: "Guilherme Busch Rocha", clienteSsu: false, clienteRbs: true },
    { id: 50001, nome: "Cliente nas duas unidades", clienteSsu: true, clienteRbs: true },
  ];

  it("não oferece o cadastro SSU em uma conversa do Ribeirão Shopping", () => {
    expect(filtrarCandidatosPorUnidade(cadastros, 2).map((cliente) => cliente.id)).toEqual([30165, 50001]);
  });

  it("não oferece o cadastro RBS em uma conversa do Shopping Santa Úrsula", () => {
    expect(filtrarCandidatosPorUnidade(cadastros, 1).map((cliente) => cliente.id)).toEqual([1289, 50001]);
  });
});
