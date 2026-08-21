import * as XLSX from "xlsx";

export interface LinhaPlanoBelleImportada {
  planoBelleId: number;
  clienteBelleId: number | null;
  clienteNome: string;
  pagadorNome: string | null;
  status: string;
  dataVenda: string | null;
  validade: string | null;
  valor: string | null;
  desconto: string | null;
  valorFinal: string | null;
  tipo: string | null;
  origem: string | null;
  campanha: string | null;
  vendedorNome: string | null;
}

export interface LinhaPlanoServicoBelleImportada {
  planoBelleId: number;
  servicoCodigo: number;
  servicoNome: string;
  sessoes: number;
  restantes: number;
  agendados: number;
}

export interface RelatorioPlanosBelleImportado {
  planos: LinhaPlanoBelleImportada[];
  servicos: LinhaPlanoServicoBelleImportada[];
}

export interface VinculoPlanoBelleImportado {
  planoBelleId: number;
  clienteBelleId: number;
  clienteNome: string;
}

function normalizar(valor: unknown): string {
  return (valor ?? "").toString().toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function texto(valor: unknown): string | null {
  const resultado = (valor ?? "").toString().trim();
  return resultado ? resultado : null;
}

function dataBr(valor: unknown): string | null {
  const resultado = texto(valor);
  const partes = resultado?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return partes ? `${partes[3]}-${partes[2]}-${partes[1]}` : null;
}

function inteiro(valor: unknown): number | null {
  const resultado = Number((valor ?? "").toString().trim());
  return Number.isFinite(resultado) ? resultado : null;
}

function idENome(valor: unknown): { id: number; nome: string } | null {
  const bruto = texto(valor);
  const partes = bruto?.match(/^\s*(\d+)\s*[-–]\s*(.+?)\s*$/);
  if (!partes) return null;
  const id = inteiro(partes[1]);
  return id && partes[2] ? { id, nome: partes[2].trim() } : null;
}

function decimalBr(valor: unknown): string | null {
  const bruto = texto(valor);
  if (!bruto) return null;
  const normalizado = bruto.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const resultado = Number(normalizado);
  return Number.isFinite(resultado) ? resultado.toFixed(2) : null;
}

/**
 * O Belle exporta cada plano como um cabeçalho seguido das linhas de serviços.
 * Este parser preserva os dois níveis e aceita arquivos XLS legados e XLSX.
 */
export function parsePlanosBelleXls(buffer: Buffer): RelatorioPlanosBelleImportado {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const abaNome = workbook.SheetNames[0];
  if (!abaNome) throw new Error("Planilha sem abas");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[abaNome], { header: 1, raw: false, defval: "" }) as unknown[][];

  const planos: LinhaPlanoBelleImportada[] = [];
  const servicos: LinhaPlanoServicoBelleImportada[] = [];
  let planoAtual: LinhaPlanoBelleImportada | null = null;

  for (let linha = 0; linha < rows.length; linha++) {
    const row = rows[linha];
    if (!row?.length) continue;
    const primeiro = normalizar(row[0]);
    const segundo = normalizar(row[1]);

    // Cabeçalho do resumo do plano: ID., Plano, Cliente, Pagador, Status...
    if ((primeiro === "id." || primeiro === "id") && segundo === "plano") {
      const proxima = rows[linha + 1] ?? [];
      const planoBelleId = inteiro(proxima[0]);
      const clienteNome = texto(proxima[2]);
      if (!planoBelleId || !clienteNome) {
        planoAtual = null;
        continue;
      }
      planoAtual = {
        planoBelleId,
        clienteBelleId: idENome(clienteNome)?.id ?? null,
        clienteNome,
        pagadorNome: texto(proxima[3]),
        status: texto(proxima[4]) ?? "Não informado",
        dataVenda: dataBr(proxima[5]),
        validade: dataBr(proxima[6]),
        valor: decimalBr(proxima[7]),
        desconto: decimalBr(proxima[8]),
        valorFinal: decimalBr(proxima[9]),
        tipo: texto(proxima[10]),
        origem: texto(proxima[12]),
        campanha: texto(proxima[13]),
        vendedorNome: texto(proxima[14]),
      };
      planos.push(planoAtual);
      linha++;
      continue;
    }

    // Cabeçalho da tabela de serviços: ID, Serviço, Sessões, Restantes...
    if (planoAtual && segundo === "id" && normalizar(row[2]) === "servico") continue;

    if (!planoAtual) continue;
    const servicoCodigo = inteiro(row[1]);
    const servicoNome = texto(row[2]);
    if (!servicoCodigo || !servicoNome) continue;
    servicos.push({
      planoBelleId: planoAtual.planoBelleId,
      servicoCodigo,
      servicoNome,
      sessoes: inteiro(row[7]) ?? 0,
      restantes: inteiro(row[8]) ?? 0,
      agendados: inteiro(row[9]) ?? 0,
    });
  }

  if (planos.length === 0) throw new Error("Nenhum plano válido foi encontrado no relatório.");
  return { planos, servicos };
}

/**
 * Lê relatórios tabulares em que o Belle traz explicitamente os pares
 * `clienteBelleId–nome` e `planoBelleId–nome`. Esses arquivos funcionam como
 * ponte de vínculo e não sobrescrevem saldo/sessões de um relatório completo.
 */
export function parseVinculosPlanosBelleXlsx(buffer: Buffer): VinculoPlanoBelleImportado[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const abaNome = workbook.SheetNames[0];
  if (!abaNome) throw new Error("Planilha sem abas");
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[abaNome], { header: 1, raw: false, defval: "" }) as unknown[][];
  const vinculados = new Map<string, VinculoPlanoBelleImportado>();

  for (const row of rows) {
    const primeiro = normalizar(row?.[0]);
    const segundo = normalizar(row?.[1]);
    const terceiro = normalizar(row?.[2]);
    if (!row?.length || primeiro.startsWith("total geral")) continue;

    const planoNaPrimeiraColuna = inteiro(row[0]);
    const clienteNaTerceiraColuna = idENome(row[2]);
    if (planoNaPrimeiraColuna && clienteNaTerceiraColuna && primeiro !== "id plano") {
      vinculados.set(`${planoNaPrimeiraColuna}:${clienteNaTerceiraColuna.id}`, {
        planoBelleId: planoNaPrimeiraColuna,
        clienteBelleId: clienteNaTerceiraColuna.id,
        clienteNome: clienteNaTerceiraColuna.nome,
      });
      continue;
    }

    const clienteNaPrimeiraColuna = idENome(row[0]);
    const planoNaTerceiraColuna = idENome(row[2]);
    if (clienteNaPrimeiraColuna && planoNaTerceiraColuna && segundo !== "data de venda" && terceiro !== "plano") {
      vinculados.set(`${planoNaTerceiraColuna.id}:${clienteNaPrimeiraColuna.id}`, {
        planoBelleId: planoNaTerceiraColuna.id,
        clienteBelleId: clienteNaPrimeiraColuna.id,
        clienteNome: clienteNaPrimeiraColuna.nome,
      });
    }
  }

  if (vinculados.size === 0) throw new Error("O arquivo não possui pares válidos de cliente e plano do Belle.");
  return [...vinculados.values()];
}
