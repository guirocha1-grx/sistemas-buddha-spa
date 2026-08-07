/**
 * googleSheets.ts
 * v1.2 — sincronização de Caixa Físico via Google Sheets API
 * Cliente de leitura para Google Sheets via Service Account.
 * Usado para sincronizar o Caixa Físico das planilhas das duas unidades.
 *
 * As planilhas têm layout diferente entre RBS e SSU, mas a estrutura
 * essencial é a mesma: Data | Entradas (Ocorrência + Valor) | Saídas
 * (Ocorrência + Valor) | Saldo | Conferido por.
 *
 * RBS: linha 0 = título, linha 1 = cabeçalho, linha 2 = sub-cabeçalho, dados começam na linha 3.
 * SSU: linha 0 = cabeçalho, linha 1 = sub-cabeçalho, dados começam na linha 2.
 *
 * IMPORTANTE: As planilhas têm linhas pré-preenchidas com datas futuras
 * (vazias, sem vendas reais). Filtramos apenas linhas com data <= hoje
 * e que tenham pelo menos uma ocorrência real (não "--" nem vazio).
 */

import { google } from "googleapis";
import { ENV } from "./_core/env";

export interface LinhaCaixaFisico {
  data: string; // AAAA-MM-DD
  tipoOperacao: "C" | "D";
  ocorrencia: string;
  valor: number;
  saldo: number | null;
  conferidoPor: string | null;
}

function getAuth() {
  if (!ENV.googleSheetsClientEmail || !ENV.googleSheetsPrivateKey) return null;
  return new google.auth.JWT({
    email: ENV.googleSheetsClientEmail,
    key: ENV.googleSheetsPrivateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

/**
 * Converte data DD/MM/AAAA para AAAA-MM-DD.
 */
function parseData(data: string): string {
  const m = data.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Parse de valor brasileiro: "1.101,00" -> 1101.00, "-1000,00" -> -1000.00
 * Também lida com valores vazios ("") retornando 0.
 */
function parseValor(valor: string): number {
  if (!valor || valor.trim() === "") return 0;
  const limpo = valor.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

/**
 * Retorna a data de hoje no formato AAAA-MM-DD.
 */
function hoje(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Lê TODOS os lançamentos de uma planilha de Caixa Físico desde uma data
 * mínima (default: 2025-12-01). Filtra linhas com datas futuras (pré-preenchidas
 * vazias na planilha) e linhas sem ocorrência real.
 *
 * @param spreadsheetId ID da planilha
 * @param aba Nome da aba (ex: "Caixa RBS", "Caixa SSU")
 * @param maxLinhas Número máximo de lançamentos a retornar (default 9999 = todos)
 * @param dataMinima Data mínima no formato AAAA-MM-DD (default: 2025-12-01)
 */
export async function lerCaixaFisicoSheet(
  spreadsheetId: string,
  aba: string,
  maxLinhas = 9999,
  dataMinima = "2025-12-01",
): Promise<LinhaCaixaFisico[]> {
  const auth = getAuth();
  if (!auth) throw new Error("Credenciais do Google Sheets não configuradas");

  const sheets = google.sheets({ version: "v4", auth });

  // Lê todas as linhas da planilha (A até J)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${aba}!A1:J`,
  });
  const rows = res.data.values || [];

  if (rows.length === 0) return [];

  // Detectar layout: RBS vs SSU
  const headerRow0 = rows[0] || [];
  const isSSU = headerRow0.some((c: string) => (c || "").toString().toLowerCase().trim() === "data numero");

  let dataCol: number;
  let entradaOcorCol: number;
  let entradaValorCol: number;
  let saidaOcorCol: number;
  let saidaValorCol: number;
  let saldoCol: number;
  let conferidoCol: number;
  let linhaInicio: number;

  if (isSSU) {
    // SSU: A=Data numero, B=Data, C=Ocorrência entrada, D=Valor entrada, E=Ocorrência saída, F=Valor saída, G=Saldo, H=Conciliado por
    dataCol = 1;
    entradaOcorCol = 2;
    entradaValorCol = 3;
    saidaOcorCol = 4;
    saidaValorCol = 5;
    saldoCol = 6;
    conferidoCol = 7;
    linhaInicio = 2;
  } else {
    // RBS: A=Data, B=Ocorrência entrada, C=Valor entrada, D=Ocorrência saída, E=Valor saída, F=Saldo, G=Conferido por
    dataCol = 0;
    entradaOcorCol = 1;
    entradaValorCol = 2;
    saidaOcorCol = 3;
    saidaValorCol = 4;
    saldoCol = 5;
    conferidoCol = 6;
    linhaInicio = 3;
  }

  const hojeStr = hoje();
  const linhas: LinhaCaixaFisico[] = [];

  for (let i = linhaInicio; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const dataRaw = (row[dataCol] || "").toString().trim();
    if (!dataRaw || !dataRaw.match(/^\d{2}\/\d{2}\/\d{4}$/)) continue;

    const data = parseData(dataRaw);
    if (!data) continue;

    // Filtrar datas futuras (planilha tem linhas pré-preenchidas vazias)
    if (data > hojeStr) continue;

    // Filtrar datas anteriores à data mínima
    if (data < dataMinima) continue;

    const entradaOcor = (row[entradaOcorCol] || "").toString().trim();
    const entradaValor = parseValor((row[entradaValorCol] || "").toString());
    const saidaOcor = (row[saidaOcorCol] || "").toString().trim();
    const saidaValorRaw = parseValor((row[saidaValorCol] || "").toString());
    const saldo = parseValor((row[saldoCol] || "").toString());
    const conferidoPor = (row[conferidoCol] || "").toString().trim() || null;

    let temLancamento = false;

    // Entrada (crédito)
    if (entradaOcor && entradaOcor !== "--" && entradaValor > 0) {
      linhas.push({
        data,
        tipoOperacao: "C",
        ocorrencia: entradaOcor,
        valor: entradaValor,
        saldo: saldo > 0 ? saldo : null,
        conferidoPor,
      });
      temLancamento = true;
    }

    // Saída (débito)
    if (saidaOcor && saidaOcor !== "--" && saidaValorRaw !== 0) {
      const valorSaida = Math.abs(saidaValorRaw);
      if (valorSaida > 0) {
        linhas.push({
          data,
          tipoOperacao: "D",
          ocorrencia: saidaOcor,
          valor: valorSaida,
          saldo: saldo > 0 ? saldo : null,
          conferidoPor,
        });
        temLancamento = true;
      }
    }

    // "Vendas do dia" com valor 0 também conta como lançamento (registra o dia)
    if (!temLancamento && entradaOcor === "Vendas do dia" && entradaValor === 0) {
      linhas.push({
        data,
        tipoOperacao: "C",
        ocorrencia: entradaOcor,
        valor: 0,
        saldo: saldo > 0 ? saldo : null,
        conferidoPor,
      });
    }
  }

  // Ordenar por data (mais recente primeiro) e limitar
  linhas.sort((a, b) => b.data.localeCompare(a.data));
  return linhas.slice(0, maxLinhas);
}

// IDs das planilhas de Caixa Físico (hardcoded — não mudam)
export const SPREADSHEET_IDS = {
  rbs: "1gwPXoDrGZ418u6K1EwK17eRUo7kZPv9x74cFYCEl4VY",
  ssu: "1i8TcGrPXxV8hAplwuadlSPVwZ-ooyNNUoB7wi1REZHk",
};

export const SPREADSHEET_ABAS = {
  rbs: "Caixa RBS",
  ssu: "Caixa SSU",
};
