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

function distanciaEdicao(a: string, b: string): number {
  const linha = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = linha[j];
      linha[j] = a[i - 1] === b[j - 1] ? anterior : 1 + Math.min(anterior, linha[j], linha[j - 1]);
      anterior = temp;
    }
  }
  return linha[b.length];
}

export interface TerapeutaRoster {
  id: number;
  nomeCompleto: string;
  nomeAbreviado: string;
}

/**
 * Resolve um nome livre (digitado na Comanda, ou vindo do Belle) pro
 * terapeuta cadastrado correspondente — em vez de comparar texto livre
 * direto entre Comanda e Belle, os dois lados batem contra o cadastro
 * oficial. Cobre casos reais que `nomesCorrespondem` sozinho não pega:
 * apelido com erro de digitação ("Crislaine" pro cadastro "Crislane"),
 * e o Belle às vezes prefixar com o cargo ("Terapeuta Gabriel"). Some
 * de propósito (retorna null) quando o texto não é uma pessoa — ex.
 * "Produto (não esquecer NFP)" na Comanda, ou "Banho II" no Belle
 * (nome da sala/recurso pra atendimento sem terapeuta dedicado, tipo
 * banho de imersão) — esses casos não são divergência, são "não dá
 * pra comparar".
 */
export function identificarTerapeuta(nomeRaw: string | null | undefined, roster: TerapeutaRoster[]): number | null {
  const texto = normalizarTexto(nomeRaw).replace(/^terapeuta\s+/, "");
  if (!texto) return null;

  for (const t of roster) {
    if (nomesCorrespondem(texto, t.nomeAbreviado) || nomesCorrespondem(texto, t.nomeCompleto)) return t.id;
  }

  // Fallback só entra se for uma variação pequena e sem ambiguidade
  // (senão prefere não resolver a arriscar casar terapeuta errado).
  const primeiroToken = texto.split(/\s+/)[0];
  if (primeiroToken.length < 3) return null;
  const candidatos = roster
    .map((t) => ({ t, distancia: distanciaEdicao(primeiroToken, normalizarTexto(t.nomeAbreviado)) }))
    .filter((c) => c.distancia <= 2)
    .sort((a, b) => a.distancia - b.distancia);
  if (candidatos.length === 1 || (candidatos.length > 1 && candidatos[0].distancia < candidatos[1].distancia)) {
    return candidatos[0].t.id;
  }
  return null;
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
  const palavras = texto.split(/[^a-z0-9]+/).filter(Boolean);
  let pontos = 0;

  if (cliente && cliente.length >= 3 && texto.includes(cliente)) pontos += 100;
  else {
    const primeiroNomeCliente = cliente.split(/\s+/)[0];
    if (primeiroNomeCliente.length >= 3 && palavras.includes(primeiroNomeCliente)) pontos += 70;
  }
  if (servico && servico.length >= 5 && texto.includes(servico)) pontos += 40;
  if (sala && sala.length >= 3 && texto.includes(sala)) pontos += 30;
  return pontos;
}

export interface CandidatoPareamentoAtendimento extends IdentificadoresAtendimento {
  atendimentoBelleId: number;
  terapeutaId?: number | null;
  terapeutaNome: string | null | undefined;
}

export function escolherAtendimentoPorEvento(
  participanteNome: string | null | undefined,
  conteudo: string | null | undefined,
  candidatos: CandidatoPareamentoAtendimento[],
  permitirFallbackSequencial = false,
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
  if (!melhor) return null;
  if (melhor.pontos === 0) return permitirFallbackSequencial ? melhor.linha : null;
  if (melhor.pontos === segundo?.pontos) return null;
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
