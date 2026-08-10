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

export const protectedProcedure = t.procedure.use(requireUser).use(auditMiddleware);

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
