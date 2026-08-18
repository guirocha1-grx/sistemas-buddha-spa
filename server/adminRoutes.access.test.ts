import { describe, expect, it } from "vitest";
import { podeAcessarRotaAdministrativa } from "../client/src/lib/adminAccess";

describe("guardas de rotas administrativas", () => {
  it("permite Agentes e Configurações somente para administradores", () => {
    expect(podeAcessarRotaAdministrativa("admin")).toBe(true);
    expect(podeAcessarRotaAdministrativa("user")).toBe(false);
    expect(podeAcessarRotaAdministrativa(undefined)).toBe(false);
  });
});
