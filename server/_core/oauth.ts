import { COOKIE_NAME, ONE_YEAR_MS, OAUTH_STATE_COOKIE, encodeOAuthState, decodeOAuthState } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions, isSecureRequest } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

// Deriva a origem pública da requisição (esquema + host) pra montar o
// redirect_uri do Google de forma confiável atrás de proxy. `req.headers.host`
// sozinho não serve aqui: atrás do proxy do Manus ele chega com o hostname
// interno do Cloud Run (ex: "pv6y2de5jd-....a.run.app"), não o domínio
// público que o navegador usou (manus.space ou o domínio próprio,
// spa.grxcorp.com.br) — daí o "redirect_uri_mismatch" mesmo com a URI certa
// cadastrada no Google. x-forwarded-host carrega o domínio real; cai pra
// headers.host só se o proxy não mandar (acesso direto, sem proxy).
function publicOrigin(req: Request): string {
  const proto = isSecureRequest(req) ? "https" : "http";
  const forwardedHost = req.headers["x-forwarded-host"];
  const host = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)?.split(",")[0]?.trim() || req.headers.host;
  return `${proto}://${host}`;
}

async function exchangeGoogleCode(code: string, redirectUri: string): Promise<{ accessToken: string }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: ENV.googleClientId,
      client_secret: ENV.googleClientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) {
    throw new Error(`Google token exchange failed: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as { access_token: string };
  return { accessToken: data.access_token };
}

async function getGoogleUserInfo(accessToken: string): Promise<{ sub: string; email: string; name: string }> {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`Google userinfo failed: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as { sub: string; email: string; name?: string };
  return { sub: data.sub, email: data.email, name: data.name || data.email };
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    // CSRF guard: the nonce in `state` must match the one-time cookie that
    // startLogin set in the browser that began this login. An attacker can
    // forge `state`, but cannot plant this cookie in the victim's browser.
    const { nonce } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });

  /**
   * Login direto com Google — alternativa ao portal do Manus acima,
   * adicionada em 2026-08-09 porque a recepção usa uma conta Google
   * compartilhada e o login via Manus não deixava claro/restrito que é
   * uma conta Google. Reaproveita o MESMO Client ID/Secret já usado no
   * mobai-crm (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET) — só precisa
   * cadastrar esta URL de callback como redirect URI autorizado
   * adicional no mesmo OAuth Client no Google Cloud Console, sem
   * afetar o mobai-crm. Nasce toda no servidor (inclusive o passo de
   * iniciar o redirect pro Google) pra não precisar de uma env var
   * VITE_ duplicada só pra expor o client id no bundle do client.
   *
   * Reaproveita a sessão do Manus (sdk.createSessionToken + cookie
   * COOKIE_NAME) depois de resolver o usuário via Google — nada mais
   * no resto do app (trpc.ts, context.ts, requireUser) precisa mudar.
   */
  app.get("/api/oauth/google/start", (req: Request, res: Response) => {
    if (!ENV.googleClientId) {
      res.status(500).json({ error: "GOOGLE_CLIENT_ID não configurado" });
      return;
    }

    const redirectUri = `${publicOrigin(req)}/api/oauth/google/callback`;
    const nonce = crypto.randomUUID();
    const state = encodeOAuthState({ redirectUri, nonce });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(OAUTH_STATE_COOKIE, nonce, { ...cookieOptions, maxAge: 10 * 60 * 1000 });

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", ENV.googleClientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");

    res.redirect(302, url.toString());
  });

  app.get("/api/oauth/google/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    const { nonce, redirectUri } = decodeOAuthState(state);
    const expectedNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
    if (!nonce || nonce !== expectedNonce) {
      res.status(403).json({ error: "invalid oauth state" });
      return;
    }
    res.clearCookie(OAUTH_STATE_COOKIE, { path: "/", secure: true, sameSite: "none" });

    if (!ENV.googleClientId || !ENV.googleClientSecret) {
      res.status(500).json({ error: "GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET não configurados" });
      return;
    }

    try {
      const { accessToken } = await exchangeGoogleCode(code, redirectUri);
      const googleUser = await getGoogleUserInfo(accessToken);

      if (!googleUser.sub) {
        res.status(400).json({ error: "sub missing from Google user info" });
        return;
      }

      // Prefixado pra nunca colidir com um openId vindo do portal do
      // Manus acima (namespace diferente, mesmo `users.openId` único).
      const openId = `google:${googleUser.sub}`;

      await db.upsertUser({
        openId,
        name: googleUser.name || null,
        email: googleUser.email ?? null,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(openId, {
        name: googleUser.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[Google OAuth] Callback failed", error);
      res.status(500).json({ error: "Google OAuth callback failed" });
    }
  });
}
