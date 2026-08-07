/**
 * googleSheets.ts
 * v1.1 — sincronização de Caixa Físico via Google Sheets API
 * Cliente de leitura para Google Sheets via Service Account.
 * Usado para sincronizar o Caixa Físico das planilhas das duas unidades.
 *
 * As planilhas têm layout diferente entre RBS e SSU, mas a estrutura
 * essencial é a mesma: Data | Entradas (Ocorrência + Valor) | Saídas
 * (Ocorrência + Valor) | Saldo | Conferido por.
 *
 * RBS: linha 0 = título, linha 1 = cabeçalho, dados começam na linha 2.
 * SSU: linha 0 = cabeçalho, linha 1 = sub-cabeçalho, dados começam na linha 2.
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
 */
function parseValor(valor: string): number {
  if (!valor) return 0;
  const limpo = valor.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

/**
 * Lê os últimos N lançamentos de uma planilha de Caixa Físico.
 * spreadsheetId: ID da planilha
 * aba: nome da aba (ex: "Caixa RBS", "Caixa SSU")
 * maxLinhas: número máximo de lançamentos a retornar (default 60)
 */
export async function lerCaixaFisicoSheet(
  spreadsheetId: string,
  aba: string,
  maxLinhas = 60,
): Promise<LinhaCaixaFisico[]> {
  const auth = getAuth();
  if (!auth) throw new Error("Credenciais do Google Sheets não configuradas");

  const sheets = google.sheets({ version: "v4", auth });

  // Lê só a coluna A pra saber quantas linhas a planilha tem (leve e
  // rápido) — o livro-caixa cresce com lançamentos novos adicionados
  // EMBAIXO com o tempo, então uma leitura fixa das primeiras ~70
  // linhas (como era antes) só pega dado antigo do início da planilha
  // depois de alguns meses de uso, nunca os lançamentos recentes.
  const colA = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${aba}!A:A` });
  const totalLinhas = (colA.data.values || []).length;

  // Cabeçalho fica sempre no início — lê separado, independente de
  // onde a "cauda" (dados recentes) começa.
  const cabecalhoRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${aba}!A1:T5` });
  const linhasCabecalho = cabecalhoRes.data.values || [];

  // Cauda: margem de 3x maxLinhas (cada linha pode virar até 2
  // lançamentos — entrada e saída no mesmo dia) + 20 de folga.
  const linhaInicio = Math.max(1, totalLinhas - (maxLinhas * 3 + 20));
  const range = `${aba}!A${linhaInicio}:T${totalLinhas}`;
  const res = totalLinhas > 0
    ? await sheets.spreadsheets.values.get({ spreadsheetId, range })
    : { data: { values: [] } };
  const rows = res.data.values || [];
  // Se a cauda já inclui o cabeçalho (planilha pequena), pula essas
  // linhas — senão processa tudo, já que aqui não tem cabeçalho.
  const linhasParaPular = linhaInicio <= 2 ? (2 - linhaInicio + 1) : 0;

  const linhas: LinhaCaixaFisico[] = [];

  // Detectar a coluna de data baseada no cabeçalho
  // RBS: coluna A (index 0) = "Data"
  // SSU: coluna B (index 1) = "Data" (coluna A = "Data numero")
  let dataCol = 0;
  let entradaOcorCol = 1;
  let entradaValorCol = 2;
  let saidaOcorCol = 3;
  let saidaValorCol = 4;
  let saldoCol = 5;
  let conferidoCol = 6;

  // Procurar a linha de cabeçalho para identificar colunas
  for (let i = 0; i < linhasCabecalho.length; i++) {
    const row = linhasCabecalho[i];
    if (!row) continue;
    for (let j = 0; j < row.length; j++) {
      const val = (row[j] || "").toString().toLowerCase().trim();
      if (val === "data" && dataCol === 0) dataCol = j;
      if (val === "data numero") dataCol = j;
    }
  }

  // SSU tem "Data" na coluna B (index 1), RBS tem "Data" na coluna A (index 0)
  // Detectar: se a coluna A do cabeçalho for "Data numero", então dataCol = 1
  const headerRow = linhasCabecalho.find((r) => r && r.some((c) => (c || "").toString().toLowerCase().trim() === "data numero"));
  if (headerRow) {
    dataCol = headerRow.findIndex((c) => (c || "").toString().toLowerCase().trim() === "data");
    // SSU layout: A=Data numero, B=Data, C=Ocorrência entrada, D=Valor entrada, E=Ocorrência saída, F=Valor saída, G=Saldo, H=Conciliado por
    entradaOcorCol = dataCol + 1;
    entradaValorCol = dataCol + 2;
    saidaOcorCol = dataCol + 3;
    saidaValorCol = dataCol + 4;
    saldoCol = dataCol + 5;
    conferidoCol = dataCol + 6;
  }

  // Processar linhas de dados. `rows` já é a cauda da planilha (lida a
  // partir de linhaInicio) — só pula cabeçalho se a cauda calculada
  // acabou incluindo essas linhas (planilha pequena, poucos dados).
  for (let i = linhasParaPular; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const dataRaw = (row[dataCol] || "").toString().trim();
    if (!dataRaw || !dataRaw.match(/^\d{2}\/\d{2}\/\d{4}$/)) continue;

    const data = parseData(dataRaw);
    if (!data) continue;

    const entradaOcor = (row[entradaOcorCol] || "").toString().trim();
    const entradaValor = parseValor((row[entradaValorCol] || "").toString());
    const saidaOcor = (row[saidaOcorCol] || "").toString().trim();
    const saidaValorRaw = parseValor((row[saidaValorCol] || "").toString());
    const saldo = parseValor((row[saldoCol] || "").toString());
    const conferidoPor = (row[conferidoCol] || "").toString().trim() || null;

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
      }
    }

    // "Vendas do dia" com valor 0 também conta como lançamento (registra o dia)
    if (entradaOcor === "Vendas do dia" && entradaValor === 0 && saidaOcor === "--" && saidaValorRaw === 0) {
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

  // Retornar os últimos maxLinhas lançamentos
  return linhas.slice(-maxLinhas);
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
