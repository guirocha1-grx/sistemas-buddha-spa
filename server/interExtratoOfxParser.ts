/**
 * Parser de extrato em OFX (Open Financial Exchange) — formato de
 * exportação padrão de praticamente todo banco, incluindo o Inter
 * ("Extrato → Exportar → OFX"). Muito mais confiável que CSV/PDF porque
 * é dado estruturado com ID de transação garantido pelo próprio banco
 * (FITID), então o dedup aqui não depende de hash sintético.
 *
 * OFX 1.x (o mais comum nos bancos brasileiros) é SGML, não XML — as
 * tags normalmente não têm fechamento (`<TRNAMT>2800.00` sem
 * `</TRNAMT>`). OFX 2.x é XML de verdade e tem fechamento. O parser
 * abaixo lida com os dois: extrai o bloco de cada `<STMTTRN>` até a
 * próxima ocorrência de `<STMTTRN>`/`</BANKTRANLIST>`/`</STMTTRN>` (o
 * que vier primeiro) e lê os campos dentro dele por regex de tag,
 * então não depende de a tag estar fechada.
 */

export interface LinhaExtratoOfx {
  fitid: string;
  data: string; // AAAA-MM-DD
  descricao: string;
  tipo: "C" | "D";
  valor: number;
}

function extrairCampo(bloco: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>\\s*([^\\r\\n<]*)`, "i");
  const m = bloco.match(re);
  return m ? m[1].trim() : null;
}

function parseDataOfx(raw: string): string | null {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseValorOfx(raw: string): number {
  const limpo = raw.trim().includes(",") && !raw.includes(".")
    ? raw.trim().replace(",", ".")
    : raw.trim();
  return parseFloat(limpo);
}

export function parseExtratoOfx(texto: string): LinhaExtratoOfx[] {
  const resultado: LinhaExtratoOfx[] = [];
  const marcadorAbertura = /<STMTTRN>/gi;
  let match: RegExpExecArray | null;

  while ((match = marcadorAbertura.exec(texto)) !== null) {
    const inicio = match.index + match[0].length;
    const restante = texto.slice(inicio);
    const fimRelativo = restante.search(/<STMTTRN>|<\/STMTTRN>|<\/BANKTRANLIST>/i);
    const bloco = fimRelativo === -1 ? restante : restante.slice(0, fimRelativo);

    const fitid = extrairCampo(bloco, "FITID");
    const dtPosted = extrairCampo(bloco, "DTPOSTED");
    const trnAmt = extrairCampo(bloco, "TRNAMT");
    const memo = extrairCampo(bloco, "MEMO") ?? extrairCampo(bloco, "NAME") ?? extrairCampo(bloco, "TRNTYPE");

    if (!fitid || !dtPosted || !trnAmt) continue;

    const data = parseDataOfx(dtPosted);
    const valor = parseValorOfx(trnAmt);
    if (!data || Number.isNaN(valor) || valor === 0) continue;

    resultado.push({
      fitid,
      data,
      descricao: memo?.trim() || "(sem descrição)",
      tipo: valor >= 0 ? "C" : "D",
      valor: Math.abs(valor),
    });
  }

  return resultado;
}
