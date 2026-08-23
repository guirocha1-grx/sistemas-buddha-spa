export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  // Só usado pra promover automaticamente um usuário a admin na primeira vez
  // que o banco é criado (ver upsertUser em server/db.ts) — sem efeito
  // depois que já existem usuários/papéis definidos.
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  r2BucketName: process.env.R2_BUCKET_NAME ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleSheetsClientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL ?? "",
  googleSheetsPrivateKey: process.env.GOOGLE_SHEETS_PRIVATE_KEY ?? "",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramChatIdGrupoRecepcao: process.env.TELEGRAM_CHAT_ID_GRUPO_RECEPCAO ?? "",
  // Destino do relatório diário da rotina de sincronização (7h, ver
  // server/dailySyncReport.ts) — chat pessoal do Guilherme, já salvo
  // como env var no Manus (2026-08-17).
  telegramChatIdGuilherme: process.env.TELEGRAM_CHAT_ID_GUILHERME ?? "",
};
