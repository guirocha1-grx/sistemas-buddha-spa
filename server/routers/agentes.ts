import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import * as agentesDb from "../agentesDb";
import { aprovarEEnviarSugestao, liberarSugestaoParaEdicao, processarMensagemRecebida, reprovarSugestao, simularRespostaEspecialista } from "../agentesService";
import { verificarQualidadeAgentes } from "../agentesQualidadeAlerta";
import { avaliarExecucaoRegressao, criarCasoRegressao, listarCasosRegressaoComUltimaExecucao, rodarCasoRegressao, rodarSuiteRegressao } from "../agentesRegressao";

const motivoAvaliacao = z.enum(["informacao", "tom", "roteamento", "contexto", "comercial", "operacional", "outro"]);

function podeGerirCampanhaMes(ctx: { user: { role: string }; permissoesSubsecoes?: Set<string> }) {
  if (ctx.user.role === "admin") return true;
  const subsecoes = ctx.permissoesSubsecoes ?? new Set<string>();
  const possuiRestricaoNaTabela = Array.from(subsecoes).some((chave) => chave.startsWith("tabela_precos:"));
  return !possuiRestricaoNaTabela || subsecoes.has("tabela_precos:campanha_mes");
}

export const tabelaPrecosRouter = router({
  list: protectedProcedure.input(z.object({
    unidadeId: z.number(),
    busca: z.string().trim().max(100).optional(),
    categoria: z.string().trim().max(80).optional(),
  })).query(({ input }) => agentesDb.listarTabelaPrecos(input)),
  campanhaMes: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input, ctx }) => ({
    campanha: await agentesDb.obterCampanhaMensal(input.unidadeId),
    podeEditar: podeGerirCampanhaMes(ctx),
  })),
  salvarCampanhaMes: protectedProcedure.input(z.object({
    unidadeId: z.number(),
    conteudo: z.string().trim().min(1, "Informe o texto da campanha.").max(20000),
  })).mutation(async ({ input, ctx }) => {
    if (!podeGerirCampanhaMes(ctx)) throw new TRPCError({ code: "FORBIDDEN", message: "Sem permissão para gerenciar a Campanha do Mês" });
    return agentesDb.salvarCampanhaMensal(input);
  }),
});

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
    atualizarTodos: adminProcedure.input(z.object({ unidadeId: z.number(), ativo: z.boolean() }))
      .mutation(({ input }) => agentesDb.atualizarAtivacaoTodosAgentes(input.unidadeId, input.ativo)),
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
  fila: router({
    list: adminProcedure.input(z.object({ unidadeId: z.number().optional() }).optional())
      .query(({ input }) => agentesDb.listarFilaSugestoes(input?.unidadeId)),
    pendenteConversa: protectedProcedure.input(z.object({ conversaId: z.number() }))
      .query(({ input }) => agentesDb.obterSugestaoPendenteConversa(input.conversaId)),
    aprovarEEnviar: protectedProcedure.input(z.object({
      sugestaoId: z.number(),
      textoFinal: z.string().trim().min(1).max(4000).optional(),
      tipoRevisao: z.enum(["aceita_como_esta", "editada"]).optional(),
      comentario: z.string().trim().max(2000).optional(),
      motivo: motivoAvaliacao.optional(),
      atendenteId: z.number().optional(),
    }))
      .mutation(async ({ input, ctx }) => {
        const origemCabecalho = ctx.req.headers.origin;
        const protocolo = String(ctx.req.headers["x-forwarded-proto"] ?? ctx.req.protocol ?? "https").split(",")[0];
        const host = String(ctx.req.headers["x-forwarded-host"] ?? ctx.req.headers.host ?? "").split(",")[0];
        const origemPublica = typeof origemCabecalho === "string" && origemCabecalho.startsWith("http") ? origemCabecalho : host ? `${protocolo}://${host}` : null;
        return aprovarEEnviarSugestao({ ...input, userId: ctx.user.id, origemPublica });
      }),
    reprovar: protectedProcedure.input(z.object({ sugestaoId: z.number(), comentario: z.string().trim().max(2000).optional(), motivo: motivoAvaliacao.optional(), atendenteId: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        return reprovarSugestao({ ...input, userId: ctx.user.id });
      }),
    liberarParaEdicao: protectedProcedure.input(z.object({ sugestaoId: z.number(), textoBase: z.string().trim().max(4000).optional(), atendenteId: z.number().optional() }))
      .mutation(async ({ input, ctx }) => {
        return liberarSugestaoParaEdicao({ ...input, userId: ctx.user.id });
      }),
  }),
  metricas: adminProcedure.input(z.object({ unidadeId: z.number().optional(), inicio: z.date().optional(), fim: z.date().optional() }).optional())
    .query(({ input }) => agentesDb.listarMetricasAgentes(input?.unidadeId, input?.inicio, input?.fim)),
  serieQualidade: adminProcedure.input(z.object({ unidadeId: z.number().optional(), inicio: z.date().optional(), fim: z.date().optional() }).optional())
    .query(({ input }) => agentesDb.listarSerieQualidadeAgentes(input?.unidadeId, input?.inicio, input?.fim)),
  diagnostico: router({
    conversa: adminProcedure.input(z.object({ conversaId: z.number(), limite: z.number().min(1).max(100).optional() }))
      .query(({ input }) => agentesDb.listarDiagnosticoConversa(input.conversaId, input.limite)),
  }),
  processarTeste: adminProcedure.input(z.object({ conversaId: z.number(), mensagemEntradaId: z.number() }))
    .mutation(({ input }) => processarMensagemRecebida(input)),
  simular: adminProcedure.input(z.object({
    conversaId: z.number(),
    chaveAgente: z.enum(["bianca", "fabricia", "estela", "carol", "diana"]),
  })).mutation(({ input }) => simularRespostaEspecialista(input)),
  qualidade: router({
    verificarAgora: adminProcedure.mutation(() => verificarQualidadeAgentes()),
  }),
  regressao: router({
    listar: adminProcedure.query(() => listarCasosRegressaoComUltimaExecucao()),
    criar: adminProcedure.input(z.object({
      nome: z.string().trim().min(1).max(200),
      chaveAgente: z.enum(["bianca", "fabricia", "estela", "carol", "diana"]),
      conversaId: z.number(),
      ateDataHora: z.date(),
      regrasProibidas: z.array(z.string().trim().min(1)).max(20),
      mensagemDeveSerVazia: z.boolean().default(false),
      descricaoEsperada: z.string().trim().max(2000).optional(),
    })).mutation(({ input, ctx }) => criarCasoRegressao({ ...input, usuario: { id: ctx.user.id, name: ctx.user.name } })),
    rodarCaso: adminProcedure.input(z.object({ casoId: z.number() })).mutation(({ input }) => rodarCasoRegressao(input.casoId)),
    rodarSuite: adminProcedure.mutation(() => rodarSuiteRegressao()),
    avaliar: adminProcedure.input(z.object({
      execucaoId: z.number(),
      notaHumana: z.number().min(1).max(5).optional(),
      comentarioHumano: z.string().trim().max(2000).optional(),
    })).mutation(({ input, ctx }) => avaliarExecucaoRegressao({ ...input, usuario: { id: ctx.user.id, name: ctx.user.name } })),
  }),
});
