import * as XLSX from "xlsx";

export interface LinhaRegistroFinanceiroBelleImportada {
  codigo: number;
  dataVencimento: string;
  clienteNome: string | null;
  valor: number;
  // true quando "Recebido" veio zerado — valor é o "Valor" contratado
  // (fallback, a parcela tem Vcto real), não o confirmado.
  pendenteConfirmacao: boolean;
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
  // "Vcto." (vencimento) é o dia que o dinheiro de fato entrou — "Lcto."
  // (lançamento) é só quando foi digitado no Belle, que diverge do
  // vencimento sempre que a venda precisa ser reaberta pra correção dias
  // depois (2026-08-29, esclarecido pelo usuário após conferir contra o
  // "vencimentos" do Belle: R$7.278,70 nos vencimentos de 01/08 vs
  // R$6.842,00 se agrupado por Lcto — a diferença é dinheiro cujo
  // lançamento foi corrigido/reaberto em outro dia).
  dataVencimento: ["vcto."],
  clienteNome: ["cliente"],
  valor: ["valor"],
  // "Recebido" é o que de fato já entrou daquela parcela — usado como
  // valor da linha quando > 0 (confirmado com o usuário, 2026-09-01:
  // soma de "Recebido" por Vcto bate com o fechamento da Comanda).
  // Quando vem zerado (cartão ainda não liquidado, por exemplo), cai
  // pro "Valor" contratado como fallback, já que a parcela tem um Vcto
  // real — só marca como pendente de confirmação, não exclui a linha.
  recebido: ["recebido"],
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
  for (const campo of ["codigo", "dataVencimento", "valor", "formaPagamento"] as Campo[]) {
    if (indice[campo] === undefined) throw new Error(`Coluna obrigatória ausente: ${campo}.`);
  }

  const ler = (row: unknown[], campo: Campo) => indice[campo] === undefined ? undefined : row[indice[campo] as number];
  const linhas: LinhaRegistroFinanceiroBelleImportada[] = [];
  for (let posicao = indiceCabecalho + 1; posicao < rows.length; posicao++) {
    const row = rows[posicao];
    if (!row?.length) continue;
    const codigo = parseNumero(ler(row, "codigo"));
    const dataVencimento = parseDataBr(ler(row, "dataVencimento"));
    const valorContratado = parseNumero(ler(row, "valor"));
    const formaPagamento = limparTexto(ler(row, "formaPagamento"));
    if (!codigo || !dataVencimento || valorContratado === null || !formaPagamento) continue;
    const recebido = parseNumero(ler(row, "recebido"));
    const pendenteConfirmacao = !(recebido !== null && recebido > 0);
    const observacao = limparTexto(ler(row, "observacao"));
    linhas.push({
      codigo,
      dataVencimento,
      clienteNome: limparTexto(ler(row, "clienteNome")),
      valor: pendenteConfirmacao ? valorContratado : (recebido as number),
      pendenteConfirmacao,
      formaPagamento,
      observacao,
      atendimentoBelleId: parseAtendimentoId(observacao),
    });
  }
  return linhas;
}
