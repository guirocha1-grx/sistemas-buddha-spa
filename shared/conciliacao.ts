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

// Diferenças pequenas (taxa arredondada, centavos) ainda contam como o
// "mesmo" lançamento pareado — evita gerar duas ações (uma de valor,
// uma de "sumiu") pro que é só ruído de centavos.
function tolerancia(valor: number): number {
  return Math.max(2, valor * 0.03);
}

function gerarAcoesCorretivas(comanda: ItemConciliacao[], contas: ItemConciliacao[]): string[] {
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

  return acoes;
}

/**
 * Retorna o bloco de texto formatado (ver cabeçalho do arquivo) ou
 * `null` quando não há diferença nenhuma nesse dia (nem no total, nem
 * em nenhuma forma isolada) — o chamador usa `null` pra decidir não
 * mostrar hover / limpar a célula da planilha.
 */
export function gerarTextoConciliacao(
  dataIso: string,
  comanda: ItemConciliacao[],
  contas: ItemConciliacao[],
): string | null {
  const totalComanda = totalItens(comanda);
  const totalContas = totalItens(contas);
  const temDiferenca =
    Math.abs(totalComanda - totalContas) > 0.005 ||
    TODAS_FORMAS.some((f) => Math.abs(somaForma(comanda, f) - somaForma(contas, f)) > 0.005);
  if (!temDiferenca) return null;

  const [, mes, dia] = dataIso.split("-");
  const linhas: string[] = [];
  linhas.push(`Conciliação dia ${dia}/${mes}:`);
  linhas.push("Comanda:");
  if (comanda.length === 0) linhas.push("(nenhum lançamento)");
  else comanda.forEach((i) => linhas.push(fmtLinhaItem(i)));
  linhas.push(`Total: ${fmtMoeda(totalComanda)}`);
  linhas.push("");
  linhas.push("Contas:");
  if (contas.length === 0) linhas.push("(nenhum lançamento)");
  else contas.forEach((i) => linhas.push(fmtLinhaItem(i)));
  linhas.push(`Total: ${fmtMoeda(totalContas)}`);
  linhas.push("");
  linhas.push("Ações corretivas:");
  for (const acao of gerarAcoesCorretivas(comanda, contas)) linhas.push(`- ${acao}`);

  return linhas.join("\n");
}
