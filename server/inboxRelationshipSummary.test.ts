import { describe, expect, it } from "vitest";
import { classificarPlanosRelacionamento } from "./db";

describe("classificarPlanosRelacionamento", () => {
  const hoje = "2026-08-21";

  it("oculta o bloco quando o cliente nunca teve plano", () => {
    expect(classificarPlanosRelacionamento([], hoje)).toBeNull();
  });

  it("identifica plano ativo e soma apenas sessões de planos vigentes", () => {
    const resumo = classificarPlanosRelacionamento([
      { validade: "2026-09-30", importadoEm: new Date("2026-08-21"), servicos: [{ restantes: 4 }, { restantes: 2 }] },
      { validade: "2026-07-01", importadoEm: new Date("2026-08-20"), servicos: [{ restantes: 9 }] },
    ], hoje);
    expect(resumo).toMatchObject({ status: "ativo", sessoesDisponiveis: 6, validade: "2026-09-30" });
  });

  it("expõe por plano as terapias, sessões restantes, agendadas e utilizadas", () => {
    const resumo = classificarPlanosRelacionamento([
      {
        planoBelleId: 1901,
        validade: "2026-09-30",
        dataVenda: "2026-07-15",
        tipo: "Plano de massagens",
        importadoEm: new Date("2026-08-21"),
        servicos: [{ servicoNome: "Massagem Relaxante", sessoes: 10, restantes: 4, agendados: 2 }],
      },
    ], hoje);

    expect(resumo?.detalhes).toEqual([{
      planoBelleId: 1901,
      status: "ativo",
      validade: "2026-09-30",
      dataVenda: "2026-07-15",
      tipo: "Plano de massagens",
      campanha: null,
      vendedorNome: null,
      servicos: [{ nome: "Massagem Relaxante", sessoes: 10, restantes: 4, agendados: 2, utilizadas: 4 }],
    }]);
  });

  it("distingue plano finalizado de plano expirado", () => {
    const finalizado = classificarPlanosRelacionamento([
      { validade: "2026-09-30", importadoEm: new Date("2026-08-21"), servicos: [{ restantes: 0 }] },
    ], hoje);
    const expirado = classificarPlanosRelacionamento([
      { validade: "2026-08-01", importadoEm: new Date("2026-08-21"), servicos: [{ restantes: 3 }] },
    ], hoje);
    expect(finalizado).toMatchObject({ status: "finalizado", sessoesDisponiveis: 0 });
    expect(expirado).toMatchObject({ status: "expirado", sessoesDisponiveis: 0 });
  });
});
