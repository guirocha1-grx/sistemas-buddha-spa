export const DATA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface TerapeutaRelatorioBase {
  id: number;
  nomeCompleto: string;
  nomeAbreviado: string;
}

export interface AtendimentoFidelizacaoInput {
  profissionalNome: string | null;
  temPreferencia: boolean;
}

export interface FidelizacaoTerapeuta {
  terapeutaId: number;
  terapeutaNome: string;
  totalAtendimentos: number;
  atendimentosFidelizados: number;
  atendimentosNaoFidelizados: number;
  percentualFidelizacao: number | null;
  percentualNaoFidelizacao: number | null;
}

export interface AtendimentoPreferencialInput {
  clienteId: number | null;
  clienteNome: string;
  profissionalNome: string | null;
  temPreferencia: boolean;
}

export interface ClientePreferencialDetalhe {
  clienteId: number | null;
  clienteNome: string;
  atendimentos: number;
}

export interface PreferenciaisTerapeuta {
  terapeutaId: number;
  terapeutaNome: string;
  clientesPreferenciais: number;
  clientes: ClientePreferencialDetalhe[];
}

export function normalizarNomeTerapeuta(nome: string | null | undefined): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

function indiceTerapeutas(terapeutas: TerapeutaRelatorioBase[]): Map<string, TerapeutaRelatorioBase> {
  const indice = new Map<string, TerapeutaRelatorioBase>();
  for (const terapeuta of terapeutas) {
    for (const nome of [terapeuta.nomeCompleto, terapeuta.nomeAbreviado]) {
      const chave = normalizarNomeTerapeuta(nome);
      if (chave && !indice.has(chave)) indice.set(chave, terapeuta);
    }
  }
  return indice;
}

export function calcularFidelizacao(
  terapeutas: TerapeutaRelatorioBase[],
  atendimentos: AtendimentoFidelizacaoInput[],
): FidelizacaoTerapeuta[] {
  const indice = indiceTerapeutas(terapeutas);
  const contagens = new Map<number, { total: number; fidelizados: number }>();

  for (const atendimento of atendimentos) {
    const terapeuta = indice.get(normalizarNomeTerapeuta(atendimento.profissionalNome));
    if (!terapeuta) continue;
    const atual = contagens.get(terapeuta.id) ?? { total: 0, fidelizados: 0 };
    atual.total += 1;
    if (atendimento.temPreferencia) atual.fidelizados += 1;
    contagens.set(terapeuta.id, atual);
  }

  const linhas = terapeutas.map((terapeuta) => {
    const contagem = contagens.get(terapeuta.id) ?? { total: 0, fidelizados: 0 };
    const naoFidelizados = contagem.total - contagem.fidelizados;
    return {
      terapeutaId: terapeuta.id,
      terapeutaNome: terapeuta.nomeAbreviado || terapeuta.nomeCompleto,
      totalAtendimentos: contagem.total,
      atendimentosFidelizados: contagem.fidelizados,
      atendimentosNaoFidelizados: naoFidelizados,
      percentualFidelizacao: contagem.total ? (contagem.fidelizados / contagem.total) * 100 : null,
      percentualNaoFidelizacao: contagem.total ? (naoFidelizados / contagem.total) * 100 : null,
    };
  });

  return linhas.sort((a, b) => {
    if (a.percentualFidelizacao === null && b.percentualFidelizacao !== null) return 1;
    if (a.percentualFidelizacao !== null && b.percentualFidelizacao === null) return -1;
    if ((b.percentualFidelizacao ?? -1) !== (a.percentualFidelizacao ?? -1)) {
      return (b.percentualFidelizacao ?? -1) - (a.percentualFidelizacao ?? -1);
    }
    if (b.totalAtendimentos !== a.totalAtendimentos) return b.totalAtendimentos - a.totalAtendimentos;
    return a.terapeutaNome.localeCompare(b.terapeutaNome, "pt-BR");
  });
}

export function calcularPreferenciaisPorAtendimento(
  terapeutas: TerapeutaRelatorioBase[],
  atendimentos: AtendimentoPreferencialInput[],
): PreferenciaisTerapeuta[] {
  const indice = indiceTerapeutas(terapeutas);
  const clientesPorTerapeuta = new Map<number, Map<string, ClientePreferencialDetalhe>>();

  for (const atendimento of atendimentos) {
    if (!atendimento.temPreferencia) continue;
    const terapeuta = indice.get(normalizarNomeTerapeuta(atendimento.profissionalNome));
    if (!terapeuta) continue;

    const nomeNormalizado = atendimento.clienteNome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("pt-BR");
    const chaveCliente = atendimento.clienteId !== null && Number.isInteger(atendimento.clienteId)
      ? `id:${atendimento.clienteId}`
      : nomeNormalizado ? `nome:${nomeNormalizado}` : null;
    if (!chaveCliente) continue;

    const clientes = clientesPorTerapeuta.get(terapeuta.id) ?? new Map<string, ClientePreferencialDetalhe>();
    const atual = clientes.get(chaveCliente) ?? {
      clienteId: atendimento.clienteId,
      clienteNome: atendimento.clienteNome.trim() || "Cliente sem nome",
      atendimentos: 0,
    };
    atual.atendimentos += 1;
    clientes.set(chaveCliente, atual);
    clientesPorTerapeuta.set(terapeuta.id, clientes);
  }

  return terapeutas.map((terapeuta) => {
    const clientes = Array.from(clientesPorTerapeuta.get(terapeuta.id)?.values() ?? []).sort((a, b) => {
      if (b.atendimentos !== a.atendimentos) return b.atendimentos - a.atendimentos;
      return a.clienteNome.localeCompare(b.clienteNome, "pt-BR");
    });
    return {
      terapeutaId: terapeuta.id,
      terapeutaNome: terapeuta.nomeAbreviado || terapeuta.nomeCompleto,
      clientesPreferenciais: clientes.length,
      clientes,
    };
  }).sort((a, b) => {
    if (b.clientesPreferenciais !== a.clientesPreferenciais) return b.clientesPreferenciais - a.clientesPreferenciais;
    return a.terapeutaNome.localeCompare(b.terapeutaNome, "pt-BR");
  });
}
