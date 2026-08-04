import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { belleApi } from "./belleApi";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ===== Unidades =====
  unidades: router({
    list: protectedProcedure.query(async () => {
      return db.getUnidades();
    }),
    get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return db.getUnidadeById(input.id);
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      belleToken: z.string().optional(),
      codEstab: z.number().optional(),
      corTema: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...dados } = input;
      await db.updateUnidade(id, dados);
      return { success: true };
    }),
  }),

  // ===== Clientes (Belle API) =====
  clientes: router({
    list: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      pagina: z.number().default(0),
      dt_ultima_compra: z.string().optional(),
      dt_ultima_presenca: z.string().optional(),
      sexo: z.string().optional(),
      dt_cadastro: z.string().optional(),
    })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.belleToken) throw new Error("Token Belle não configurado para esta unidade");
      return belleApi.listarClientes(unidade.belleToken, unidade.codEstab, input.pagina, {
        dt_ultima_compra: input.dt_ultima_compra,
        dt_ultima_presenca: input.dt_ultima_presenca,
        sexo: input.sexo,
        dt_cadastro: input.dt_cadastro,
      });
    }),

    buscar: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      cpf: z.string().optional(),
      email: z.string().optional(),
      celular: z.string().optional(),
      id: z.number().optional(),
    })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.belleToken) throw new Error("Token Belle não configurado");
      const { unidadeId, ...busca } = input;
      return belleApi.buscarCliente(unidade.belleToken, unidade.codEstab, busca);
    }),

    planos: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      codCliente: z.number(),
    })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.belleToken) throw new Error("Token Belle não configurado");
      return belleApi.planosCliente(unidade.belleToken, input.codCliente, unidade.codEstab);
    }),

    atualizar: adminProcedure.input(z.object({
      unidadeId: z.number(),
      codCliente: z.number(),
      dados: z.record(z.string(), z.unknown()),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.belleToken) throw new Error("Token Belle não configurado");
      await belleApi.alterarCliente(unidade.belleToken, input.codCliente, input.dados as any);
      return { success: true };
    }),
  }),

  // ===== Kanban de Reativação =====
  kanban: router({
    list: protectedProcedure.input(z.object({
      unidadeId: z.number(),
    })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.belleToken) throw new Error("Token Belle não configurado");
      // Buscar todos os clientes (até 500 = 5 páginas)
      const allClientes: any[] = [];
      for (let p = 0; p < 5; p++) {
        const batch = await belleApi.listarClientes(unidade.belleToken, unidade.codEstab, p);
        if (!batch || batch.length === 0) break;
        allClientes.push(...batch);
        if (batch.length < 100) break;
      }
      // Segmentar por temperatura
      const quente = allClientes.filter(c => c.temperatura === 'Quente');
      const morno = allClientes.filter(c => c.temperatura === 'Morno');
      const frio = allClientes.filter(c => c.temperatura === 'Frio' || !c.temperatura);
      return { quente, morno, frio, total: allClientes.length };
    }),
  }),

  // ===== Agenda =====
  agenda: router({
    list: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      data_inicio: z.string().optional(),
      data_fim: z.string().optional(),
    })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.belleToken) throw new Error("Token Belle não configurado");
      return belleApi.listarAgendamentos(unidade.belleToken, unidade.codEstab, {
        data_inicio: input.data_inicio,
        data_fim: input.data_fim,
      });
    }),
  }),

  // ===== Serviços =====
  servicos: router({
    list: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.belleToken) throw new Error("Token Belle não configurado");
      return belleApi.listarServicos(unidade.belleToken, unidade.codEstab);
    }),
  }),

  // ===== Planos =====
  planos: router({
    list: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.belleToken) throw new Error("Token Belle não configurado");
      return belleApi.listarPlanos(unidade.belleToken, unidade.codEstab);
    }),
  }),

  // ===== Financeiro =====
  financeiro: router({
    vendas: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      data_inicio: z.string().optional(),
      data_fim: z.string().optional(),
    })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.belleToken) throw new Error("Token Belle não configurado");
      return belleApi.relatorioVendas(unidade.belleToken, unidade.codEstab, {
        data_inicio: input.data_inicio,
        data_fim: input.data_fim,
      });
    }),

    recebimentos: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      data_inicio: z.string().optional(),
      data_fim: z.string().optional(),
    })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.belleToken) throw new Error("Token Belle não configurado");
      return belleApi.listarRecebimentos(unidade.belleToken, unidade.codEstab, {
        data_inicio: input.data_inicio,
        data_fim: input.data_fim,
      });
    }),

    metas: router({
      list: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
        return db.getMetas(input.unidadeId);
      }),
      upsert: adminProcedure.input(z.object({
        unidadeId: z.number(),
        mes: z.number(),
        ano: z.number(),
        valorFaturamento: z.number().optional(),
        valorRecebimento: z.number().optional(),
        numAgendamentos: z.number().optional(),
        numNovosClientes: z.number().optional(),
      })).mutation(async ({ input }) => {
        await db.upsertMeta({
          ...input,
          valorFaturamento: input.valorFaturamento?.toString(),
          valorRecebimento: input.valorRecebimento?.toString(),
        } as any);
        return { success: true };
      }),
    }),

    // Dashboard consolidado
    dashboard: protectedProcedure.input(z.object({
      unidadeId: z.number(),
    })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.belleToken) throw new Error("Token Belle não configurado");

      const hoje = new Date();
      const dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

      const [vendas, recebimentos, agendamentos] = await Promise.all([
        belleApi.relatorioVendas(unidade.belleToken, unidade.codEstab, {
          data_inicio: fmtDate(dataInicio),
          data_fim: fmtDate(hoje),
        }).catch(() => null),
        belleApi.listarRecebimentos(unidade.belleToken, unidade.codEstab, {
          data_inicio: fmtDate(dataInicio),
          data_fim: fmtDate(hoje),
        }).catch(() => null),
        belleApi.listarAgendamentos(unidade.belleToken, unidade.codEstab).catch(() => null),
      ]);

      return {
        faturamentoMes: vendas?.valorTotal ?? 0,
        totalVendasMes: vendas?.totalVendas ?? 0,
        recebimentosMes: recebimentos?.reduce((sum, r) => sum + r.valor, 0) ?? 0,
        agendamentosHoje: agendamentos?.filter(a => {
          const today = fmtDate(hoje);
          return a.data === today;
        }).length ?? 0,
        totalAgendamentos: agendamentos?.length ?? 0,
      };
    }),
  }),

  // ===== Leads =====
  leads: router({
    list: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      return db.getLeads(input.unidadeId);
    }),

    create: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      nome: z.string().min(1),
      celular: z.string().optional(),
      email: z.string().optional(),
      cpf: z.string().optional(),
      dataNascimento: z.string().optional(),
      genero: z.string().optional(),
      profissao: z.string().optional(),
      observacao: z.string().optional(),
      tipoOrigem: z.string().optional(),
      codOrigem: z.string().optional(),
    })).mutation(async ({ input }) => {
      // Salvar no banco local
      await db.createLead(input);

      // Enviar para Belle
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (unidade?.belleToken) {
        try {
          const { unidadeId, ...leadData } = input;
          const result = await belleApi.gravarLead(unidade.belleToken, {
            ...leadData,
            codEstab: unidade.codEstab,
          });
          // Atualizar status
          const leads = await db.getLeads(input.unidadeId);
          const lastLead = leads[0];
          if (lastLead) {
            await db.updateLeadStatus(lastLead.id, 'enviado', result.codigo);
          }
          return { success: true, belleCodigo: result.codigo };
        } catch (error: any) {
          const leads = await db.getLeads(input.unidadeId);
          const lastLead = leads[0];
          if (lastLead) {
            await db.updateLeadStatus(lastLead.id, 'erro', undefined, error.message);
          }
          return { success: false, error: error.message };
        }
      }
      return { success: true, message: "Lead salvo localmente (Belle não configurado)" };
    }),
  }),

  // ===== Lâminas =====
  laminas: router({
    list: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      return db.getLaminas(input.unidadeId);
    }),

    create: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      titulo: z.string(),
      template: z.string(),
      conteudo: z.record(z.string(), z.unknown()).optional(),
    })).mutation(async ({ input }) => {
      await db.createLamina(input as any);
      return { success: true };
    }),

    update: protectedProcedure.input(z.object({
      id: z.number(),
      imagemUrl: z.string().optional(),
      status: z.enum(['rascunho', 'pronto', 'publicado']).optional(),
    })).mutation(async ({ input }) => {
      await db.updateLamina(input.id, input);
      return { success: true };
    }),
  }),

  // ===== Sync Logs =====
  syncLogs: router({
    list: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      return db.getSyncLogs(input.unidadeId);
    }),
  }),

  // ===== Copilot =====
  copilot: router({
    list: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      return db.getCopilotConversas(input.unidadeId);
    }),

    create: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      clienteCpf: z.string().optional(),
      clienteNome: z.string().optional(),
    })).mutation(async ({ input }) => {
      await db.createCopilotConversa({
        ...input,
        mensagens: [],
      } as any);
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
