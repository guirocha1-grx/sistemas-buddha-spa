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

function fmtLinhaItem(item: ItemConciliacao): string {
  const horario = item.horario ? `${item.horario} · ` : "";
  return `- ${horario}${LABEL_FORMA[item.forma]} ${fmtMoeda(item.valor)} — ${item.descricao}`;
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

/**
 * Pareia Comanda x Contas por valor. Retorna as ações corretivas junto
 * com o que sobrou sem parear de cada lado (`pendentesComanda`/
 * `pendentesContas`) — é exatamente isso que o chamador mostra nas
 * seções "Comanda:"/"Contas:" do texto final, em vez do dia inteiro.
 */
function parear(
  comanda: ItemConciliacao[],
  contas: ItemConciliacao[],
): { acoes: string[]; pendentesComanda: ItemConciliacao[]; pendentesContas: ItemConciliacao[] } {
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

  return { acoes, pendentesComanda: restanteComanda, pendentesContas: restanteContas };
}

/**
 * Retorna o bloco de texto formatado (ver cabeçalho do arquivo) ou
 * `null` quando não há diferença nenhuma nesse dia (nem no total, nem
 * em nenhuma forma isolada) — o chamador usa `null` pra decidir não
 * mostrar hover / limpar a célula da planilha. As seções "Comanda:"/
 * "Contas:" listam só o que não foi pareado (não o dia inteiro) — o
 * "Total:" continua sendo o total do dia inteiro, pra dar a dimensão
 * da diferença mesmo com a lista enxuta.
 */
export function gerarTextoConciliacao(
  dataIso: string,
  comandaBruta: ItemConciliacao[],
  contasBruta: ItemConciliacao[],
): string | null {
  const comanda = semValorZero(comandaBruta);
  const contas = semValorZero(contasBruta);

  const totalComanda = totalItens(comanda);
  const totalContas = totalItens(contas);
  const temDiferenca =
    Math.abs(totalComanda - totalContas) > 0.005 ||
    TODAS_FORMAS.some((f) => Math.abs(somaForma(comanda, f) - somaForma(contas, f)) > 0.005);
  if (!temDiferenca) return null;

  const { acoes, pendentesComanda, pendentesContas } = parear(comanda, agruparParcelas(contas));

  const [, mes, dia] = dataIso.split("-");
  const linhas: string[] = [];
  linhas.push(`Conciliação dia ${dia}/${mes}:`);
  linhas.push("Comanda:");
  if (pendentesComanda.length === 0) linhas.push("(tudo pareado com as contas)");
  else pendentesComanda.forEach((i) => linhas.push(fmtLinhaItem(i)));
  linhas.push(`Total: ${fmtMoeda(totalComanda)}`);
  linhas.push("");
  linhas.push("Contas:");
  if (pendentesContas.length === 0) linhas.push("(tudo pareado com a comanda)");
  else pendentesContas.forEach((i) => linhas.push(fmtLinhaItem(i)));
  linhas.push(`Total: ${fmtMoeda(totalContas)}`);
  linhas.push("");
  linhas.push("Ações corretivas:");
  for (const acao of acoes) linhas.push(`- ${acao}`);

  return linhas.join("\n");
}
