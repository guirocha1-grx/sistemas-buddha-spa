export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  // Z-API (WhatsApp)
  zapiInstanceId: process.env.ZAPI_INSTANCE_ID ?? "",
  zapiToken: process.env.ZAPI_TOKEN ?? "",
  zapiClientToken: process.env.ZAPI_CLIENT_TOKEN ?? "",
  // Belle Software
  belleDefaultToken: process.env.BELLE_DEFAULT_TOKEN ?? "",
};
