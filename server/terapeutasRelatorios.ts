export const DATA_ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const DIAS_SEMANA = [
  { numero: 1, nome: "Segunda-feira" },
  { numero: 2, nome: "Terça-feira" },
  { numero: 3, nome: "Quarta-feira" },
  { numero: 4, nome: "Quinta-feira" },
  { numero: 5, nome: "Sexta-feira" },
  { numero: 6, nome: "Sábado" },
  { numero: 0, nome: "Domingo" },
] as const;

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

export interface AtendimentoFechamentoInput {
  profissionalNome: string | null;
  dataAtendimento: string;
}

export interface FechamentoDiaSemana {
  diaSemana: number;
  nomeDia: string;
  atendimentos: number;
  diasAnalisados: number;
  diasComAtendimento: number;
  diasSemAtendimento: number;
  fechamentosProfissionais: number;
  percentualDiasSemAtendimento: number;
}

export interface FechamentoTerapeuta {
  terapeutaId: number;
  terapeutaNome: string;
  diasAnalisados: number;
  diasSemAtendimento: number;
  percentualDiasSemAtendimento: number;
  diasSemAtendimentoPorDiaSemana: Record<string, number>;
}

export interface FechamentoAgendaRelatorio {
  dataInicio: string;
  dataFim: string;
  totalDiasCalendario: number;
  totalFechamentos: number;
  resumoSemanal: FechamentoDiaSemana[];
  terapeutas: FechamentoTerapeuta[];
}

function diaUTC(data: string): Date | null {
  const partes = data.split("-").map(Number);
  if (partes.length !== 3 || partes.some((parte) => !Number.isInteger(parte))) return null;
  const [ano, mes, dia] = partes;
  const resultado = new Date(Date.UTC(ano, mes - 1, dia));
  return resultado.getUTCFullYear() === ano && resultado.getUTCMonth() === mes - 1 && resultado.getUTCDate() === dia
    ? resultado
    : null;
}

function datasDoPeriodo(dataInicio: string, dataFim: string): string[] {
  const inicio = diaUTC(dataInicio);
  const fim = diaUTC(dataFim);
  if (!inicio || !fim || inicio > fim) return [];

  const datas: string[] = [];
  for (let data = inicio; data <= fim; data = new Date(data.getTime() + 24 * 60 * 60 * 1000)) {
    datas.push(data.toISOString().slice(0, 10));
  }
  return datas;
}

function diaDaSemana(data: string): number {
  return diaUTC(data)?.getUTCDay() ?? -1;
}

export function calcularFechamentoAgenda(
  terapeutas: TerapeutaRelatorioBase[],
  atendimentos: AtendimentoFechamentoInput[],
  dataInicio: string,
  dataFim: string,
): FechamentoAgendaRelatorio {
  const datas = datasDoPeriodo(dataInicio, dataFim);
  const indice = indiceTerapeutas(terapeutas);
  const atendimentosPorTerapeuta = new Map<number, Set<string>>();
  const atendimentosPorDia = new Map<number, number>();
  const diasComAtendimentoPorDia = new Map<number, Set<string>>();

  for (const atendimento of atendimentos) {
    if (!datas.includes(atendimento.dataAtendimento)) continue;
    const dia = diaDaSemana(atendimento.dataAtendimento);
    const terapeuta = indice.get(normalizarNomeTerapeuta(atendimento.profissionalNome));
    if (dia < 0 || !terapeuta) continue;

    const diasDoTerapeuta = atendimentosPorTerapeuta.get(terapeuta.id) ?? new Set<string>();
    diasDoTerapeuta.add(atendimento.dataAtendimento);
    atendimentosPorTerapeuta.set(terapeuta.id, diasDoTerapeuta);
    atendimentosPorDia.set(dia, (atendimentosPorDia.get(dia) ?? 0) + 1);
    const diasComAtendimento = diasComAtendimentoPorDia.get(dia) ?? new Set<string>();
    diasComAtendimento.add(atendimento.dataAtendimento);
    diasComAtendimentoPorDia.set(dia, diasComAtendimento);
  }

  const terapeutasResultado = terapeutas.map((terapeuta) => {
    const diasComAtendimento = atendimentosPorTerapeuta.get(terapeuta.id) ?? new Set<string>();
    const diasSemAtendimentoPorDiaSemana: Record<string, number> = Object.fromEntries(DIAS_SEMANA.map(({ numero }) => [String(numero), 0]));
    let diasSemAtendimento = 0;

    for (const data of datas) {
      if (diasComAtendimento.has(data)) continue;
      const dia = diaDaSemana(data);
      if (dia < 0) continue;
      diasSemAtendimento += 1;
      diasSemAtendimentoPorDiaSemana[String(dia)] = (diasSemAtendimentoPorDiaSemana[String(dia)] ?? 0) + 1;
    }

    return {
      terapeutaId: terapeuta.id,
      terapeutaNome: terapeuta.nomeAbreviado || terapeuta.nomeCompleto,
      diasAnalisados: datas.length,
      diasSemAtendimento,
      percentualDiasSemAtendimento: datas.length ? (diasSemAtendimento / datas.length) * 100 : 0,
      diasSemAtendimentoPorDiaSemana,
    };
  }).sort((a, b) => {
    if (b.diasSemAtendimento !== a.diasSemAtendimento) return b.diasSemAtendimento - a.diasSemAtendimento;
    return a.terapeutaNome.localeCompare(b.terapeutaNome, "pt-BR");
  });

  const resumoSemanal = DIAS_SEMANA.map(({ numero, nome }) => {
    const diasAnalisados = datas.filter((data) => diaDaSemana(data) === numero).length;
    const diasComAtendimento = diasComAtendimentoPorDia.get(numero)?.size ?? 0;
    const diasSemAtendimento = Math.max(0, diasAnalisados - diasComAtendimento);
    const fechamentosProfissionais = terapeutasResultado.reduce(
      (total, terapeuta) => total + (terapeuta.diasSemAtendimentoPorDiaSemana[String(numero)] ?? 0),
      0,
    );
    return {
      diaSemana: numero,
      nomeDia: nome,
      atendimentos: atendimentosPorDia.get(numero) ?? 0,
      diasAnalisados,
      diasComAtendimento,
      diasSemAtendimento,
      fechamentosProfissionais,
      percentualDiasSemAtendimento: diasAnalisados ? (diasSemAtendimento / diasAnalisados) * 100 : 0,
    };
  });

  return {
    dataInicio,
    dataFim,
    totalDiasCalendario: datas.length,
    totalFechamentos: terapeutasResultado.reduce((total, terapeuta) => total + terapeuta.diasSemAtendimento, 0),
    resumoSemanal,
    terapeutas: terapeutasResultado,
  };
}
