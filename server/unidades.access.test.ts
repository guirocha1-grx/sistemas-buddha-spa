import { describe, expect, it } from "vitest";
import { unidadeSemCredenciais } from "./db";

describe("unidades: dados públicos", () => {
  it("remove tokens e certificados antes de expor dados da unidade a um usuário comum", () => {
    const unidade = unidadeSemCredenciais({
      id: 1,
      nome: "Ribeirão Shopping",
      belleToken: "belle-secreto",
      zapiToken: "zapi-secreto",
      zapiClientToken: "zapi-client-secreto",
      interChavePrivada: "chave-privada",
      mpAccessToken: "mp-secreto",
      sicrediClientSecret: "sicredi-secreto",
    });

    expect(unidade).toMatchObject({ id: 1, nome: "Ribeirão Shopping" });
    expect(unidade).not.toHaveProperty("belleToken");
    expect(unidade).not.toHaveProperty("zapiToken");
    expect(unidade).not.toHaveProperty("zapiClientToken");
    expect(unidade).not.toHaveProperty("interChavePrivada");
    expect(unidade).not.toHaveProperty("mpAccessToken");
    expect(unidade).not.toHaveProperty("sicrediClientSecret");
  });
});
