import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import * as agentesDb from "../agentesDb";
import { aprovarEEnviarSugestao, processarMensagemRecebida, reprovarSugestao } from "../agentesService";
import { TRPCError } from "@trpc/server";

const motivoAvaliacao = z.enum(["informacao", "tom", "roteamento", "contexto", "comercial", "operacional", "outro"]);

async function validarResponsavelDaSugestao(params: { sugestaoId: number; role: string; atendenteId?: number }) {
  if (params.role === "admin") return;
  if (!params.atendenteId) throw new TRPCError({ code: "FORBIDDEN", message: "Usuário sem consultor vinculado" });
  const registro = await agentesDb.buscarSugestao(params.sugestaoId);
  if (!registro || registro.conversa.atendenteResponsavelId !== params.atendenteId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Esta sugestão pertence a outro consultor" });
  }
}

export const agentesRouter = router({
  configuracao: router({
    list: adminProcedure.input(z.object({ unidadeId: z.number() })).query(({ input }) => agentesDb.listarAgentesComPrompts(input.unidadeId)),
    atualizar: adminProcedure.input(z.object({
      id: z.number(),
      unidadeId: z.number(),
      nome: z.string().trim().min(2).max(120).optional(),
      descricao: z.string().trim().max(1000).nullable().optional(),
      ativo: z.boolean().optional(),
      modoOperacao: z.enum(["assistido", "automatico"]).optional(),
      modelo: z.string().trim().min(2).max(80).optional(),
    })).mutation(async ({ input }) => {
      const { id, unidadeId, nome, descricao, ativo, modoOperacao, modelo } = input;
      if (nome !== undefined || descricao !== undefined) await agentesDb.atualizarAgente({ id, nome, descricao });
      if (ativo !== undefined || modoOperacao !== undefined || modelo !== undefined) {
        await agentesDb.atualizarConfiguracaoAgente({ agenteId: id, unidadeId, ativo, modoOperacao, modelo });
      }
      return { success: true };
    }),
    criarVersao: adminProcedure.input(z.object({
      agenteId: z.number(),
      unidadeId: z.number(),
      conteudo: z.string().trim().min(20).max(30000),
      ativarAgora: z.boolean().default(false),
    })).mutation(({ input, ctx }) => agentesDb.criarVersaoPrompt({
      agenteId: input.agenteId,
      unidadeId: input.unidadeId,
      conteudo: input.conteudo,
      status: input.ativarAgora ? "ativo" : "rascunho",
      criadoPorUserId: ctx.user.id,
      criadoPorNome: ctx.user.name,
    })),
    ativarVersao: adminProcedure.input(z.object({ agenteId: z.number(), unidadeId: z.number(), versaoId: z.number() }))
      .mutation(({ input }) => agentesDb.ativarVersaoPrompt(input.agenteId, input.unidadeId, input.versaoId)),
  }),
  recursos: router({
    list: adminProcedure.input(z.object({ unidadeId: z.number() })).query(({ input }) => agentesDb.listarRecursosAgentes(input.unidadeId)),
    salvar: adminProcedure.input(z.object({
      id: z.number().optional(),
      unidadeId: z.number(),
      chave: z.string().trim().min(2).max(96),
      tipo: z.enum(["preco", "promocao", "conteudo", "midia", "modelo_voucher"]),
      titulo: z.string().trim().min(2).max(256),
      conteudo: z.string().trim().max(20000).nullable().optional(),
      url: z.string().url().max(2000).nullable().optional(),
      vigenciaInicio: z.date().nullable().optional(),
      vigenciaFim: z.date().nullable().optional(),
      ativo: z.boolean(),
    })).mutation(({ input }) => agentesDb.salvarRecursoAgente(input)),
  }),
  tabela: router({
    list: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      busca: z.string().trim().max(100).optional(),
      categoria: z.string().trim().max(80).optional(),
    })).query(({ input }) => agentesDb.listarTabelaPrecos(input)),
  }),
  fila: router({
    list: protectedProcedure.input(z.object({ unidadeId: z.number().optional() }).optional())
      .query(({ input, ctx }) => {
        if (ctx.user.role !== "admin" && !ctx.atendente?.id) return [];
        return agentesDb.listarFilaSugestoes(input?.unidadeId, ctx.user.role === "admin" ? undefined : ctx.atendente?.id);
      }),
    aprovarEEnviar: protectedProcedure.input(z.object({ sugestaoId: z.number(), comentario: z.string().trim().max(2000).optional(), motivo: motivoAvaliacao.optional() }))
      .mutation(async ({ input, ctx }) => {
        await validarResponsavelDaSugestao({ sugestaoId: input.sugestaoId, role: ctx.user.role, atendenteId: ctx.atendente?.id });
        const origemCabecalho = ctx.req.headers.origin;
        const protocolo = String(ctx.req.headers["x-forwarded-proto"] ?? ctx.req.protocol ?? "https").split(",")[0];
        const host = String(ctx.req.headers["x-forwarded-host"] ?? ctx.req.headers.host ?? "").split(",")[0];
        const origemPublica = typeof origemCabecalho === "string" && origemCabecalho.startsWith("http") ? origemCabecalho : host ? `${protocolo}://${host}` : null;
        return aprovarEEnviarSugestao({ ...input, userId: ctx.user.id, atendenteId: ctx.atendente?.id, origemPublica });
      }),
    reprovar: protectedProcedure.input(z.object({ sugestaoId: z.number(), comentario: z.string().trim().max(2000).optional(), motivo: motivoAvaliacao.optional() }))
      .mutation(async ({ input, ctx }) => {
        await validarResponsavelDaSugestao({ sugestaoId: input.sugestaoId, role: ctx.user.role, atendenteId: ctx.atendente?.id });
        return reprovarSugestao({ ...input, userId: ctx.user.id, atendenteId: ctx.atendente?.id });
      }),
  }),
  metricas: adminProcedure.input(z.object({ unidadeId: z.number().optional(), inicio: z.date().optional(), fim: z.date().optional() }).optional())
    .query(({ input }) => agentesDb.listarMetricasAgentes(input?.unidadeId, input?.inicio, input?.fim)),
  serieQualidade: adminProcedure.input(z.object({ unidadeId: z.number().optional(), inicio: z.date().optional(), fim: z.date().optional() }).optional())
    .query(({ input }) => agentesDb.listarSerieQualidadeAgentes(input?.unidadeId, input?.inicio, input?.fim)),
  processarTeste: adminProcedure.input(z.object({ conversaId: z.number(), mensagemEntradaId: z.number() }))
    .mutation(({ input }) => processarMensagemRecebida(input)),
});
