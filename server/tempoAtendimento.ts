export type EventoTempoAtendimento = "inicio" | "fim";

export const CLASSIFICACOES_TEMPO = [
  "sem_referencia",
  "abaixo_do_tempo",
  "dentro_do_tempo",
  "acima_do_tempo",
  "muito_acima_do_tempo",
] as const;

export type ClassificacaoTempoAtendimento = (typeof CLASSIFICACOES_TEMPO)[number];

export interface LinhaTempoAtendimento {
  atendimentoId: number;
  dataAtendimento: string;
  horario: string | null;
  clienteNome: string;
  terapeutaNome: string;
  servicoNome: string | null;
  duracaoBelleMinutos: number | null;
  chamadoEm: Date | null;
  inicioEm: Date | null;
  fimEm: Date | null;
}

export interface LinhaTempoCalculada extends LinhaTempoAtendimento {
  esperaMinutos: number | null;
  duracaoSalaMinutos: number | null;
  desvioDuracaoMinutos: number | null;
  classificacao: ClassificacaoTempoAtendimento;
}

export interface ResumoTempoTerapeuta {
  terapeutaNome: string;
  totalChamados: number;
  atendimentosComInicio: number;
  atendimentosComFim: number;
  esperaMediaMinutos: number | null;
  duracaoMediaMinutos: number | null;
  desvioMedioMinutos: number | null;
  abaixoDoTempo: number;
  dentroDoTempo: number;
  acimaDoTempo: number;
  muitoAcimaDoTempo: number;
}

export interface RelatorioTempoAtendimento {
  dataInicio: string;
  dataFim: string;
  totalChamados: number;
  atendimentosComInicio: number;
  atendimentosComFim: number;
  esperaMediaMinutos: number | null;
  esperaMaximaMinutos: number | null;
  duracaoMediaMinutos: number | null;
  muitoAcimaDoTempo: number;
  terapeutas: ResumoTempoTerapeuta[];
  linhas: LinhaTempoCalculada[];
}

function normalizarTexto(valor: string | null | undefined): string {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

/** Reconhece apenas frases explícitas de início/fim para não transformar conversa comum em evento operacional. */
export function identificarEventoTempoAtendimento(conteudo: string | null | undefined): EventoTempoAtendimento | null {
  const texto = normalizarTexto(conteudo);
  if (!texto) return null;

  if (/\b(nao iniciei|ainda nao iniciei|nao comecei)\b/.test(texto)) return null;
  if (/\b(finalizei|finalizando|finalizado|finalizada|encerrei|encerrado|encerrada|terminei|terminando|liberei|conclui|concluido|concluida|sala liberada)\b/.test(texto)) {
    return "fim";
  }
  if (/\b(iniciando|iniciei|inicio|comecando|comecei|em sala|entrei na sala)\b/.test(texto)) {
    return "inicio";
  }
  return null;
}

export function nomesCorrespondem(nomeA: string | null | undefined, nomeB: string | null | undefined): boolean {
  const a = normalizarTexto(nomeA);
  const b = normalizarTexto(nomeB);
  if (!a || !b) return false;
  if (a === b) return true;
  const primeiroA = a.split(/\s+/)[0];
  const primeiroB = b.split(/\s+/)[0];
  return primeiroA.length >= 2 && primeiroA === primeiroB;
}

export interface IdentificadoresAtendimento {
  clienteNome: string | null | undefined;
  servicoNome: string | null | undefined;
  sala: string | null | undefined;
}

/** Pontua referências específicas para não confundir cinco chamados do mesmo terapeuta. */
export function pontuarIdentificadorAtendimento(conteudo: string | null | undefined, identificadores: IdentificadoresAtendimento): number {
  const texto = normalizarTexto(conteudo);
  if (!texto) return 0;
  const cliente = normalizarTexto(identificadores.clienteNome);
  const servico = normalizarTexto(identificadores.servicoNome);
  const sala = normalizarTexto(identificadores.sala);
  let pontos = 0;

  if (cliente && cliente.length >= 3 && texto.includes(cliente)) pontos += 100;
  else {
    const primeiroNomeCliente = cliente.split(/\s+/)[0];
    if (primeiroNomeCliente.length >= 3 && texto.split(/\s+/).includes(primeiroNomeCliente)) pontos += 70;
  }
  if (servico && servico.length >= 5 && texto.includes(servico)) pontos += 40;
  if (sala && sala.length >= 3 && texto.includes(sala)) pontos += 30;
  return pontos;
}

export interface CandidatoPareamentoAtendimento extends IdentificadoresAtendimento {
  atendimentoBelleId: number;
  terapeutaNome: string | null | undefined;
}

export function escolherAtendimentoPorEvento(
  participanteNome: string | null | undefined,
  conteudo: string | null | undefined,
  candidatos: CandidatoPareamentoAtendimento[],
): CandidatoPareamentoAtendimento | null {
  const doTerapeuta = candidatos.filter((candidato) => nomesCorrespondem(participanteNome, candidato.terapeutaNome));
  if (doTerapeuta.length === 0) return null;
  if (doTerapeuta.length === 1) return doTerapeuta[0];

  const ranqueados = doTerapeuta.map((linha) => ({
    linha,
    pontos: pontuarIdentificadorAtendimento(conteudo, linha),
  })).sort((a, b) => b.pontos - a.pontos);
  const melhor = ranqueados[0];
  const segundo = ranqueados[1];
  if (!melhor || melhor.pontos === 0 || melhor.pontos === segundo?.pontos) return null;
  return melhor.linha;
}

function diferencaMinutos(inicio: Date | null, fim: Date | null): number | null {
  if (!inicio || !fim) return null;
  const minutos = (fim.getTime() - inicio.getTime()) / 60000;
  return Number.isFinite(minutos) && minutos >= 0 ? minutos : null;
}

export function classificarDesvioDuracao(duracaoSalaMinutos: number | null, duracaoBelleMinutos: number | null): ClassificacaoTempoAtendimento {
  if (duracaoSalaMinutos === null || !duracaoBelleMinutos || duracaoBelleMinutos <= 0) return "sem_referencia";
  const proporcao = duracaoSalaMinutos / duracaoBelleMinutos;
  if (proporcao < 0.9) return "abaixo_do_tempo";
  if (proporcao <= 1.1) return "dentro_do_tempo";
  if (proporcao <= 1.25) return "acima_do_tempo";
  return "muito_acima_do_tempo";
}

function media(valores: Array<number | null>): number | null {
  const validos = valores.filter((valor): valor is number => valor !== null && Number.isFinite(valor));
  return validos.length ? validos.reduce((total, valor) => total + valor, 0) / validos.length : null;
}

function maior(valores: Array<number | null>): number | null {
  const validos = valores.filter((valor): valor is number => valor !== null && Number.isFinite(valor));
  return validos.length ? Math.max(...validos) : null;
}

export function calcularRelatorioTempoAtendimento(
  linhas: LinhaTempoAtendimento[],
  dataInicio: string,
  dataFim: string,
): RelatorioTempoAtendimento {
  const calculadas = linhas
    .filter((linha) => linha.dataAtendimento >= dataInicio && linha.dataAtendimento <= dataFim && linha.chamadoEm !== null)
    .map((linha) => {
      const esperaMinutos = diferencaMinutos(linha.chamadoEm, linha.inicioEm);
      const duracaoSalaMinutos = diferencaMinutos(linha.inicioEm, linha.fimEm);
      return {
        ...linha,
        esperaMinutos,
        duracaoSalaMinutos,
        desvioDuracaoMinutos: duracaoSalaMinutos !== null && linha.duracaoBelleMinutos !== null
          ? duracaoSalaMinutos - linha.duracaoBelleMinutos
          : null,
        classificacao: classificarDesvioDuracao(duracaoSalaMinutos, linha.duracaoBelleMinutos),
      };
    })
    .sort((a, b) => {
      const esperaA = a.esperaMinutos ?? -1;
      const esperaB = b.esperaMinutos ?? -1;
      if (esperaB !== esperaA) return esperaB - esperaA;
      return a.terapeutaNome.localeCompare(b.terapeutaNome, "pt-BR");
    });

  const nomes = new Set(calculadas.map((linha) => linha.terapeutaNome));
  const terapeutas = Array.from(nomes).map((terapeutaNome) => {
    const doTerapeuta = calculadas.filter((linha) => linha.terapeutaNome === terapeutaNome);
    return {
      terapeutaNome,
      totalChamados: doTerapeuta.length,
      atendimentosComInicio: doTerapeuta.filter((linha) => linha.inicioEm !== null).length,
      atendimentosComFim: doTerapeuta.filter((linha) => linha.fimEm !== null).length,
      esperaMediaMinutos: media(doTerapeuta.map((linha) => linha.esperaMinutos)),
      duracaoMediaMinutos: media(doTerapeuta.map((linha) => linha.duracaoSalaMinutos)),
      desvioMedioMinutos: media(doTerapeuta.map((linha) => linha.desvioDuracaoMinutos)),
      abaixoDoTempo: doTerapeuta.filter((linha) => linha.classificacao === "abaixo_do_tempo").length,
      dentroDoTempo: doTerapeuta.filter((linha) => linha.classificacao === "dentro_do_tempo").length,
      acimaDoTempo: doTerapeuta.filter((linha) => linha.classificacao === "acima_do_tempo").length,
      muitoAcimaDoTempo: doTerapeuta.filter((linha) => linha.classificacao === "muito_acima_do_tempo").length,
    };
  }).sort((a, b) => {
    if (b.muitoAcimaDoTempo !== a.muitoAcimaDoTempo) return b.muitoAcimaDoTempo - a.muitoAcimaDoTempo;
    return (b.esperaMediaMinutos ?? -1) - (a.esperaMediaMinutos ?? -1);
  });

  return {
    dataInicio,
    dataFim,
    totalChamados: calculadas.length,
    atendimentosComInicio: calculadas.filter((linha) => linha.inicioEm !== null).length,
    atendimentosComFim: calculadas.filter((linha) => linha.fimEm !== null).length,
    esperaMediaMinutos: media(calculadas.map((linha) => linha.esperaMinutos)),
    esperaMaximaMinutos: maior(calculadas.map((linha) => linha.esperaMinutos)),
    duracaoMediaMinutos: media(calculadas.map((linha) => linha.duracaoSalaMinutos)),
    muitoAcimaDoTempo: calculadas.filter((linha) => linha.classificacao === "muito_acima_do_tempo").length,
    terapeutas,
    linhas: calculadas,
  };
}
