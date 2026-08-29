import * as XLSX from "xlsx";

export interface LinhaRegistroFinanceiroBelleImportada {
  codigo: number;
  dataLancamento: string;
  clienteNome: string | null;
  valor: number;
  formaPagamento: string;
  observacao: string | null;
  // Extraído de observações no formato "Agendamento #NNNNN" — mesmo
  // espaço de ID de belle_atendimentos.atendimentoBelleId (confirmado
  // por amostragem 2026-08-29: 15/15 nomes batendo). Null pras outras
  // observações (Venda de Plano, Voucher, Pedido de Venda, Controle de
  // Vendas) — não referenciam um atendimento.
  atendimentoBelleId: number | null;
}

function normalizarCabecalho(valor: unknown): string {
  return (valor ?? "").toString().toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function limparTexto(valor: unknown): string | null {
  const texto = (valor ?? "").toString().trim();
  return texto ? texto : null;
}

function parseDataBr(valor: unknown): string | null {
  const texto = (valor ?? "").toString().trim();
  const partes = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return partes ? `${partes[3]}-${partes[2]}-${partes[1]}` : null;
}

function parseNumero(valor: unknown): number | null {
  const numero = Number((valor ?? "").toString().trim().replace(",", "."));
  return Number.isFinite(numero) ? numero : null;
}

function parseAtendimentoId(observacao: string | null): number | null {
  if (!observacao) return null;
  const match = observacao.match(/^Agendamento #(\d+)/);
  return match ? Number(match[1]) : null;
}

const COLUNAS = {
  codigo: ["cod."],
  dataLancamento: ["lcto."],
  clienteNome: ["cliente"],
  valor: ["valor"],
  formaPagamento: ["forma pagto."],
  observacao: ["observacao"],
} as const;

type Campo = keyof typeof COLUNAS;

/** Lê o relatório "Registros Financeiros" do Belle sem depender da linha do cabeçalho. */
export function parseRegistrosFinanceirosBelleXlsx(buffer: Buffer): LinhaRegistroFinanceiroBelleImportada[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const abaNome = workbook.SheetNames[0];
  if (!abaNome) throw new Error("Planilha sem abas");
  const sheet = workbook.Sheets[abaNome];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];

  const indiceCabecalho = rows.findIndex((row) => {
    const cabecalhos = row.map(normalizarCabecalho);
    return cabecalhos.includes("cod.") && cabecalhos.includes("valor") && cabecalhos.includes("forma pagto.");
  });
  if (indiceCabecalho < 0) {
    throw new Error('Não encontrei o cabeçalho com "Cód.", "Valor" e "Forma Pagto." no relatório financeiro do Belle.');
  }

  const cabecalhos = rows[indiceCabecalho].map(normalizarCabecalho);
  const indice: Partial<Record<Campo, number>> = {};
  for (const campo of Object.keys(COLUNAS) as Campo[]) {
    const posicao = cabecalhos.findIndex((cabecalho) => COLUNAS[campo].includes(cabecalho as never));
    if (posicao >= 0) indice[campo] = posicao;
  }
  for (const campo of ["codigo", "dataLancamento", "valor", "formaPagamento"] as Campo[]) {
    if (indice[campo] === undefined) throw new Error(`Coluna obrigatória ausente: ${campo}.`);
  }

  const ler = (row: unknown[], campo: Campo) => indice[campo] === undefined ? undefined : row[indice[campo] as number];
  const linhas: LinhaRegistroFinanceiroBelleImportada[] = [];
  for (let posicao = indiceCabecalho + 1; posicao < rows.length; posicao++) {
    const row = rows[posicao];
    if (!row?.length) continue;
    const codigo = parseNumero(ler(row, "codigo"));
    const dataLancamento = parseDataBr(ler(row, "dataLancamento"));
    const valor = parseNumero(ler(row, "valor"));
    const formaPagamento = limparTexto(ler(row, "formaPagamento"));
    if (!codigo || !dataLancamento || valor === null || !formaPagamento) continue;
    const observacao = limparTexto(ler(row, "observacao"));
    linhas.push({
      codigo,
      dataLancamento,
      clienteNome: limparTexto(ler(row, "clienteNome")),
      valor,
      formaPagamento,
      observacao,
      atendimentoBelleId: parseAtendimentoId(observacao),
    });
  }
  return linhas;
}
