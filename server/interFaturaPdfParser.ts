/**
 * Parser da fatura de cartão de crédito Inter em PDF (o modelo baixado
 * pelo Super App/site — cabeçalho "Resumo da fatura", seção "Despesas
 * da fatura" com uma tabela por cartão físico/virtual da conta).
 *
 * O pdf-parse extrai essa seção com tabs reais entre colunas (raro
 * neste banco — o extrato de conta corrente, por contraste, não tem
 * tabela real no PDF, ver interExtratoPdfParser.ts). Cada linha de
 * transação vem assim:
 *   "13 de jul. 2026 PAGAMENTO ON LINE\t-\t+ R$ 5.325,00"
 * onde o 1º campo (antes do 1º tab) já mistura data + movimentação, o
 * 2º é sempre "-" (beneficiário, não usado), e o 3º é o valor — com
 * "+" na frente quando é um crédito na fatura (pagamento/estorno) e
 * sem sinal quando é uma compra normal.
 *
 * Uma fatura agrupa N cartões (titular + adicionais) sob o mesmo CNPJ,
 * cada um com seu cabeçalho "CARTÃO XXXX****YYYY" — o parser rastreia
 * o cartão atual e anexa "(cartão final YYYY)" na descrição de cada
 * transação, só pra dar rastreabilidade (não vira campo separado).
 */

const MESES_ABREV: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

// "CARTÃO 5497****7145"
const CARTAO_RE = /^CART[ÃA]O\s+(\S+)$/i;

// "13 de jul. 2026 PAGAMENTO ON LINE" (1º campo, antes do 1º tab)
const DATA_MOVIMENTACAO_RE = /^(\d{1,2})\s+de\s+([a-zç]{3,4})\.?\s+(\d{4})\s+(.+)$/i;

export interface LinhaFaturaPdf {
  data: string; // AAAA-MM-DD
  descricao: string;
  tipo: "C" | "D";
  valor: number;
}

function parseValor(raw: string): { positivo: boolean; valor: number } {
  const limpo = raw.trim();
  const positivo = limpo.startsWith("+");
  const numero = limpo.replace(/^[+-]?\s*R\$\s?/, "").replace(/\./g, "").replace(",", ".");
  return { positivo, valor: parseFloat(numero) };
}

export function parseFaturaInterPdf(texto: string): LinhaFaturaPdf[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const resultado: LinhaFaturaPdf[] = [];
  let cartaoAtual: string | null = null;

  for (const linha of linhas) {
    const cartaoMatch = linha.match(CARTAO_RE);
    if (cartaoMatch) {
      cartaoAtual = cartaoMatch[1];
      continue;
    }

    if (!linha.includes("\t")) continue;
    const campos = linha.split("\t").map((c) => c.trim());
    if (campos.length < 3) continue;

    const [primeiroCampo, , valorTexto] = campos;
    const dataMatch = primeiroCampo.match(DATA_MOVIMENTACAO_RE);
    if (!dataMatch || !valorTexto.includes("R$")) continue;

    const [, dia, mesAbrev, ano, movimentacao] = dataMatch;
    const mes = MESES_ABREV[mesAbrev.toLowerCase()];
    if (!mes) continue;

    const { positivo, valor } = parseValor(valorTexto);
    if (Number.isNaN(valor) || valor === 0) continue;

    resultado.push({
      data: `${ano}-${String(mes).padStart(2, "0")}-${dia.padStart(2, "0")}`,
      descricao: cartaoAtual ? `${movimentacao.trim()} (cartão final ${cartaoAtual.slice(-4)})` : movimentacao.trim(),
      tipo: positivo ? "C" : "D",
      valor,
    });
  }

  return resultado;
}
