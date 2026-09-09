import { describe, expect, it } from "vitest";
import { mesAnterior, mesSeguinte } from "./dreCategorizacao";

describe("mesAnterior", () => {
  it("volta um mês dentro do mesmo ano", () => {
    expect(mesAnterior("2026-09")).toBe("2026-08");
  });

  it("vira o ano corretamente (janeiro -> dezembro do ano anterior)", () => {
    expect(mesAnterior("2026-01")).toBe("2025-12");
  });
});

describe("mesSeguinte", () => {
  it("avança um mês dentro do mesmo ano", () => {
    expect(mesSeguinte("2026-08")).toBe("2026-09");
  });

  it("vira o ano corretamente (dezembro -> janeiro do ano seguinte)", () => {
    expect(mesSeguinte("2025-12")).toBe("2026-01");
  });
});
