/**
 * Parser do "Extrato completo" em PDF do Banco Inter (o mesmo modelo
 * exportado pelo próprio app/site do Inter — cabeçalho "Saldo do dia",
 * linhas "Tipo: "descrição" valor saldo").
 *
 * O texto vem em linhas soltas (sem tabela real no PDF), então o parser
 * caminha linha a linha guardando a data corrente: toda linha de
 * cabeçalho de dia atualiza a data; toda linha de transação usa a data
 * mais recente vista. Descrições longas às vezes quebram em 2-3 linhas
 * no meio do PDF (a aspa de fechamento e os valores acabam em linhas
 * separadas) — por isso o parser acumula linhas até fechar uma
 * transação válida, em vez de exigir tudo numa linha só.
 */

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

// "1 de Julho de 2025 Saldo do dia: R$ 24.710,34 ..." — sem âncora no
// início: o cabeçalho de coluna "Valor Saldo por transação" às vezes cola
// antes da primeira data do PDF (varia entre extratores de texto), então
// buscamos o padrão em qualquer posição da linha em vez de exigir que
// comece nela.
const DIA_RE = /(\d{1,2})\s+de\s+([a-zA-ZÀ-ÿ]+)\s+de\s+(\d{4})\s+Saldo do dia:/i;

// 'Pix recebido: "Cp :90400888-DAIANA DE SOUZA SILVA" R$ 215,00 R$ 22.754,15'
const TX_RE = /(.+?):\s*"(.*)"\s*(-?R\$\s?[\d.,]+)\s+(-?R\$\s?[\d.,]+)/;

// Detecta o início de uma linha de transação ("Tipo: "...) mesmo sem o
// resto ainda ter chegado — usado só para decidir se vale a pena começar
// a acumular linhas seguintes.
const INICIO_TX_RE = /^.+?:\s*"/;

const MAX_LINHAS_ACUMULADAS = 4;

export interface LinhaExtratoPdf {
  data: string; // AAAA-MM-DD
  descricao: string;
  tipo: "C" | "D";
  valor: number;
}

function parseValorReais(raw: string): number {
  const limpo = raw.trim().replace(/^-?R\$\s?/, "").replace(/\./g, "").replace(",", ".");
  const negativo = raw.trim().startsWith("-");
  const n = parseFloat(limpo);
  return negativo ? -n : n;
}

export function parseExtratoInterPdf(texto: string): LinhaExtratoPdf[] {
  const linhasBrutas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const resultado: LinhaExtratoPdf[] = [];
  let dataAtual: string | null = null;
  let buffer = "";
  let linhasNoBuffer = 0;

  for (const linhaBruta of linhasBrutas) {
    if (!buffer) {
      const diaMatch = linhaBruta.match(DIA_RE);
      if (diaMatch) {
        const [, dia, mesNome, ano] = diaMatch;
        const mes = MESES[mesNome.toLowerCase()];
        if (mes) {
          dataAtual = `${ano}-${String(mes).padStart(2, "0")}-${dia.padStart(2, "0")}`;
        }
        continue;
      }
    }

    const candidata = buffer ? `${buffer} ${linhaBruta}` : linhaBruta;
    const txMatch = candidata.match(TX_RE);

    if (txMatch && dataAtual) {
      const [, , descricao, valorStr] = txMatch;
      const valor = parseValorReais(valorStr);
      buffer = "";
      linhasNoBuffer = 0;
      if (valor === 0 || Number.isNaN(valor)) continue;
      resultado.push({
        data: dataAtual,
        descricao: descricao.trim() || "(sem descrição)",
        tipo: valor >= 0 ? "C" : "D",
        valor: Math.abs(valor),
      });
      continue;
    }

    if (buffer || INICIO_TX_RE.test(linhaBruta)) {
      buffer = candidata;
      linhasNoBuffer++;
      if (linhasNoBuffer > MAX_LINHAS_ACUMULADAS) {
        // Não fechou depois de várias linhas — desiste pra não arrastar
        // lixo indefinidamente (linha provavelmente é boilerplate).
        buffer = "";
        linhasNoBuffer = 0;
      }
      continue;
    }

    // Linha solta (cabeçalho, rodapé, boilerplate) — ignora.
  }

  return resultado;
}
