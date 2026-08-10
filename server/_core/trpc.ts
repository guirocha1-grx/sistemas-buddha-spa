import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { getDb } from "../db";
import { auditLog } from "../../drizzle/schema";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

/**
 * Prefixo do router (primeiro segmento de `path`, ex.: "clientes.list"
 * → "clientes") pro módulo correspondente em shared/modulos.ts — ver
 * controle de acesso por módulo, 2026-08-10. Vários routers do
 * Financeiro compartilham o mesmo módulo "financeiro" (é uma aba só na
 * navegação, com várias sub-seções por baixo). Router não listado aqui
 * fica de fora do controle de propósito (nunca restringido) — inclui
 * infra que precisa funcionar mesmo pra conta restrita (unidades,
 * atendentes, auth) e o que não tem tela dedicada hoje (servicos,
 * planos, syncLogs).
 */
const ROUTER_MODULO: Record<string, string> = {
  clientes: "clientes",
  kanban: "reativacao",
  agenda: "agenda",
  inbox: "mensagens",
  mensageria: "mensagens",
  financeiro: "financeiro",
  inter: "financeiro",
  sicredi: "financeiro",
  contas: "financeiro",
  comandaRecepcao: "financeiro",
  dreCategorias: "financeiro",
  dreDescricoes: "financeiro",
  dreRegras: "financeiro",
  adquirentes: "financeiro",
  copilot: "copilot",
  laminas: "laminas",
  leads: "leads",
  configuracoes: "configuracoes",
};

/**
 * Barra o acesso quando a conta tem permissoesCustomizadas=true (ver
 * users/permissoesModulo no schema) e o módulo dessa procedure não
 * está entre os liberados. `ctx.permissoesModulos === null` (conta sem
 * restrição, ou admin) libera tudo — resolvido uma vez em
 * createContext, não bate no banco aqui.
 */
const moduloMiddleware = t.middleware(async (opts) => {
  const { ctx, path, next } = opts;
  const permissoes = (ctx as TrpcContext).permissoesModulos;
  if (permissoes) {
    const modulo = ROUTER_MODULO[path.split(".")[0]];
    if (modulo && !permissoes.has(modulo)) {
      throw new TRPCError({ code: "FORBIDDEN", message: `Sem acesso ao módulo "${modulo}"` });
    }
  }
  return next();
});

/**
 * Loga toda mutation (não query) num único lugar, sem precisar
 * instrumentar cada procedure — trazido do mobai-crm (2026-08-08).
 * Await antes de retornar, não "fire and forget": em Cloud Run a
 * instância pode ser reciclada logo após a resposta ser enviada,
 * matando qualquer trabalho em background ainda pendente.
 */
const auditMiddleware = t.middleware(async (opts) => {
  const { next, path, type, ctx } = opts;

  if (type !== "mutation") {
    return next();
  }

  const inicio = Date.now();
  const result = await next();

  try {
    const db = await getDb();
    if (db) {
      let inputResumo: string | null = null;
      try {
        const getRawInput = (opts as { getRawInput?: () => Promise<unknown> }).getRawInput;
        const raw = typeof getRawInput === "function" ? await getRawInput() : undefined;
        if (raw !== undefined) inputResumo = JSON.stringify(raw).slice(0, 2000);
      } catch {
        // input não serializável (ex: contém base64 grande) — ignora, não é crítico
      }

      const user = (ctx as TrpcContext).user;
      const atendente = (ctx as TrpcContext).atendente;

      await db.insert(auditLog).values({
        userId: user?.id ?? null,
        userNome: user?.name ?? null,
        userRole: user?.role ?? null,
        atendenteId: atendente?.id ?? null,
        atendenteNome: atendente?.nome ?? null,
        procedure: path,
        inputResumo,
        sucesso: result.ok,
        erroMsg: result.ok ? null : String((result as { error?: { message?: string } }).error?.message ?? ""),
        duracaoMs: Date.now() - inicio,
      });
    }
  } catch (e) {
    console.error("[AuditLog] Falha ao gravar log:", e);
  }

  return result;
});

export const protectedProcedure = t.procedure.use(requireUser).use(moduloMiddleware).use(auditMiddleware);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
).use(auditMiddleware);
