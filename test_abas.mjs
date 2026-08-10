import { google } from "googleapis";

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
  key: (process.env.GOOGLE_SHEETS_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const spreadsheetId = "1e8VJX_Gam46fcISw5oSrS9-r9yzKcodyWS--KcA9Bz4";

try {
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const abas = res.data.sheets?.map(s => s.properties?.title) || [];
  const abasAgo = abas.filter(a => a && a.includes("0826"));
  console.log("Abas de agosto 2026:", abasAgo);
  console.log("Total abas:", abas.length);
  console.log("Últimas 15 abas:", abas.slice(-15));
} catch (e) {
  console.error("Erro:", e.message);
}
