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
 * Um nível abaixo de ROUTER_MODULO — mapeia pra sub-seção (ver
 * shared/subsecoes.ts) quando o router serve uma tela específica
 * dentro de um módulo com mais de uma. Só faz sentido hoje pros
 * routers do Financeiro; router não listado aqui nunca é restringido
 * por sub-seção (mesmo se o módulo dele tiver sub-seções).
 */
const ROUTER_SUBSECAO: Record<string, string> = {
  financeiro: "financeiro:visao-geral",
  contas: "financeiro:contas",
  inter: "financeiro:contas",
  sicredi: "financeiro:contas",
  comandaRecepcao: "financeiro:comanda-recepcao",
  adquirentes: "financeiro:adquirentes",
  dreCategorias: "financeiro:parametros",
  dreDescricoes: "financeiro:parametros",
  dreRegras: "financeiro:parametros",
};

/**
 * Barra o acesso quando a conta tem permissoesCustomizadas=true (ver
 * users/permissoesModulo no schema) e o módulo dessa procedure não
 * está entre os liberados. `ctx.permissoesModulos === null` (conta sem
 * restrição, ou admin) libera tudo — resolvido uma vez em
 * createContext, não bate no banco aqui. Depois do módulo, checa a
 * sub-seção (um nível abaixo, ver ROUTER_SUBSECAO acima): só barra se
 * essa conta tiver QUALQUER sub-seção daquele módulo especificamente
 * liberada e a desta procedure não estiver entre elas — sem nenhuma
 * sub-seção configurada pro módulo, libera todas (mesmo
 * comportamento "não configurado = livre" do nível de módulo).
 */
const moduloMiddleware = t.middleware(async (opts) => {
  const { ctx, path, next } = opts;
  const permissoes = (ctx as TrpcContext).permissoesModulos;
  if (permissoes) {
    const router = path.split(".")[0];
    const modulo = ROUTER_MODULO[router];
    if (modulo && !permissoes.has(modulo)) {
      throw new TRPCError({ code: "FORBIDDEN", message: `Sem acesso ao módulo "${modulo}"` });
    }

    const subsecao = ROUTER_SUBSECAO[router];
    if (subsecao) {
      const subsecoes = (ctx as TrpcContext).permissoesSubsecoes;
      const moduloDaSubsecao = subsecao.split(":")[0];
      const restritoNestaSubsecao = Array.from(subsecoes).some((s) => s.startsWith(`${moduloDaSubsecao}:`));
      if (restritoNestaSubsecao && !subsecoes.has(subsecao)) {
        throw new TRPCError({ code: "FORBIDDEN", message: `Sem acesso a esta seção de "${moduloDaSubsecao}"` });
      }
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

/**
 * Protege ações que disparam sincronizações de fontes externas. Admins e
 * contas sem restrição continuam liberados; contas restritas precisam da
 * permissão explícita "sincronizacao" gerenciada em Usuários.
 */
const requireSyncPermission = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  const permissoes = (ctx as TrpcContext).permissoesModulos;
  if (permissoes && !permissoes.has("sincronizacao")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para executar a sincronização global" });
  }
  return next();
});

export const syncProcedure = t.procedure.use(requireUser).use(requireSyncPermission).use(auditMiddleware);

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
