/**
 * Parser da planilha "Comanda virtual" — o controle diário que a
 * recepção preenche em tempo real, item a item (cliente, terapia,
 * terapeuta, forma de pagamento), uma aba por dia (nome "DDMMYYYY").
 *
 * `parseLinhasComandaItem` (por aba já lida) é compartilhada com
 * server/googleSheets.ts: a carga histórica lê todas as abas de um
 * arquivo .xlsx baixado do Drive (esta função), o dia a dia sincroniza
 * uma aba por vez direto da API do Google Sheets — mesma estrutura de
 * coluna, fontes diferentes, sem duplicar a lógica de mapeamento.
 */

import * as XLSX from "xlsx";

export interface LinhaComandaItemImportada {
  data: string; // AAAA-MM-DD
  idLinha: number;
  cliente: string;
  aberturaResponsavel: string | null;
  visitasAnteriores: string | null;
  canalCaptacao: string | null;
  terapiaProduto: string | null;
  terapeuta: string | null;
  subtotal: number | null;
  desconto: number | null;
  motivoDesconto: string | null;
  total: number | null;
  dinheiro: number | null;
  pix: number | null;
  cartaoDebito: number | null;
  cartaoCredito: number | null;
  totalPagtos: number | null;
  observacao: string | null;
  fechamentoResponsavel: string | null;
  campoGerente: string | null;
}

function normalizarCabecalho(s: unknown): string {
  return (s ?? "").toString().toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// "--" é o placeholder do template pra campo vazio/não aplicável — não é
// dado real, mesmo numa linha já preenchida (ex.: canal de captação
// pode ficar "--" numa venda de cliente recorrente sem canal registrado
// de novo naquele dia).
function limparTexto(v: unknown): string | null {
  const s = (v ?? "").toString().trim();
  if (!s || s === "--") return null;
  return s;
}

function parseNumero(v: unknown): number | null {
  const s = (v ?? "").toString().trim();
  if (!s || s === "--") return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

const COLUNAS_ESPERADAS = {
  idLinha: ["id"],
  cliente: ["cliente"],
  aberturaResponsavel: ["abertura comanda (responsavel)"],
  visitasAnteriores: ["visitas anteriores na unidade (12 meses)"],
  canalCaptacao: ["canal de captacao"],
  // "descricao detalhada"/"tipo" são os nomes usados na 2ª seção da aba
  // ("Venda de Plano, Produtos e Voucher's") — mesmo papel descritivo de
  // terapia/produto e terapeuta na 1ª seção ("Serviços"), só com nomes
  // de coluna diferentes porque é uma venda, não um atendimento.
  terapiaProduto: ["terapia/produto", "descricao detalhada"],
  terapeuta: ["terapeuta", "tipo"],
  subtotal: ["subtotal"],
  desconto: ["descontos"],
  motivoDesconto: ["motivo desconto"],
  total: ["total"],
  dinheiro: ["dinheiro"],
  pix: ["pix"],
  cartaoDebito: ["cartao de debito"],
  cartaoCredito: ["cartao de credito"],
  totalPagtos: ["total pagtos"],
  observacao: ["observacao"],
  fechamentoResponsavel: ["fechamento comanda (responsavel)"],
  campoGerente: ["campo gerente: aperfeicoamento comercial / objecao cliente para plano"],
} as const satisfies Record<string, string[]>;

type Campo = keyof typeof COLUNAS_ESPERADAS;

/**
 * Converte o nome de uma aba "DDMMYYYY" pra data ISO — só as abas
 * diárias têm esse formato (Modelo/Tabela de preços/Parametros/etc.
 * ficam de fora naturalmente).
 */
export function nomeAbaParaData(nomeAba: string): string | null {
  const m = nomeAba.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// A aba tem 2 seções empilhadas na mesma planilha — "Serviços"
// (atendimentos) e "Venda de Plano, Produtos e Voucher's" — cada uma
// com seu próprio cabeçalho "ID/Cliente" e sua própria numeração de ID
// reiniciando em 1. Tratar a aba como uma sequência única (1 cabeçalho
// só) fazia "PPV id=1" colidir com "Serviços id=1" — mesma chave
// data+idLinha, um sobrescrevendo o outro no upsert. Achado real
// (2026-09-03): um atendimento pago em débito (Roberto, Serviços id=1)
// sumiu da Comanda porque uma venda de voucher (PPV id=1) tomou seu
// lugar. SECAO_OFFSET separa os espaços de numeração por seção
// (grande o bastante pra nunca colidir com o maior ID real de uma
// seção, e estável entre sincronizações — mesma linha sempre cai no
// mesmo idLinha final).
const SECAO_OFFSET = 100_000;

/**
 * Extrai os lançamentos de uma aba já lida (array de linhas cruas) —
 * usado tanto pela carga via .xlsx (uma aba por vez, várias abas por
 * arquivo) quanto pela sincronização via Google Sheets (uma aba por
 * chamada). Localiza cada cabeçalho por conteúdo (não é a linha 0 — a
 * planilha real tem título/meta do dia antes do cabeçalho de verdade,
 * e pode ter mais de um cabeçalho — ver SECAO_OFFSET acima).
 */
export function parseLinhasComandaItem(rows: unknown[][], data: string): LinhaComandaItemImportada[] {
  const indicesCabecalho: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const normalizados = rows[i].map(normalizarCabecalho);
    if (normalizados.includes("id") && normalizados.includes("cliente")) indicesCabecalho.push(i);
  }
  if (indicesCabecalho.length === 0) return [];

  const linhas: LinhaComandaItemImportada[] = [];
  for (let secao = 0; secao < indicesCabecalho.length; secao++) {
    const linhaHeaderIdx = indicesCabecalho[secao];
    const fimSecao = secao + 1 < indicesCabecalho.length ? indicesCabecalho[secao + 1] : rows.length;
    const offsetSecao = secao * SECAO_OFFSET;

    const header = rows[linhaHeaderIdx].map(normalizarCabecalho);
    const colIndex: Partial<Record<Campo, number>> = {};
    for (const campo of Object.keys(COLUNAS_ESPERADAS) as Campo[]) {
      const alternativas: readonly string[] = COLUNAS_ESPERADAS[campo];
      const idx = header.findIndex((h) => alternativas.includes(h));
      if (idx >= 0) colIndex[campo] = idx;
    }
    if (colIndex.idLinha === undefined || colIndex.cliente === undefined) continue;

    for (let i = linhaHeaderIdx + 1; i < fimSecao; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const idRaw = (row[colIndex.idLinha] ?? "").toString().trim();
      if (!idRaw) continue;
      const idLinhaOriginal = Number(idRaw);
      if (!Number.isFinite(idLinhaOriginal)) continue;

      const cliente = limparTexto(row[colIndex.cliente]);
      if (!cliente) continue; // linha de template (sem cliente = sem venda de verdade)

      const pega = (campo: Campo) => (colIndex[campo] !== undefined ? row[colIndex[campo] as number] : undefined);

      linhas.push({
        data,
        idLinha: offsetSecao + idLinhaOriginal,
        cliente,
        aberturaResponsavel: limparTexto(pega("aberturaResponsavel")),
        visitasAnteriores: limparTexto(pega("visitasAnteriores")),
        canalCaptacao: limparTexto(pega("canalCaptacao")),
        terapiaProduto: limparTexto(pega("terapiaProduto")),
        terapeuta: limparTexto(pega("terapeuta")),
        subtotal: parseNumero(pega("subtotal")),
        desconto: parseNumero(pega("desconto")),
        motivoDesconto: limparTexto(pega("motivoDesconto")),
        total: parseNumero(pega("total")),
        dinheiro: parseNumero(pega("dinheiro")),
        pix: parseNumero(pega("pix")),
        cartaoDebito: parseNumero(pega("cartaoDebito")),
        cartaoCredito: parseNumero(pega("cartaoCredito")),
        totalPagtos: parseNumero(pega("totalPagtos")),
        observacao: limparTexto(pega("observacao")),
        fechamentoResponsavel: limparTexto(pega("fechamentoResponsavel")),
        campoGerente: limparTexto(pega("campoGerente")),
      });
    }
  }
  return linhas;
}

/**
 * Varre TODAS as abas com nome "DDMMYYYY" do arquivo — carga histórica
 * de uma vez só, a partir do arquivo baixado do Drive (Modelo, Tabela
 * de preços, Parametros e cópias ficam de fora automaticamente, já que
 * seus nomes não batem o padrão de data).
 */
export function parseComandaVirtualXlsx(buffer: Buffer): LinhaComandaItemImportada[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const linhas: LinhaComandaItemImportada[] = [];
  for (const nomeAba of workbook.SheetNames) {
    const data = nomeAbaParaData(nomeAba);
    if (!data) continue;
    const sheet = workbook.Sheets[nomeAba];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
    linhas.push(...parseLinhasComandaItem(rows, data));
  }
  return linhas;
}
