import { describe, expect, it } from "vitest";
import { CONVERSA_GRUPO_GERAL_RBS_ID, destinoGrupoGeralRbsValido, montarMensagemChamadoTerapeuta, nomeCurtoCliente, primeiroNomeTerapeuta } from "./chamadoTerapeuta";

describe("chamado de terapeuta", () => {
  it("usa apenas o primeiro nome do terapeuta no aviso", () => {
    expect(primeiroNomeTerapeuta("Larissa de Souza")).toBe("Larissa");
    expect(primeiroNomeTerapeuta("  Thiago  ")).toBe("Thiago");
  });

  it("monta o chamado imediato com os campos operacionais", () => {
    expect(montarMensagemChamadoTerapeuta({
      modalidade: "chamado", clienteNome: "Fabiana", aguardandoEm: "Sala Espera - Não vai tomar chá (pode chamar)",
      terapeutaNome: "Larah", terapiaBemEstar: "Yin Yang 60", terapiaEstetica: null,
      sala: "1. Sala Shanti - Maca casal", taa: "TAA não se aplica", preferencial: false,
    })).toBe("*Chamado*\nTerapeuta: Larah.\nCliente: Fabiana aguarda em: Sala Espera - Não vai tomar chá (pode chamar).\nTerapia Bem-Estar: Yin Yang 60.\nLocal: 1. Sala Shanti - Maca casal.\nTAA não se aplica. Pref.: Não.");
  });

  it("monta o pré-chamado com horário previsto e limita o destino ao Grupo Geral RBS", () => {
    const texto = montarMensagemChamadoTerapeuta({
      modalidade: "pre_chamado", clienteNome: "Murilo", horarioPrevisto: "15:30", aguardandoEm: "Sala Espera - Tomando chá (chamar em 3 min)",
      terapeutaNome: "Lucimara", terapiaBemEstar: "Relaxante 60", terapiaEstetica: null,
      sala: "Shanti + Lotus - Sala compartilhada", taa: "TAA assinado", preferencial: true,
    });
    expect(texto).toContain("*Pré-chamado*");
    expect(texto).toContain("previsto(a) para chegar às 15:30");
    expect(texto).toContain("🟩 PREFERENCIAL");
    expect(destinoGrupoGeralRbsValido(CONVERSA_GRUPO_GERAL_RBS_ID, 2)).toBe(true);
    expect(destinoGrupoGeralRbsValido(900001, 2)).toBe(false);
  });

  it("abrevia cliente e preserva nome composto", () => {
    expect(nomeCurtoCliente("Fabiana Ricci Barbosa")).toBe("Fabiana");
    expect(nomeCurtoCliente("Ana Paula Souza")).toBe("Ana Paula");
  });
});
