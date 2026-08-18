import { describe, expect, it } from "vitest";
import { podeAcessarRotaAdministrativa, ROTAS_ADMINISTRATIVAS } from "./adminAccess";

describe("guardas de rotas administrativas", () => {
  it("redireciona usuários comuns nas rotas exatas de Agentes e Configurações", () => {
    expect(ROTAS_ADMINISTRATIVAS).toEqual(["/agentes", "/configuracoes"]);
    expect(podeAcessarRotaAdministrativa("/agentes", "admin")).toBe(true);
    expect(podeAcessarRotaAdministrativa("/configuracoes", "admin")).toBe(true);
    expect(podeAcessarRotaAdministrativa("/agentes", "user")).toBe(false);
    expect(podeAcessarRotaAdministrativa("/configuracoes", "user")).toBe(false);
  });
});
