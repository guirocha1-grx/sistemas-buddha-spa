export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Login direto com Google — único fluxo de login do app. Todo o fluxo
// (inclusive montar a URL de autorização do Google) roda no servidor; aqui
// é só uma navegação same-origin.
export const startGoogleLogin = () => {
  window.location.href = "/api/oauth/google/start";
};
