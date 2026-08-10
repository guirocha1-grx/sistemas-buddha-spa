import { lerComandaVirtualDiaSheet } from "./server/googleSheets.ts";

const spreadsheetId = "1e8VJX_Gam46fcISw5oSrS9-r9yzKcodyWS--KcA9Bz4";
const dia = "2026-08-09";
console.log(`Tentando ler dia ${dia} da planilha ${spreadsheetId}...`);
try {
  const linhas = await lerComandaVirtualDiaSheet(spreadsheetId, dia);
  console.log(`Linhas encontradas: ${linhas.length}`);
  if (linhas.length > 0) {
    console.log("Primeira linha:", JSON.stringify(linhas[0], null, 2));
  } else {
    console.log("Nenhuma linha encontrada. Verificando se a aba existe...");
  }
} catch (e) {
  console.error("Erro:", e.message);
}
