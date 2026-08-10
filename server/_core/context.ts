import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse as parseCookieHeader } from "cookie";
import { ATENDENTE_COOKIE_NAME } from "@shared/const";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import * as db from "../db";

export type AtendenteAtual = { id: number; nome: string; unidadeId: number };

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  atendente: AtendenteAtual | null;
  // Conjunto de módulos liberados (ver shared/modulos.ts) pra essa
  // conta, ou `null` = sem restrição (acesso total) — vale tanto pra
  // "nunca configurado" quanto pra admin (nunca restringido). Resolvido
  // uma vez por requisição aqui, não a cada procedure, pra não bater no
  // banco de novo em cada chamada de um mesmo batch de requisição.
  permissoesModulos: Set<string> | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  // Identidade de quem está atendendo (ver drizzle/schema.ts
  // atendentes/atendenteSessoes) — cookie separado do login acima,
  // então resolve independente de `user` ter sido autenticado ou não.
  let atendente: AtendenteAtual | null = null;
  const atendenteToken = parseCookieHeader(opts.req.headers.cookie ?? "")[ATENDENTE_COOKIE_NAME];
  if (atendenteToken) {
    atendente = await db.getAtendenteAtualPorToken(atendenteToken);
  }

  let permissoesModulos: Set<string> | null = null;
  if (user && user.role !== "admin") {
    const permissoes = await db.getPermissoesUsuario(user.id);
    if (permissoes.restrito) permissoesModulos = new Set(permissoes.modulos);
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    atendente,
    permissoesModulos,
  };
}
