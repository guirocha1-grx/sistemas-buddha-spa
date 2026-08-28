import { describe, expect, it } from "vitest";
import { nomeSugeridoParaCadastro } from "../client/src/lib/inboxNomeSugerido";

describe("nome sugerido no cadastro rápido do Inbox", () => {
  it("prioriza o nome exibido pelo WhatsApp como sugestão editável", () => {
    expect(nomeSugeridoParaCadastro({
      clienteNome: null,
      nomeContato: "Robinson Gomes",
      telefone: "5516999999999",
    })).toBe("Robinson Gomes");
  });

  it("não converte telefone em nome de cliente", () => {
    expect(nomeSugeridoParaCadastro({
      nomeContato: "5516999999999",
      telefone: "5516999999999",
    })).toBe("");
  });
});
