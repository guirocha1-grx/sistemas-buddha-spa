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

export interface PreferenciaTerapeutaInput {
  clienteId: number;
  terapeutaId: number | null;
  terapeutaNome: string | null;
}

export interface PreferenciaisTerapeuta {
  terapeutaId: number;
  terapeutaNome: string;
  clientesPreferenciais: number;
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

export function calcularPreferenciais(
  terapeutas: TerapeutaRelatorioBase[],
  preferencias: PreferenciaTerapeutaInput[],
): PreferenciaisTerapeuta[] {
  const indice = indiceTerapeutas(terapeutas);
  const clientesPorTerapeuta = new Map<number, Set<number>>();

  for (const preferencia of preferencias) {
    const terapeuta = preferencia.terapeutaId
      ? terapeutas.find((item) => item.id === preferencia.terapeutaId)
      : indice.get(normalizarNomeTerapeuta(preferencia.terapeutaNome));
    if (!terapeuta || !Number.isInteger(preferencia.clienteId)) continue;
    const clientes = clientesPorTerapeuta.get(terapeuta.id) ?? new Set<number>();
    clientes.add(preferencia.clienteId);
    clientesPorTerapeuta.set(terapeuta.id, clientes);
  }

  return terapeutas.map((terapeuta) => ({
    terapeutaId: terapeuta.id,
    terapeutaNome: terapeuta.nomeAbreviado || terapeuta.nomeCompleto,
    clientesPreferenciais: clientesPorTerapeuta.get(terapeuta.id)?.size ?? 0,
  })).sort((a, b) => {
    if (b.clientesPreferenciais !== a.clientesPreferenciais) return b.clientesPreferenciais - a.clientesPreferenciais;
    return a.terapeutaNome.localeCompare(b.terapeutaNome, "pt-BR");
  });
}
