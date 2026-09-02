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
import { parseLinhasComandaItem, type LinhaComandaItemImportada } from "./comandaVirtualXlsxParser";

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
    // Escopo de escrita (não só .readonly) — necessário desde que
    // escreverContasBancariasSheet passou a gravar de volta na planilha
    // "Consolidado comanda" (2026-08-08).
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
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

// ===== Consolidado comanda (conciliação semanal de caixa) =====

export interface LinhaComandaDiaria {
  data: string; // AAAA-MM-DD
  dinheiro: number;
  cartaoDebito: number;
  cartaoCredito: number;
  pix: number;
}

// IDs das planilhas "Consolidado comanda" (hardcoded — não mudam)
export const SPREADSHEET_IDS_COMANDA = {
  rbs: "1X1ar_a-4ciO2xaDfOoxmTj5NxB3VUrj_R77-HkVYN3k",
  ssu: "17DcgOWxBvllF2LtLOrRHE63C5uCHk5AalNWmz182RL4",
};

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function nomeAbaComanda(unidadeSlug: "rbs" | "ssu", ano: number, mes: number): string {
  const prefixo = unidadeSlug === "rbs" ? "RBS" : "SSU";
  return `${prefixo} ${MESES_ABREV[mes - 1]}.${String(ano).slice(-2)}`;
}

function normalizarRotulo(s: unknown): string {
  return (s || "").toString().toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Acha a linha (índice 0-based) de um rótulo específico ("Dinheiro",
 * "Cartão de débito"...) dentro da seção "Comanda (Recepção)" da
 * planilha — a mesma expectativa por posição do usuário (linhas 3-7,
 * índices 2-6), com um fallback tolerante caso a planilha mude uma
 * linha, pra não quebrar silenciosamente lendo o valor errado.
 */
function acharLinhaComanda(rows: unknown[][], idxEsperado: number, ...substrings: string[]): number {
  const rotuloEsperado = normalizarRotulo((rows[idxEsperado] as unknown[])?.[2]);
  if (substrings.some((s) => rotuloEsperado.includes(s))) return idxEsperado;
  const achado = rows.slice(0, 8).findIndex((r) => substrings.some((s) => normalizarRotulo(r[2]).includes(s)));
  if (achado < 0) throw new Error(`Linha "${substrings[0]}" não encontrada na seção Comanda (Recepção)`);
  return achado;
}

/**
 * Lê a "Comanda (Recepção)" por dia de uma aba mensal da planilha
 * "Consolidado comanda" (uma aba por mês, ex: "SSU Ago.26"). O
 * cabeçalho de datas e as linhas Dinheiro/Débito/Crédito/Pix são
 * localizados por conteúdo, não só por posição fixa.
 */
export async function lerComandaConsolidadoSheet(
  spreadsheetId: string,
  unidadeSlug: "rbs" | "ssu",
  ano: number,
  mes: number,
): Promise<LinhaComandaDiaria[]> {
  const auth = getAuth();
  if (!auth) throw new Error("Credenciais do Google Sheets não configuradas");

  const sheets = google.sheets({ version: "v4", auth });
  const aba = nomeAbaComanda(unidadeSlug, ano, mes);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${aba}'!A1:AH20`,
  });
  const rows = res.data.values || [];
  if (rows.length === 0) return [];

  const linhaHeader = rows.findIndex((r) => r.some((c) => /^\d{2}\/\d{2}\/\d{4}$/.test((c || "").toString().trim())));
  if (linhaHeader < 0) throw new Error(`Não achei o cabeçalho de datas na aba "${aba}"`);

  const linhaDinheiro = acharLinhaComanda(rows, linhaHeader + 2, "dinheiro");
  const linhaDebito = acharLinhaComanda(rows, linhaHeader + 3, "debito");
  const linhaCredito = acharLinhaComanda(rows, linhaHeader + 4, "credito");
  const linhaPix = acharLinhaComanda(rows, linhaHeader + 5, "pix");

  const header = rows[linhaHeader];
  const linhas: LinhaComandaDiaria[] = [];
  for (let col = 0; col < header.length; col++) {
    const dataRaw = (header[col] || "").toString().trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dataRaw)) continue;
    const data = parseData(dataRaw);
    if (!data) continue;
    linhas.push({
      data,
      dinheiro: parseValor((rows[linhaDinheiro]?.[col] || "").toString()),
      cartaoDebito: parseValor((rows[linhaDebito]?.[col] || "").toString()),
      cartaoCredito: parseValor((rows[linhaCredito]?.[col] || "").toString()),
      pix: parseValor((rows[linhaPix]?.[col] || "").toString()),
    });
  }
  return linhas;
}

export interface LinhaContasBancariasParaSheet {
  data: string; // AAAA-MM-DD
  cartaoDebito: number;
  cartaoCredito: number;
  pix: number;
  // Texto de conciliação (server/shared/conciliacao.ts) pro dia, ou null
  // quando não há diferença — nesse caso a célula é limpa (string vazia)
  // em vez de mantida com um texto antigo já resolvido.
  textoConciliacao: string | null;
}

// Linhas fixas (número da linha da planilha, 1-indexado, igual aparece
// na UI do Google Sheets) onde o bloco "Contas bancárias" — o que
// realmente entrou, calculado por este sistema — é escrito de volta.
// Confirmado pelo usuário em 2026-08-08. Dinheiro não tem linha aqui:
// sua fonte já É o Caixa Físico, escrever de volta seria circular.
const LINHA_DEBITO_BANCO = 10;
const LINHA_CREDITO_BANCO = 11;
const LINHA_PIX_BANCO = 12;

// Linha reservada pra conciliação automática (Comanda x Contas), uma
// célula por dia com problema — confirmado pelo usuário em 2026-08-09.
// Some sozinha (célula limpa) quando a recepção corrige e a diferença
// zera, porque essa função roda de novo a cada "Sincronizar com Drive".
const LINHA_CONCILIACAO = 20;

function colunaParaLetra(indiceZeroBased: number): string {
  let n = indiceZeroBased + 1;
  let letra = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letra = String.fromCharCode(65 + resto) + letra;
    n = Math.floor((n - 1) / 26);
  }
  return letra;
}

/**
 * Escreve de volta na planilha "Consolidado comanda" o que este sistema
 * calcula como "Contas bancárias" (ver server/db.ts:
 * detalheContasBancariasPorDia) — linhas 10/11/12, mesma aba mensal e
 * mesmas colunas de data já usadas pela leitura da seção "Comanda
 * (Recepção)" acima. Datas fora do cabeçalho da aba são ignoradas
 * silenciosamente (não lança erro — só significa que aquele dia ainda
 * não tem coluna na planilha, ex.: mês seguinte).
 */
export async function escreverContasBancariasSheet(
  spreadsheetId: string,
  unidadeSlug: "rbs" | "ssu",
  ano: number,
  mes: number,
  linhas: LinhaContasBancariasParaSheet[],
): Promise<number> {
  const auth = getAuth();
  if (!auth) throw new Error("Credenciais do Google Sheets não configuradas");

  const sheets = google.sheets({ version: "v4", auth });
  const aba = nomeAbaComanda(unidadeSlug, ano, mes);

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${aba}'!A1:AH20`,
  });
  const rows = res.data.values || [];
  if (rows.length === 0) throw new Error(`Aba "${aba}" está vazia`);

  const linhaHeader = rows.findIndex((r) => r.some((c) => /^\d{2}\/\d{2}\/\d{4}$/.test((c || "").toString().trim())));
  if (linhaHeader < 0) throw new Error(`Não achei o cabeçalho de datas na aba "${aba}"`);
  const header = rows[linhaHeader];

  const colPorData = new Map<string, number>();
  for (let col = 0; col < header.length; col++) {
    const dataRaw = (header[col] || "").toString().trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dataRaw)) continue;
    const data = parseData(dataRaw);
    if (data) colPorData.set(data, col);
  }

  const data: { range: string; values: (string | number)[][] }[] = [];
  let colunasEscritas = 0;
  for (const linha of linhas) {
    const col = colPorData.get(linha.data);
    if (col === undefined) continue;
    const colunaLetra = colunaParaLetra(col);
    data.push(
      { range: `'${aba}'!${colunaLetra}${LINHA_DEBITO_BANCO}`, values: [[linha.cartaoDebito]] },
      { range: `'${aba}'!${colunaLetra}${LINHA_CREDITO_BANCO}`, values: [[linha.cartaoCredito]] },
      { range: `'${aba}'!${colunaLetra}${LINHA_PIX_BANCO}`, values: [[linha.pix]] },
      { range: `'${aba}'!${colunaLetra}${LINHA_CONCILIACAO}`, values: [[linha.textoConciliacao ?? ""]] },
    );
    colunasEscritas++;
  }
  if (data.length === 0) return 0;

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "USER_ENTERED", data },
  });

  return colunasEscritas;
}

// ===== Informe de vendas (planilha "mãe", substitui a escrita na antiga
// "Consolidado comanda" a partir de 2026-09-02) =====

// IDs das planilhas "Informe de vendas" (RBS/SSU) — confirmado pelo
// usuário em 2026-09-02.
export const SPREADSHEET_IDS_INFORME_VENDAS = {
  rbs: "16UYudMzhWvyPXUOO1essJkSoQ9H-vBrj_HkNiS5jTHc",
  ssu: "1_6KBtnAS0icqmOe75KMC-76TJINMMMIuvz_Ltnj7GtQ",
};

// Diferente de nomeAbaComanda: aqui não tem prefixo SSU/RBS, cada
// unidade já tem sua própria planilha — só "Ago.26", "Set.26" etc.
function nomeAbaInformeVendas(ano: number, mes: number): string {
  return `${MESES_ABREV[mes - 1]}.${String(ano).slice(-2)}`;
}

// Linhas fixas na planilha "Informe de vendas" — confirmado pelo usuário
// em 2026-09-02 com print da estrutura real. Linha 46 e 52 ("Total de
// pagamentos") são fórmulas da própria planilha, nunca escritas por
// aqui. Linha 48 (Dinheiro em "Contas bancárias") também não é escrita:
// mesma lógica de antes, a fonte já é o Caixa Físico, seria circular.
const LINHA_BELLE_DINHEIRO = 42;
const LINHA_BELLE_DEBITO = 43;
const LINHA_BELLE_CREDITO = 44;
const LINHA_BELLE_PIX = 45;
const LINHA_CONTAS_DEBITO = 49;
const LINHA_CONTAS_CREDITO = 50;
const LINHA_CONTAS_PIX = 51;

const RANGE_INFORME_VENDAS = "A1:AH55";

/**
 * Garante que a aba do mês pedido existe na planilha "Informe de
 * vendas", clonando a aba do mês anterior quando ainda não existe
 * (mesmo formato de nome, ex. "Set.26"). Ajusta D1 pro primeiro dia do
 * mês novo (as demais datas do cabeçalho são fórmula em cima de D1,
 * conforme a estrutura já existente na planilha) e limpa as faixas de
 * valores que essa sincronização escreve (D42:AH45 e D49:AH51) — o
 * resto (fórmulas de total, seções não tocadas por este sistema)
 * continua como veio da cópia. Idempotente: se a aba já existe, só
 * retorna o nome, sem tocar em nada.
 */
async function garantirAbaInformeVendas(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  ano: number,
  mes: number,
): Promise<string> {
  const abaAlvo = nomeAbaInformeVendas(ano, mes);
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const abas = meta.data.sheets || [];
  if (abas.some((s) => s.properties?.title === abaAlvo)) return abaAlvo;

  const anoAnterior = mes === 1 ? ano - 1 : ano;
  const mesAnterior = mes === 1 ? 12 : mes - 1;
  const nomeAbaAnterior = nomeAbaInformeVendas(anoAnterior, mesAnterior);
  const abaAnterior = abas.find((s) => s.properties?.title === nomeAbaAnterior);
  const sheetIdAnterior = abaAnterior?.properties?.sheetId;
  if (sheetIdAnterior === undefined || sheetIdAnterior === null) {
    throw new Error(`Aba "${abaAlvo}" não existe e a aba do mês anterior ("${nomeAbaAnterior}") também não foi encontrada — não dá pra clonar automaticamente.`);
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        duplicateSheet: {
          sourceSheetId: sheetIdAnterior,
          insertSheetIndex: 0, // abas mais recentes ficam à esquerda, mesma ordem já usada na planilha
          newSheetName: abaAlvo,
        },
      }],
    },
  });

  const primeiroDia = `01/${String(mes).padStart(2, "0")}/${ano}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${abaAlvo}'!D1`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[primeiroDia]] },
  });

  await sheets.spreadsheets.values.batchClear({
    spreadsheetId,
    requestBody: {
      ranges: [`'${abaAlvo}'!D${LINHA_BELLE_DINHEIRO}:AH${LINHA_BELLE_PIX}`, `'${abaAlvo}'!D${LINHA_CONTAS_DEBITO}:AH${LINHA_CONTAS_PIX}`],
    },
  });

  return abaAlvo;
}

async function colunaPorDataInformeVendas(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  aba: string,
): Promise<Map<string, number>> {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${aba}'!${RANGE_INFORME_VENDAS}` });
  const rows = res.data.values || [];
  const linhaHeader = rows.findIndex((r) => r.some((c) => /^\d{2}\/\d{2}\/\d{4}$/.test((c || "").toString().trim())));
  if (linhaHeader < 0) throw new Error(`Não achei o cabeçalho de datas na aba "${aba}"`);
  const header = rows[linhaHeader];

  const colPorData = new Map<string, number>();
  for (let col = 0; col < header.length; col++) {
    const dataRaw = (header[col] || "").toString().trim();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dataRaw)) continue;
    const data = parseData(dataRaw);
    if (data) colPorData.set(data, col);
  }
  return colPorData;
}

export interface LinhaContasParaInforme {
  data: string; // AAAA-MM-DD
  cartaoDebito: number;
  cartaoCredito: number;
  pix: number;
}

/** Fase 1 — escreve Débito/Crédito/Pix de "Contas bancárias" (linhas 49-51). */
export async function escreverContasBancariasInforme(
  spreadsheetId: string,
  ano: number,
  mes: number,
  linhas: LinhaContasParaInforme[],
): Promise<number> {
  const auth = getAuth();
  if (!auth) throw new Error("Credenciais do Google Sheets não configuradas");
  const sheets = google.sheets({ version: "v4", auth });

  const aba = await garantirAbaInformeVendas(sheets, spreadsheetId, ano, mes);
  const colPorData = await colunaPorDataInformeVendas(sheets, spreadsheetId, aba);

  const data: { range: string; values: (string | number)[][] }[] = [];
  let colunasEscritas = 0;
  for (const linha of linhas) {
    const col = colPorData.get(linha.data);
    if (col === undefined) continue;
    const colunaLetra = colunaParaLetra(col);
    data.push(
      { range: `'${aba}'!${colunaLetra}${LINHA_CONTAS_DEBITO}`, values: [[linha.cartaoDebito]] },
      { range: `'${aba}'!${colunaLetra}${LINHA_CONTAS_CREDITO}`, values: [[linha.cartaoCredito]] },
      { range: `'${aba}'!${colunaLetra}${LINHA_CONTAS_PIX}`, values: [[linha.pix]] },
    );
    colunasEscritas++;
  }
  if (data.length === 0) return 0;

  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data } });
  return colunasEscritas;
}

export interface LinhaBelleParaInforme {
  data: string; // AAAA-MM-DD
  dinheiro: number;
  cartaoDebito: number;
  cartaoCredito: number;
  pix: number;
}

/** Fase 2 — escreve Dinheiro/Débito/Crédito/Pix de "Belle (Contas a receber)" (linhas 42-45). */
export async function escreverBelleInforme(
  spreadsheetId: string,
  ano: number,
  mes: number,
  linhas: LinhaBelleParaInforme[],
): Promise<number> {
  const auth = getAuth();
  if (!auth) throw new Error("Credenciais do Google Sheets não configuradas");
  const sheets = google.sheets({ version: "v4", auth });

  const aba = await garantirAbaInformeVendas(sheets, spreadsheetId, ano, mes);
  const colPorData = await colunaPorDataInformeVendas(sheets, spreadsheetId, aba);

  const data: { range: string; values: (string | number)[][] }[] = [];
  let colunasEscritas = 0;
  for (const linha of linhas) {
    const col = colPorData.get(linha.data);
    if (col === undefined) continue;
    const colunaLetra = colunaParaLetra(col);
    data.push(
      { range: `'${aba}'!${colunaLetra}${LINHA_BELLE_DINHEIRO}`, values: [[linha.dinheiro]] },
      { range: `'${aba}'!${colunaLetra}${LINHA_BELLE_DEBITO}`, values: [[linha.cartaoDebito]] },
      { range: `'${aba}'!${colunaLetra}${LINHA_BELLE_CREDITO}`, values: [[linha.cartaoCredito]] },
      { range: `'${aba}'!${colunaLetra}${LINHA_BELLE_PIX}`, values: [[linha.pix]] },
    );
    colunasEscritas++;
  }
  if (data.length === 0) return 0;

  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "USER_ENTERED", data } });
  return colunasEscritas;
}

// ===== Comanda virtual (controle diário item a item da recepção) =====

// IDs das planilhas "Comanda virtual" (RBS/SSU) — item a item, uma aba
// por dia (nome "DDMMYYYY"). Compartilhada com a mesma service account
// já usada pras outras planilhas (2026-08-09).
export const SPREADSHEET_IDS_COMANDA_VIRTUAL = {
  rbs: "1e8VJX_Gam46fcISw5oSrS9-r9yzKcodyWS--KcA9Bz4",
  ssu: "1pdKiK3h5CRZfrT2fjVi3w-_Sd1BBgfhgjCvFUBk7FUs",
};

export function chaveComandaVirtualPorUnidade(unidadeId: number): keyof typeof SPREADSHEET_IDS_COMANDA_VIRTUAL | null {
  if (unidadeId === 2) return "rbs";
  if (unidadeId === 1) return "ssu";
  return null;
}

function colunaLetraComanda(indice: number): string {
  let n = indice + 1;
  let resultado = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    resultado = String.fromCharCode(65 + resto) + resultado;
    n = Math.floor((n - 1) / 26);
  }
  return resultado;
}

export function encontrarLinhaVaziaComandaVirtual(linhas: unknown[][]): { linha: number; clienteCol: number; terapiaCol: number; terapeutaCol: number } {
  const indiceCabecalho = linhas.findIndex((linha) => linha.some((celula: unknown) => normalizarRotulo(celula) === "cliente"));
  if (indiceCabecalho < 0) throw new Error("Não encontrei o cabeçalho da Comanda");
  const cabecalho = linhas[indiceCabecalho].map(normalizarRotulo);
  const clienteCol = cabecalho.indexOf("cliente");
  const terapiaCol = cabecalho.indexOf("terapia/produto");
  const terapeutaCol = cabecalho.indexOf("terapeuta");
  if (clienteCol < 0 || terapiaCol < 0 || terapeutaCol < 0) throw new Error("A Comanda não possui as colunas Cliente, Terapia/Produto e Terapeuta esperadas");
  const indiceLinha = linhas.slice(indiceCabecalho + 1).findIndex((linha) => {
    const clienteAtual = String(linha?.[clienteCol] ?? "").trim();
    return !clienteAtual || clienteAtual === "--";
  });
  if (indiceLinha < 0) throw new Error("Não há uma linha vazia disponível na Comanda de hoje");
  return { linha: indiceCabecalho + indiceLinha + 2, clienteCol, terapiaCol, terapeutaCol };
}

/** Preenche somente Cliente, Terapia/Produto e Terapeuta na primeira linha já existente e vazia da aba diária. */
export async function preencherLinhaVaziaComandaVirtual(params: {
  spreadsheetId: string; data: string; cliente: string; terapia: string; terapeuta: string; responsavel: string;
}): Promise<{ aba: string; linha: number }> {
  const auth = getAuth();
  if (!auth) throw new Error("Credenciais do Google Sheets não configuradas");
  const sheets = google.sheets({ version: "v4", auth });
  for (const aba of nomesAbaComandaVirtual(params.data)) {
    try {
      const resposta = await sheets.spreadsheets.values.get({ spreadsheetId: params.spreadsheetId, range: `'${aba}'!A1:AD300` });
      const linhas = resposta.data.values ?? [];
      const { linha: linhaPlanilha, clienteCol, terapiaCol, terapeutaCol } = encontrarLinhaVaziaComandaVirtual(linhas);
      const cabecalho = linhas.find((linha) => linha.some((celula: unknown) => normalizarRotulo(celula) === "cliente"))?.map(normalizarRotulo) ?? [];
      const responsavelCol = cabecalho.indexOf("abertura comanda (responsavel)");
      if (responsavelCol < 0) throw new Error("A Comanda não possui a coluna Abertura comanda (responsável) esperada");
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: params.spreadsheetId,
        requestBody: { valueInputOption: "USER_ENTERED", data: [
          { range: `'${aba}'!${colunaLetraComanda(clienteCol)}${linhaPlanilha}`, values: [[params.cliente]] },
          { range: `'${aba}'!${colunaLetraComanda(terapiaCol)}${linhaPlanilha}`, values: [[params.terapia]] },
          { range: `'${aba}'!${colunaLetraComanda(terapeutaCol)}${linhaPlanilha}`, values: [[params.terapeuta]] },
          { range: `'${aba}'!${colunaLetraComanda(responsavelCol)}${linhaPlanilha}`, values: [[params.responsavel]] },
        ] },
      });
      return { aba, linha: linhaPlanilha };
    } catch (erro: any) {
      if (erro?.code === 400 && /unable to parse range/i.test(String(erro?.message))) continue;
      throw erro;
    }
  }
  throw new Error("Não encontrei a aba diária da Comanda para hoje");
}

/**
 * A convenção de nome de aba não é garantidamente a mesma nas duas
 * planilhas — confirmado em produção (2026-08-10) que a RBS usa
 * "DD/MM/AAAA" (com barras), não "DDMMYYYY" como a função original
 * assumia; a SSU nunca foi confirmada da mesma forma, então pode estar
 * num formato ou no outro. Em vez de apostar num só (e arriscar quebrar
 * uma das duas unidades silenciosamente de novo), tenta os dois.
 */
function nomesAbaComandaVirtual(dataIso: string): string[] {
  const [y, m, d] = dataIso.split("-");
  return [`${d}/${m}/${y}`, `${d}${m}${y}`];
}

/**
 * Lê um único dia da "Comanda virtual" (uma aba por dia) — item a
 * item, mesmo formato de linha do parser de xlsx (server/
 * comandaVirtualXlsxParser.ts — reaproveitado aqui, não duplicado).
 * Usado pro dia a dia; a carga histórica usa o parser de xlsx direto
 * (evita centenas de chamadas à API pra trazer o passado todo de uma
 * vez). Retorna [] se nenhum dos formatos de nome de aba existir pra
 * esse dia (futuro, ou antes do início do controle) — não é erro, é
 * esperado.
 */
export async function lerComandaVirtualDiaSheet(
  spreadsheetId: string,
  dataIso: string,
): Promise<LinhaComandaItemImportada[]> {
  const auth = getAuth();
  if (!auth) throw new Error("Credenciais do Google Sheets não configuradas");

  const sheets = google.sheets({ version: "v4", auth });

  for (const aba of nomesAbaComandaVirtual(dataIso)) {
    let rows: unknown[][] | null;
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${aba}'!A1:AD300`,
      });
      rows = (res.data.values || []) as unknown[][];
    } catch (error: any) {
      // "Unable to parse range" (400) é esse formato de nome não bater
      // com nenhuma aba — tenta o próximo formato. QUALQUER outro erro
      // (429 rate limit, 5xx, timeout de rede) não pode virar "[]"
      // silenciosamente: antes disso acontecia, e um rate limit no
      // meio de uma sincronização de mês inteiro (30 chamadas em
      // sequência) fazia um dia real sumir sem deixar rastro nenhum de
      // erro. Deixa propagar pro chamador tratar.
      const status = error?.code ?? error?.response?.status;
      const mensagem = String(error?.message ?? error?.response?.data?.error?.message ?? "");
      if (status === 400 && /unable to parse range/i.test(mensagem)) {
        rows = null;
      } else {
        throw error;
      }
    }
    if (rows === null) continue;
    if (rows.length === 0) return [];
    return parseLinhasComandaItem(rows, dataIso);
  }

  return []; // nenhum formato de nome achou aba — dia sem controle ainda (normal)
}
