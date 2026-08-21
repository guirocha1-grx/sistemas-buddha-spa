import * as XLSX from "xlsx";

export interface LinhaAtendimentoBelleImportada {
  atendimentoBelleId: number;
  clienteNome: string;
  telefone: string | null;
  dataAtendimento: string;
  horario: string | null;
  servicoCodigo: number | null;
  servicoNome: string | null;
  duracaoMinutos: number | null;
  profissionalNome: string | null;
  temPreferencia: boolean;
  planoBelleId: number | null;
  areaAplicacao: string | null;
  tipo: string | null;
  status: string;
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
  const numero = Number((valor ?? "").toString().trim());
  return Number.isFinite(numero) ? numero : null;
}

function parseServico(valor: unknown): { codigo: number | null; nome: string | null } {
  const texto = limparTexto(valor);
  if (!texto) return { codigo: null, nome: null };
  const partes = texto.match(/^(\d+)\s*-\s*(.+)$/);
  return partes
    ? { codigo: Number(partes[1]), nome: partes[2].trim() || null }
    : { codigo: null, nome: texto };
}

const COLUNAS = {
  atendimentoBelleId: ["id"],
  dataAtendimento: ["data"],
  horario: ["horario"],
  clienteNome: ["cliente"],
  servico: ["servico"],
  duracaoMinutos: ["tempo"],
  profissionalNome: ["profissional"],
  temPreferencia: ["tem preferencia"],
  planoBelleId: ["plano"],
  areaAplicacao: ["area/aplicacao"],
  tipo: ["tipo"],
  status: ["status"],
  telefone: ["celular"],
} as const;

type Campo = keyof typeof COLUNAS;

/** Lê uma exportação do relatório de atendimentos sem depender da linha do cabeçalho. */
export function parseAtendimentosBelleXlsx(buffer: Buffer): LinhaAtendimentoBelleImportada[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const abaNome = workbook.SheetNames[0];
  if (!abaNome) throw new Error("Planilha sem abas");
  const sheet = workbook.Sheets[abaNome];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];

  const indiceCabecalho = rows.findIndex((row) => {
    const cabecalhos = row.map(normalizarCabecalho);
    return cabecalhos.includes("id") && cabecalhos.includes("cliente") && cabecalhos.includes("status");
  });
  if (indiceCabecalho < 0) {
    throw new Error('Não encontrei o cabeçalho com "ID", "Cliente" e "Status" no relatório de atendimentos.');
  }

  const cabecalhos = rows[indiceCabecalho].map(normalizarCabecalho);
  const indice: Partial<Record<Campo, number>> = {};
  for (const campo of Object.keys(COLUNAS) as Campo[]) {
    const posicao = cabecalhos.findIndex((cabecalho) => COLUNAS[campo].includes(cabecalho as never));
    if (posicao >= 0) indice[campo] = posicao;
  }
  for (const campo of ["atendimentoBelleId", "dataAtendimento", "clienteNome", "status"] as Campo[]) {
    if (indice[campo] === undefined) throw new Error(`Coluna obrigatória ausente: ${campo}.`);
  }

  const ler = (row: unknown[], campo: Campo) => indice[campo] === undefined ? undefined : row[indice[campo] as number];
  const linhas: LinhaAtendimentoBelleImportada[] = [];
  for (let posicao = indiceCabecalho + 1; posicao < rows.length; posicao++) {
    const row = rows[posicao];
    if (!row?.length) continue;
    const atendimentoBelleId = parseNumero(ler(row, "atendimentoBelleId"));
    const clienteNome = limparTexto(ler(row, "clienteNome"));
    const dataAtendimento = parseDataBr(ler(row, "dataAtendimento"));
    const status = limparTexto(ler(row, "status"));
    if (!atendimentoBelleId || !clienteNome || !dataAtendimento || !status) continue;
    const servico = parseServico(ler(row, "servico"));
    const plano = parseNumero(ler(row, "planoBelleId"));
    linhas.push({
      atendimentoBelleId,
      clienteNome,
      telefone: limparTexto(ler(row, "telefone")),
      dataAtendimento,
      horario: limparTexto(ler(row, "horario")),
      servicoCodigo: servico.codigo,
      servicoNome: servico.nome,
      duracaoMinutos: parseNumero(ler(row, "duracaoMinutos")),
      profissionalNome: limparTexto(ler(row, "profissionalNome")),
      temPreferencia: normalizarCabecalho(ler(row, "temPreferencia")) === "sim",
      planoBelleId: plano && plano > 0 ? plano : null,
      areaAplicacao: limparTexto(ler(row, "areaAplicacao")),
      tipo: limparTexto(ler(row, "tipo")),
      status,
    });
  }
  return linhas;
}
