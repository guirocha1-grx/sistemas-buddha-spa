/**
 * Parser da fatura de cartão de crédito Sicredi em PDF (o modelo
 * baixado pelo app/site — seção "Transações", uma tabela por cartão
 * físico/virtual/adicional sob a mesma fatura).
 *
 * Diferente da fatura do Inter (que vem com tabs reais entre colunas,
 * ver interFaturaPdfParser.ts), aqui o pdf-parse extrai texto solto
 * sem tabela — cada linha é "DD/mmm HH:MM Cidade Compra Descrição
 * [Parcela] [-]R$ valor", e descrições longas às vezes quebram em 2
 * linhas (a cidade/complemento final acaba numa linha separada do
 * resto). Por isso acumula linhas até fechar uma transação válida,
 * mesmo espírito do interExtratoPdfParser.ts.
 *
 * Sinal do valor: "-R$" = crédito na fatura (pagamento da fatura
 * anterior ou estorno/reembolso) — sem sinal = compra normal (débito).
 * Campo Parcela (formato NN/NN) é opcional, só aparece em compras
 * parceladas, sempre logo antes do valor.
 */

const MESES_ABREV: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

// "Cartão Guilherme Rocha (final 0118)" / "Cartão portador virtual Vanessa Busch Rocha (final 6322)"
const CARTAO_RE = /^Cart[ãa]o(?:\s+portador)?(?:\s+virtual)?\s+(.+?)\s*\(final\s+(\d+)\)$/i;

// Início de uma transação: "23/jun 21:33 ..." — usado pra decidir quando começar a acumular.
const INICIO_TX_RE = /^(\d{1,2})\/([a-zç]{3})\s+(\d{1,2}):(\d{2})\s/i;

// Transação completa (já com todas as linhas quebradas juntas):
// "23/jun 21:33 Pagamento 023185196 -R$ 34,89"
// "05/fev 22:13 Online Niclo S Coml Ltda 06/06 R$ 442,60"
const TX_RE = /^(\d{1,2})\/([a-zç]{3})\s+(\d{1,2}):(\d{2})\s+(.*?)\s+(?:(\d{2}\/\d{2})\s+)?(-)?R\$\s?([\d.,]+)$/i;

const MAX_LINHAS_ACUMULADAS = 3;

// "Vencimento 23/07/2026" — aparece no cabeçalho de cada página, usado
// como data de referência pra resolver o ano das transações (que só
// trazem "DD/mmm", sem ano).
const VENCIMENTO_RE = /Vencimento\s+(\d{2})\/(\d{2})\/(\d{4})/;

export interface LinhaFaturaPdf {
  data: string; // AAAA-MM-DD (usa o ano corrente/próximo mais plausível — ver resolverAno)
  descricao: string;
  tipo: "C" | "D";
  valor: number;
}

/**
 * A fatura só traz "DD/mmm", sem ano — infere pelo ano de referência
 * (vencimento da fatura) e volta 1 ano se o mês da transação for muito
 * "no futuro" em relação a ele (caso clássico: fatura fecha em janeiro
 * com compras de dezembro do ano anterior).
 */
function resolverAno(mes: number, mesReferencia: number, anoReferencia: number): number {
  return mes > mesReferencia + 1 ? anoReferencia - 1 : anoReferencia;
}

export function parseFaturaSicrediPdf(texto: string): LinhaFaturaPdf[] {
  const vencimentoMatch = texto.match(VENCIMENTO_RE);
  if (!vencimentoMatch) return [];
  const mesReferencia = parseInt(vencimentoMatch[2], 10);
  const anoReferenciaNum = parseInt(vencimentoMatch[3], 10);

  const linhasBrutas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const resultado: LinhaFaturaPdf[] = [];
  let cartaoAtual: string | null = null;
  let buffer = "";
  let linhasNoBuffer = 0;

  for (const linhaBruta of linhasBrutas) {
    if (!buffer) {
      const cartaoMatch = linhaBruta.match(CARTAO_RE);
      if (cartaoMatch) {
        cartaoAtual = cartaoMatch[2];
        continue;
      }
    }

    const candidata = buffer ? `${buffer} ${linhaBruta}` : linhaBruta;
    const txMatch = candidata.match(TX_RE);

    if (txMatch) {
      const [, dia, mesAbrev, , , descricaoBruta, parcela, sinal, valorTexto] = txMatch;
      const mes = MESES_ABREV[mesAbrev.toLowerCase()];
      buffer = "";
      linhasNoBuffer = 0;
      if (!mes) continue;

      const valor = parseFloat(valorTexto.replace(/\./g, "").replace(",", "."));
      if (Number.isNaN(valor) || valor === 0) continue;

      const ano = resolverAno(mes, mesReferencia, anoReferenciaNum);
      const descricaoLimpa = descricaoBruta.trim();
      const descricao = [
        descricaoLimpa,
        parcela ? `(Parcela ${parcela})` : null,
        cartaoAtual ? `(cartão final ${cartaoAtual})` : null,
      ].filter(Boolean).join(" ");

      resultado.push({
        data: `${ano}-${String(mes).padStart(2, "0")}-${dia.padStart(2, "0")}`,
        descricao,
        tipo: sinal ? "C" : "D",
        valor,
      });
      continue;
    }

    if (buffer || INICIO_TX_RE.test(linhaBruta)) {
      buffer = candidata;
      linhasNoBuffer++;
      if (linhasNoBuffer > MAX_LINHAS_ACUMULADAS) {
        buffer = "";
        linhasNoBuffer = 0;
      }
      continue;
    }
  }

  return resultado;
}
