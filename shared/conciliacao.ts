/**
 * Geração do texto de conciliação "Comanda x Contas" pra um dia — puro,
 * sem I/O, usado tanto no client (hover das células vermelhas em
 * ComandaRecepcao.tsx) quanto no server (escrita da linha 20 na
 * planilha "Consolidado comanda", ver server/routers.ts
 * sincronizarContasBancariasParaDrive). Mesma lógica nos dois lados —
 * evita o hover mostrar uma coisa e a planilha registrar outra.
 *
 * As "Ações corretivas" vêm de um pareamento por valor entre os dois
 * lados (não de IA): valor+forma iguais = bate, sem ação; valor igual
 * mas forma diferente = sugestão de trocar a forma de pagamento; valor
 * parecido (dentro de uma tolerância pequena, tipo taxa arredondada) =
 * sugestão de conferir a diferença; sobrou só na Comanda = venda lançada
 * mas o dinheiro não apareceu na conta; sobrou só nas Contas = dinheiro
 * caiu mas não tem lançamento na comanda. Determinístico e auditável —
 * preferível a um texto gerado por LLM quando o assunto é dinheiro.
 *
 * Antes de parear: a adquirente (Granito/Mercado Pago) lança cartão
 * parcelado como uma linha POR PARCELA (ex.: "Elo (1/3)", "Elo (2/3)",
 * "Elo (3/3)"), enquanto a Comanda lança a venda inteira numa linha só
 * — sem agrupar essas parcelas de volta em uma venda antes de parear,
 * cada parcela vira um falso "sumiço". `agruparParcelas` reconstitui a
 * venda original (mesma forma + mesmo horário + mesma bandeira) antes
 * do pareamento.
 */

export type FormaPagamentoConciliacao = "dinheiro" | "debito" | "credito" | "pix";

export interface ItemConciliacao {
  forma: FormaPagamentoConciliacao;
  descricao: string;
  valor: number;
  horario?: string;
}

const LABEL_FORMA: Record<FormaPagamentoConciliacao, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pix: "Pix",
};

const TODAS_FORMAS: FormaPagamentoConciliacao[] = ["dinheiro", "debito", "credito", "pix"];

function fmtMoeda(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

function totalItens(itens: ItemConciliacao[]): number {
  return itens.reduce((s, i) => s + i.valor, 0);
}

function somaForma(itens: ItemConciliacao[], forma: FormaPagamentoConciliacao): number {
  return itens.filter((i) => i.forma === forma).reduce((s, i) => s + i.valor, 0);
}

// Descarta lançamentos de valor zero (ex.: linha "Vendas do dia" do
// Caixa Físico num dia sem dinheiro) — não representam nada real e só
// geram ação fantasma ("incluir recebimento de R$ 0,00").
function semValorZero(itens: ItemConciliacao[]): ItemConciliacao[] {
  return itens.filter((i) => i.valor > 0.005);
}

const REGEX_PARCELA = /^(.*?)\s*\((\d+)\/(\d+)\)$/;

/**
 * Reagrupa parcelas de uma mesma venda (mesma forma + mesmo horário +
 * mesma descrição-base, ex.: "Granito · Elo") numa única linha com o
 * valor somado — só quando há mais de 1 parcela (M > 1); um pagamento
 * "(1/1)" já representa a venda inteira e fica como está.
 */
function agruparParcelas(itens: ItemConciliacao[]): ItemConciliacao[] {
  const semParcela: ItemConciliacao[] = [];
  const grupos = new Map<string, { base: string; itens: ItemConciliacao[] }>();

  for (const item of itens) {
    const match = item.descricao.match(REGEX_PARCELA);
    const totalParcelas = match ? Number(match[3]) : 1;
    if (!match || totalParcelas <= 1) {
      semParcela.push(item);
      continue;
    }
    const base = match[1].trim();
    const chave = `${item.forma}|${item.horario ?? ""}|${base}`;
    const grupo = grupos.get(chave) ?? { base, itens: [] };
    grupo.itens.push(item);
    grupos.set(chave, grupo);
  }

  const agrupados: ItemConciliacao[] = [...semParcela];
  for (const { base, itens: lista } of Array.from(grupos.values())) {
    if (lista.length === 1) {
      agrupados.push(lista[0]);
      continue;
    }
    agrupados.push({
      forma: lista[0].forma,
      horario: lista[0].horario,
      valor: totalItens(lista),
      descricao: `${base} (${lista.length}x parcelado)`,
    });
  }
  return agrupados;
}

// Combinações de N itens (ordem não importa) — usado só depois que
// sobrarem itens sem par individual, pra manter pequeno (MAX_ITENS_GRUPO
// e mesma forma de pagamento limitam bastante o espaço de busca).
function combinacoes<T>(itens: T[], tamanho: number): T[][] {
  if (tamanho === 0) return [[]];
  if (itens.length < tamanho) return [];
  const [primeiro, ...resto] = itens;
  const comPrimeiro = combinacoes(resto, tamanho - 1).map((c) => [primeiro, ...c]);
  const semPrimeiro = combinacoes(resto, tamanho);
  return [...comPrimeiro, ...semPrimeiro];
}

const MAX_ITENS_GRUPO = 4;

/**
 * Procura um grupo de 2 a MAX_ITENS_GRUPO itens em `grupo` cuja soma bata
 * (mesma forma, valor exato) com um item avulso em `unico` — caso comum
 * no Day Spa: duas ou mais comandas separadas pagas numa única passada
 * de cartão. Retorna os índices do primeiro grupo encontrado, ou null.
 */
function encontrarGrupo(
  grupo: ItemConciliacao[],
  unico: ItemConciliacao[],
): { indicesGrupo: number[]; indiceUnico: number } | null {
  for (const forma of TODAS_FORMAS) {
    const candidatosGrupo = grupo.map((item, i) => ({ item, i })).filter(({ item }) => item.forma === forma);
    const candidatosUnico = unico.map((item, i) => ({ item, i })).filter(({ item }) => item.forma === forma);
    if (candidatosGrupo.length < 2 || candidatosUnico.length === 0) continue;
    for (let tamanho = 2; tamanho <= Math.min(MAX_ITENS_GRUPO, candidatosGrupo.length); tamanho++) {
      for (const combo of combinacoes(candidatosGrupo, tamanho)) {
        const soma = combo.reduce((s, { item }) => s + item.valor, 0);
        const alvo = candidatosUnico.find(({ item }) => Math.abs(item.valor - soma) < 0.005);
        if (alvo) return { indicesGrupo: combo.map(({ i }) => i), indiceUnico: alvo.i };
      }
    }
  }
  return null;
}

/**
 * Pareia Comanda x Contas por valor e retorna as ações corretivas. Todo
 * item que sobra sem par (não bateu por valor+forma, por valor com
 * forma diferente, nem por valor aproximado) vira uma linha própria em
 * "Conferir recebimento"/"Incluir na comanda" — não precisa de uma
 * listagem separada, essas mensagens já carregam valor/forma/descrição.
 */
function parear(comanda: ItemConciliacao[], contas: ItemConciliacao[]): { acoes: string[] } {
  const restanteComanda = [...comanda];
  const restanteContas = [...contas];
  const acoes: string[] = [];

  // 1) Mesmo valor, mesma forma — bate, remove dos dois lados sem gerar ação.
  for (let i = restanteComanda.length - 1; i >= 0; i--) {
    const item = restanteComanda[i];
    const j = restanteContas.findIndex((c) => c.forma === item.forma && Math.abs(c.valor - item.valor) < 0.005);
    if (j >= 0) {
      restanteComanda.splice(i, 1);
      restanteContas.splice(j, 1);
    }
  }

  // 2) Mesmo valor, forma diferente — provável erro de forma de pagamento.
  for (let i = restanteComanda.length - 1; i >= 0; i--) {
    const item = restanteComanda[i];
    const j = restanteContas.findIndex((c) => Math.abs(c.valor - item.valor) < 0.005);
    if (j >= 0) {
      const par = restanteContas[j];
      acoes.push(
        `Alterar forma de pagamento da venda de ${fmtMoeda(item.valor)} (${item.descricao}): lançada como ${LABEL_FORMA[item.forma]} na comanda, mas recebida via ${LABEL_FORMA[par.forma]} nas contas.`,
      );
      restanteComanda.splice(i, 1);
      restanteContas.splice(j, 1);
    }
  }

  // 3) Valor parecido, mesma forma — divergência pequena (taxa/arredondamento).
  const tolerancia = (valor: number) => Math.max(2, valor * 0.03);
  for (let i = restanteComanda.length - 1; i >= 0; i--) {
    const item = restanteComanda[i];
    const j = restanteContas.findIndex((c) => c.forma === item.forma && Math.abs(c.valor - item.valor) <= tolerancia(item.valor));
    if (j >= 0) {
      const par = restanteContas[j];
      acoes.push(
        `Conferir diferença de valor na venda de ${item.descricao}: comanda ${fmtMoeda(item.valor)} x contas ${fmtMoeda(par.valor)} (${LABEL_FORMA[item.forma]}).`,
      );
      restanteComanda.splice(i, 1);
      restanteContas.splice(j, 1);
    }
  }

  // 3.5) Grupo de itens de um lado somando o valor de um item avulso do
  // outro — ex.: duas comandas de Day Spa (R$343 cada) pagas numa única
  // passada de cartão de R$686. Tenta nos dois sentidos (grupo na
  // Comanda x avulso nas Contas, e o inverso — venda paga em parcelas
  // separadas nas contas). Repete até não achar mais nenhum grupo, já
  // que casar um grupo pode liberar itens que fecham outro.
  while (true) {
    const grupoNaComanda = encontrarGrupo(restanteComanda, restanteContas);
    if (grupoNaComanda) {
      const itensGrupo = grupoNaComanda.indicesGrupo.map((i) => restanteComanda[i]);
      const itemUnico = restanteContas[grupoNaComanda.indiceUnico];
      const soma = totalItens(itensGrupo);
      const horario = itemUnico.horario ? ` às ${itemUnico.horario}` : "";
      acoes.push(
        `Pagamento único de ${fmtMoeda(soma)} (${LABEL_FORMA[itemUnico.forma]}${horario} — ${itemUnico.descricao}) provavelmente cobre ${itensGrupo.length} vendas da comanda: ${itensGrupo.map((i) => `${i.descricao} (${fmtMoeda(i.valor)})`).join(", ")}. Confira e vincule.`,
      );
      for (const i of [...grupoNaComanda.indicesGrupo].sort((a, b) => b - a)) restanteComanda.splice(i, 1);
      restanteContas.splice(grupoNaComanda.indiceUnico, 1);
      continue;
    }
    const grupoNasContas = encontrarGrupo(restanteContas, restanteComanda);
    if (grupoNasContas) {
      const itensGrupo = grupoNasContas.indicesGrupo.map((i) => restanteContas[i]);
      const itemUnico = restanteComanda[grupoNasContas.indiceUnico];
      const soma = totalItens(itensGrupo);
      acoes.push(
        `Venda de ${fmtMoeda(soma)} (${LABEL_FORMA[itemUnico.forma]} — ${itemUnico.descricao}) provavelmente foi recebida em ${itensGrupo.length} lançamentos separados nas contas: ${itensGrupo.map((i) => fmtMoeda(i.valor)).join(", ")}. Confira e vincule.`,
      );
      for (const i of [...grupoNasContas.indicesGrupo].sort((a, b) => b - a)) restanteContas.splice(i, 1);
      restanteComanda.splice(grupoNasContas.indiceUnico, 1);
      continue;
    }
    break;
  }

  // 4) Sobrou só na Comanda — recepção lançou, mas o dinheiro não apareceu na conta.
  for (const item of restanteComanda) {
    acoes.push(
      `Conferir recebimento: venda de ${fmtMoeda(item.valor)} (${LABEL_FORMA[item.forma]} — ${item.descricao}) lançada na comanda, mas não aparece nas contas.`,
    );
  }

  // 5) Sobrou só nas Contas — caiu dinheiro sem lançamento correspondente na comanda.
  for (const item of restanteContas) {
    const horario = item.horario ? ` às ${item.horario}` : "";
    acoes.push(
      `Incluir na comanda: recebimento de ${fmtMoeda(item.valor)} (${LABEL_FORMA[item.forma]}${horario} — ${item.descricao}) ainda não lançado.`,
    );
  }

  return { acoes };
}

/**
 * Retorna o bloco de texto formatado (ver cabeçalho do arquivo) ou
 * `null` quando não há diferença nenhuma nesse dia (nem no total, nem
 * em nenhuma forma isolada) — o chamador usa `null` pra decidir não
 * mostrar hover / limpar a célula da planilha. "Comanda"/"Contas" aqui
 * são só os totais do dia (pra dar a dimensão da diferença) — o
 * detalhamento fica todo em "Ações corretivas", que já descreve
 * valor/forma/descrição de cada divergência; repetir isso numa lista
 * separada seria redundante (e ficava vazia sempre que a diferença
 * inteira já se explicava por troca de forma ou taxa arredondada).
 */
export function gerarTextoConciliacao(
  dataIso: string,
  comandaBruta: ItemConciliacao[],
  contasBruta: ItemConciliacao[],
  labelLadoB: string = "Contas",
): string | null {
  const comanda = semValorZero(comandaBruta);
  const contas = semValorZero(contasBruta);

  const totalComanda = totalItens(comanda);
  const totalContas = totalItens(contas);
  const temDiferenca =
    Math.abs(totalComanda - totalContas) > 0.005 ||
    TODAS_FORMAS.some((f) => Math.abs(somaForma(comanda, f) - somaForma(contas, f)) > 0.005);
  if (!temDiferenca) return null;

  const { acoes } = parear(comanda, agruparParcelas(contas));

  const [, mes, dia] = dataIso.split("-");
  const linhas: string[] = [];
  linhas.push(`Conciliação dia ${dia}/${mes}:`);
  linhas.push(`Comanda: ${fmtMoeda(totalComanda)}`);
  linhas.push(`${labelLadoB}: ${fmtMoeda(totalContas)}`);
  linhas.push(`Diferença: ${fmtMoeda(totalComanda - totalContas)}`);
  linhas.push("");
  linhas.push("Ações corretivas:");
  for (const acao of acoes) linhas.push(`- ${acao}`);

  return linhas.join("\n");
}
