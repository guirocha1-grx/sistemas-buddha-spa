import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure, adminProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { belleApi } from "./belleApi";
import { zapiApi } from "./zapiApi";
import { buddhaMktApi } from "./buddhaMktApi";
import { storagePut, storageGetSignedUrl } from "./storage";
import { invokeLLM } from "./_core/llm";
import { interApi, getInterAccessToken, isTokenValid, dataEntradaDe, extrairContraparte, type InterTransacaoCompleta } from "./interApi";
import { sicrediApi, getSicrediAccessToken, isSicrediTokenValid } from "./sicrediApi";
import { parseExtratoInterPdf } from "./interExtratoPdfParser";
import { parseExtratoOfx, parseSaldoOfx } from "./interExtratoOfxParser";
import { consultarPagamentos, extrairValoresMp, criarRelatorioLiberado, listarRelatoriosLiberados, baixarRelatorioLiberado, parseRelatorioLiberadoMp } from "./mercadoPagoApi";
import { PDFParse } from "pdf-parse";
import { lerCaixaFisicoSheet, SPREADSHEET_IDS, SPREADSHEET_ABAS, lerComandaConsolidadoSheet, SPREADSHEET_IDS_COMANDA } from "./googleSheets";

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
      zapiInstanceId: z.string().optional(),
      zapiToken: z.string().optional(),
      zapiClientToken: z.string().optional(),
      codEstab: z.number().optional(),
      corTema: z.string().optional(),
      // Banco Inter
      interClientId: z.string().optional(),
      interClientSecret: z.string().optional(),
      interCertificado: z.string().optional(),
      interChavePrivada: z.string().optional(),
      interContaCorrente: z.string().optional(),
      // Mercado Pago
      mpAccessToken: z.string().optional(),
      // Sicredi
      sicrediClientId: z.string().optional(),
      sicrediClientSecret: z.string().optional(),
      sicrediCertificado: z.string().optional(),
      sicrediChavePrivada: z.string().optional(),
      sicrediCooperativa: z.string().optional(),
      sicrediAgencia: z.string().optional(),
      sicrediConta: z.string().optional(),
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

    historico: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      codCliente: z.number(),
    })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.belleToken) throw new Error("Token Belle não configurado");
      // Buscar vendas do cliente via relatório de vendas filtrado
      const vendas = await belleApi.relatorioVendas(unidade.belleToken, unidade.codEstab).catch(() => null);
      if (!vendas?.vendas) return [];
      // Filtrar vendas do cliente específico
      return vendas.vendas.filter((v: any) => v.cliente === input.codCliente || v.codCliente === input.codCliente);
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

    // Dashboard consolidado — ambas as unidades
    dashboardConsolidado: protectedProcedure.query(async () => {
      const unidades = await db.getUnidades();
      const hoje = new Date();
      const dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

      const resultados = await Promise.all(
        unidades.map(async (unidade) => {
          if (!unidade.belleToken) {
            return {
              unidadeId: unidade.id,
              nome: unidade.nome,
              corTema: unidade.corTema,
              faturamentoMes: 0,
              totalVendasMes: 0,
              recebimentosMes: 0,
              agendamentosHoje: 0,
              totalAgendamentos: 0,
              semToken: true,
            };
          }
          try {
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
              unidadeId: unidade.id,
              nome: unidade.nome,
              corTema: unidade.corTema,
              faturamentoMes: vendas?.valorTotal ?? 0,
              totalVendasMes: vendas?.totalVendas ?? 0,
              recebimentosMes: recebimentos?.reduce((sum: number, r: any) => sum + (r.valor || 0), 0) ?? 0,
              agendamentosHoje: agendamentos?.filter((a: any) => a.data === fmtDate(hoje)).length ?? 0,
              totalAgendamentos: agendamentos?.length ?? 0,
              semToken: false,
            };
          } catch {
            return {
              unidadeId: unidade.id,
              nome: unidade.nome,
              corTema: unidade.corTema,
              faturamentoMes: 0,
              totalVendasMes: 0,
              recebimentosMes: 0,
              agendamentosHoje: 0,
              totalAgendamentos: 0,
              semToken: false,
            };
          }
        })
      );

      return resultados;
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

    gerar: protectedProcedure.input(z.object({
      id: z.number(),
      prompt: z.string().min(1),
    })).mutation(async ({ input }) => {
      try {
        const { generateImage } = await import("./_core/imageGeneration");
        const result = await generateImage({
          prompt: input.prompt,
        });
        const imageUrl = (result as any)?.data?.[0]?.url || (result as any)?.url || "";
        if (imageUrl) {
          await db.updateLamina(input.id, { imagemUrl: imageUrl, status: "pronto" });
        }
        return { imageUrl };
      } catch (error: any) {
        return { error: error.message };
      }
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

    chat: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      mensagem: z.string().min(1),
      clienteCpf: z.string().optional(),
      clienteNome: z.string().optional(),
      historico: z.array(z.object({
        role: z.string(),
        content: z.string(),
      })).optional(),
    })).mutation(async ({ input }) => {
      // Buscar dados do cliente se CPF fornecido
      let contextoCliente = "";
      const unidade = await db.getUnidadeById(input.unidadeId);

      if (input.clienteCpf && unidade?.belleToken) {
        try {
          const cliente = await belleApi.buscarCliente(unidade.belleToken, unidade.codEstab, {
            cpf: input.clienteCpf,
          });
          const planos = await belleApi.planosCliente(unidade.belleToken, cliente.codigo, unidade.codEstab).catch(() => []);

          contextoCliente = `DADOS DO CLIENTE:
Nome: ${cliente.nome}
CPF: ${cliente.cpf}
Celular: ${cliente.celular}
Email: ${cliente.email}
Rating: ${cliente.rating} estrelas
Temperatura: ${cliente.temperatura}
Tags: ${cliente.tags?.map((t: any) => t.nome).join(", ") || "nenhuma"}
Planos ativos: ${planos.map((p: any) => `${p.nome} (serviços: ${p.servicos?.map((s: any) => `${s.nome} (saldo: ${s.saldoRestante})`).join(", ")})`).join("; ") || "nenhum"}`;
        } catch {
          contextoCliente = "Cliente não encontrado no Belle.";
        }
      }

      const systemPrompt = `Você é o Copilot de Atendimento do Buddha Spa, um spa premium com unidades no Shopping Santa Úrsula e Ribeirão Shopping. Você auxilia atendentes sugerindo respostas e próximas ações baseadas nos dados do cliente do sistema Belle Software.

${contextoCliente ? `\n${contextoCliente}\n` : ""}
Diretrizes:
- Seja cordial, profissional e breve
- Sugira ações práticas (ligar, agendar, oferecer plano, reativar)
- Use os dados do cliente para personalizar sugestões
- Se o cliente tem planos com saldo, sugira usar as sessões
- Se o cliente está frio (sem visitas há muito tempo), sugira campanha de reativação
- Responda sempre em português brasileiro`;

      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...(input.historico || []).map(m => ({ role: m.role as any, content: m.content })),
        { role: "user" as const, content: input.mensagem },
      ];

      try {
        const response = await invokeLLM({ messages });
        const reply = (response as any)?.choices?.[0]?.message?.content || "Não consegui processar a resposta.";
        return { reply };
      } catch (error: any) {
        return { reply: `Erro ao processar: ${error.message}` };
      }
    }),
  }),

  // ===== Mensagens (Inbox) =====
  inbox: router({
    conversas: router({
      list: protectedProcedure.input(z.object({
        unidadeId: z.number().optional(),
        canal: z.enum(["zapi", "buddha_mkt"]).optional(),
      })).query(async ({ input }) => {
        return db.listInboxConversas(input);
      }),

      get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
        const conversa = await db.getInboxConversaById(input.id);
        if (conversa) await db.marcarInboxConversaLida(input.id);
        return conversa;
      }),
    }),

    mensagens: router({
      list: protectedProcedure.input(z.object({
        conversaId: z.number(),
        limit: z.number().default(50),
      })).query(async ({ input }) => {
        return db.listInboxMensagens(input.conversaId, input.limit);
      }),

      enviar: protectedProcedure.input(z.object({
        conversaId: z.number(),
        texto: z.string().min(1),
      })).mutation(async ({ input, ctx }) => {
        if (!(await db.mensageriaEstaAtiva())) {
          throw new Error("Envio de mensagens pausado — kill switch de mensageria ativado por um administrador");
        }
        const conversa = await db.getInboxConversaById(input.conversaId);
        if (!conversa) throw new Error("Conversa não encontrada");

        if (conversa.canal === "zapi") {
          if (!conversa.unidadeId) throw new Error("Conversa sem unidade associada");
          const unidade = await db.getUnidadeById(conversa.unidadeId);
          if (!unidade?.zapiInstanceId || !unidade.zapiToken || !unidade.zapiClientToken) {
            throw new Error("Z-API não configurado para esta unidade");
          }
          try {
            await zapiApi.sendText(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, conversa.telefone, input.texto);
          } catch (error) {
            console.error("[Inbox] Falha ao enviar via Z-API:", error);
          }
        } else {
          try {
            await buddhaMktApi.sendText(conversa.telefone, input.texto);
          } catch (error) {
            console.error("[Inbox] Falha ao enviar via Buddha Mkt:", error);
          }
        }

        await db.insertInboxMensagem({
          conversaId: input.conversaId,
          direcao: "enviada",
          tipo: "texto",
          conteudo: input.texto,
          enviadaPorUserId: ctx.user.id,
        });
        await db.upsertInboxConversa({
          unidadeId: conversa.unidadeId,
          canal: conversa.canal,
          telefone: conversa.telefone,
          nomeContato: conversa.nomeContato ?? undefined,
          ultimaMensagemTexto: input.texto,
        });

        return { success: true };
      }),

      enviarMidia: protectedProcedure.input(z.object({
        conversaId: z.number(),
        tipo: z.enum(["imagem", "audio", "documento"]),
        arquivoBase64: z.string(),
        contentType: z.string(),
        fileName: z.string().optional(),
        legenda: z.string().optional(),
      })).mutation(async ({ input, ctx }) => {
        if (!(await db.mensageriaEstaAtiva())) {
          throw new Error("Envio de mensagens pausado — kill switch de mensageria ativado por um administrador");
        }
        const conversa = await db.getInboxConversaById(input.conversaId);
        if (!conversa) throw new Error("Conversa não encontrada");

        const buffer = Buffer.from(input.arquivoBase64, "base64");
        const { key } = await storagePut(
          `inbox/${input.conversaId}/${input.fileName ?? input.tipo}`,
          buffer,
          input.contentType,
        );
        const url = await storageGetSignedUrl(key);

        if (conversa.canal === "zapi") {
          if (!conversa.unidadeId) throw new Error("Conversa sem unidade associada");
          const unidade = await db.getUnidadeById(conversa.unidadeId);
          if (!unidade?.zapiInstanceId || !unidade.zapiToken || !unidade.zapiClientToken) {
            throw new Error("Z-API não configurado para esta unidade");
          }
          try {
            if (input.tipo === "imagem") {
              await zapiApi.sendImage(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, conversa.telefone, url, input.legenda);
            } else if (input.tipo === "audio") {
              await zapiApi.sendAudio(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, conversa.telefone, url);
            } else if (input.tipo === "documento") {
              await zapiApi.sendDocument(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, conversa.telefone, url, input.fileName);
            }
          } catch (error) {
            console.error("[Inbox] Falha ao enviar mídia via Z-API:", error);
          }
        }
        // Buddha Mkt: envio de mídia via Cloud API exige upload prévio pra
        // biblioteca de mídia da Meta — fica pra quando o canal estiver
        // configurado de verdade.

        await db.insertInboxMensagem({
          conversaId: input.conversaId,
          direcao: "enviada",
          tipo: input.tipo,
          conteudo: input.legenda ?? "",
          metadados: JSON.stringify({ url, legenda: input.legenda, fileName: input.fileName }),
          enviadaPorUserId: ctx.user.id,
        });

        return { success: true, url };
      }),
    }),

    unificarConversas: adminProcedure.input(z.object({
      idOrigemLid: z.number(),
      idDestinoReal: z.number(),
    })).mutation(async ({ input }) => {
      await db.unificarInboxConversas(input.idOrigemLid, input.idDestinoReal);
      return { success: true };
    }),
  }),

  // Kill switch de mensageria: pausa envio de WhatsApp em todas as
  // unidades/canais a partir de um único toggle.
  mensageria: router({
    status: protectedProcedure.query(async () => {
      return { ativa: await db.mensageriaEstaAtiva() };
    }),
    setStatus: adminProcedure.input(z.object({ ativa: z.boolean() })).mutation(async ({ input }) => {
      await db.setConfig("mensageria_ativa", input.ativa ? "true" : "false");
      return { success: true };
    }),
  }),

  // ===== Banco Inter =====
  inter: router({
    /**
     * Verifica se a unidade tem credenciais Inter configuradas.
     */
    status: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      const configurado = !!(unidade?.interClientId && unidade?.interClientSecret && unidade?.interCertificado && unidade?.interChavePrivada);
      const tokenValido = isTokenValid(unidade?.interTokenExpiresAt);
      return { configurado, tokenValido, contaCorrente: unidade?.interContaCorrente ?? null };
    }),

    /**
     * Obtém (ou renova) o token OAuth e o persiste na unidade.
     */
    autenticar: adminProcedure.input(z.object({ unidadeId: z.number() })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.interClientId || !unidade?.interClientSecret || !unidade?.interCertificado || !unidade?.interChavePrivada) {
        throw new Error("Credenciais Banco Inter não configuradas para esta unidade (client_id/secret + certificado)");
      }
      const { accessToken, expiresAt } = await getInterAccessToken(
        unidade.interClientId,
        unidade.interClientSecret,
        { certificado: unidade.interCertificado, chavePrivada: unidade.interChavePrivada },
      );
      await db.updateInterToken(input.unidadeId, accessToken, expiresAt);
      return { success: true };
    }),

    /**
     * Consulta saldo em tempo real (sem persistir).
     */
    saldo: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.interClientId || !unidade?.interClientSecret || !unidade?.interCertificado || !unidade?.interChavePrivada) {
        throw new Error("Credenciais Banco Inter não configuradas (client_id/secret + certificado)");
      }
      const credenciais = { certificado: unidade.interCertificado, chavePrivada: unidade.interChavePrivada };
      // Renovar token se necessário
      let token = unidade.interAccessToken;
      if (!token || !isTokenValid(unidade.interTokenExpiresAt)) {
        const { accessToken, expiresAt } = await getInterAccessToken(
          unidade.interClientId,
          unidade.interClientSecret,
          credenciais,
        );
        await db.updateInterToken(input.unidadeId, accessToken, expiresAt);
        token = accessToken;
      }
      return interApi.consultarSaldo(token, unidade.interContaCorrente, credenciais);
    }),

    /**
     * Lista transações já sincronizadas no banco local.
     */
    extratos: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
      contaId: z.number().optional(),
    })).query(async ({ input }) => {
      return db.listInterExtratos(input.unidadeId, input.dataInicio, input.dataFim, input.contaId);
    }),

    /**
     * Define/corrige manualmente a Descrição de uma transação (a
     * categoria vem por herança) — o "Descrição (manual)" da planilha
     * antiga. dreDescricaoId null volta a transação pra "Pendente".
     * Marca como "confirmada" e tenta aprender uma regra nova a partir
     * da contraparte, aplicando de imediato em outras transações
     * pendentes da mesma unidade (que viram "sugerida", aguardando 1
     * clique de confirmação).
     */
    categorizar: protectedProcedure.input(z.object({
      transacaoId: z.number(),
      dreDescricaoId: z.number().nullable(),
    })).mutation(async ({ input }) => {
      const { regraAprendida } = await db.categorizarManual(input.transacaoId, input.dreDescricaoId);
      return { success: true, regraAprendida };
    }),

    /**
     * Confirma uma sugestão automática sem trocar a categoria — o
     * "tá certo" de 1 clique.
     */
    confirmarSugestao: protectedProcedure.input(z.object({
      transacaoId: z.number(),
    })).mutation(async ({ input }) => {
      await db.confirmarSugestao(input.transacaoId);
      return { success: true };
    }),

    /**
     * Nota livre por transação, separada da categoria — esclarece o
     * caso específico quando a categoria sozinha agrupa vários tipos
     * de lançamento diferentes.
     */
    atualizarNota: protectedProcedure.input(z.object({
      transacaoId: z.number(),
      nota: z.string(),
    })).mutation(async ({ input }) => {
      await db.atualizarNota(input.transacaoId, input.nota);
      return { success: true };
    }),

    /**
     * Reaplica as regras de categorização atuais só nas transações que
     * ainda estão "Pendente" — usado depois que uma regra nova é
     * adicionada, pra não deixar lançamentos já importados presos.
     */
    reprocessarCategorias: protectedProcedure.input(z.object({
      unidadeId: z.number(),
    })).mutation(async ({ input }) => {
      const atualizados = await db.reprocessarPendentes(input.unidadeId);
      return { success: true, atualizados };
    }),

    /**
     * Sincroniza o extrato enriquecido do período com o banco local.
     * Usa paginação por scroll para grandes volumes.
     * Rate limit: 10 req/min — não chamar em loop apertado.
     */
    sincronizar: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.interClientId || !unidade?.interClientSecret || !unidade?.interCertificado || !unidade?.interChavePrivada) {
        throw new Error("Credenciais Banco Inter não configuradas (client_id/secret + certificado)");
      }
      const credenciaisInter = { certificado: unidade.interCertificado, chavePrivada: unidade.interChavePrivada };

      // Renovar token se necessário
      let token = unidade.interAccessToken;
      if (!token || !isTokenValid(unidade.interTokenExpiresAt)) {
        const { accessToken, expiresAt } = await getInterAccessToken(
          unidade.interClientId,
          unidade.interClientSecret,
          credenciaisInter,
        );
        await db.updateInterToken(input.unidadeId, accessToken, expiresAt);
        token = accessToken;
      }

      const contaInter = await db.getOrCreateContaInter(input.unidadeId);
      const regrasDre = await db.listRegrasParaMatch();
      const cnpjsContasDre = await db.listCnpjsDeContas();
      const categorizar = async (t: InterTransacaoCompleta) => {
        if (!contaInter?.id) return { dreDescricaoId: undefined, categorizacaoStatus: "pendente" as const, alerta: null };
        const contraparte = extrairContraparte(t);
        const resultado = await db.categorizarTransacaoAutomaticamente({
          contaId: contaInter.id,
          dataEntrada: dataEntradaDe(t),
          tipoTransacao: t.tipoTransacao,
          titulo: t.titulo,
          descricao: t.descricao,
          valor: parseFloat(t.valor),
          cpfCnpjOrigem: contraparte.cpfCnpjOrigem,
          cpfCnpjDestino: contraparte.cpfCnpjDestino,
          origem: "inter",
          tipoOperacao: (t.tipoOperacao === "D" || t.tipoOperacao === "C") ? t.tipoOperacao : "D",
        }, regrasDre, cnpjsContasDre);
        return { dreDescricaoId: resultado.dreDescricaoId ?? undefined, categorizacaoStatus: resultado.categorizacaoStatus, alerta: resultado.alerta };
      };

      let totalInseridos = 0;
      let totalTransacoes = 0;
      let scrollId: string | undefined;
      let hasMore = true;
      let pagina = 0;

      try {
        // Primeira página com scroll habilitado
        const primeira = await interApi.consultarExtratoCompleto(
          token,
          input.dataInicio,
          input.dataFim,
          {
            tamanhoPagina: 200,
            scrollEnabled: !scrollId,
            contaCorrente: unidade.interContaCorrente,
          },
          credenciaisInter,
        );

        scrollId = primeira.scrollId;
        hasMore = primeira.hasMore ?? false;
        totalTransacoes = primeira.totalElementos;

        const inseridos = await db.upsertInterExtratos(
          input.unidadeId,
          await Promise.all(primeira.transacoes.map(async t => ({
            unidadeId: input.unidadeId,
            contaId: contaInter?.id,
            idTransacao: t.idTransacao,
            dataEntrada: dataEntradaDe(t),
            dataTransacao: t.dataTransacao,
            tipoTransacao: t.tipoTransacao,
            tipoOperacao: (t.tipoOperacao === "D" || t.tipoOperacao === "C") ? t.tipoOperacao : "D",
            valor: t.valor,
            titulo: t.titulo,
            descricao: t.descricao,
            detalhe: (t.detalhes || t.numeroDocumento) ? JSON.stringify({ ...(t.detalhes ?? {}), numeroDocumento: t.numeroDocumento }) : undefined,
            ...extrairContraparte(t),
            contaOrigem: t.contaOrigem,
            contaDestino: t.contaDestino,
            ...(await categorizar(t)),
          }))),
        );
        totalInseridos += inseridos;
        pagina++;

        // Páginas subsequentes via scroll
        while (hasMore && scrollId) {
          const proxima = await interApi.consultarExtratoCompleto(
            token,
            input.dataInicio,
            input.dataFim,
            {
              scrollId,
              tamanhoPagina: 200,
              contaCorrente: unidade.interContaCorrente,
            },
            credenciaisInter,
          );

          scrollId = proxima.scrollId;
          hasMore = proxima.hasMore ?? false;

          const ins = await db.upsertInterExtratos(
            input.unidadeId,
            await Promise.all(proxima.transacoes.map(async t => ({
              unidadeId: input.unidadeId,
              contaId: contaInter?.id,
              idTransacao: t.idTransacao,
              dataEntrada: dataEntradaDe(t),
              dataTransacao: t.dataTransacao,
              tipoTransacao: t.tipoTransacao,
              tipoOperacao: (t.tipoOperacao === "D" || t.tipoOperacao === "C") ? t.tipoOperacao : "D",
              valor: t.valor,
              titulo: t.titulo,
              descricao: t.descricao,
              detalhe: (t.detalhes || t.numeroDocumento) ? JSON.stringify({ ...(t.detalhes ?? {}), numeroDocumento: t.numeroDocumento }) : undefined,
              ...extrairContraparte(t),
              contaOrigem: t.contaOrigem,
              contaDestino: t.contaDestino,
              ...(await categorizar(t)),
            }))),
          );
          totalInseridos += ins;
          pagina++;
        }

        // Registrar log de sincronização — inclui amostras brutas (todos
        // os campos, sem filtro) úteis pra auditar se o mapeamento em
        // InterTransacaoCompleta cobre tudo que a API devolve hoje.
        // `detalhes` muda de formato conforme tipoTransacao (confirmado:
        // Pix recebido ≠ pagamento de boleto), então pega 1 amostra por
        // combinação tipoOperacao+tipoTransacao encontrada na página —
        // Pix enviado (débito) ainda não tinha sido confirmado.
        const vistos = new Set<string>();
        const amostrasPorTipo = primeira.transacoes.filter((t) => {
          const chave = `${t.tipoOperacao}:${t.tipoTransacao}`;
          if (vistos.has(chave)) return false;
          vistos.add(chave);
          return true;
        });
        const amostras = amostrasPorTipo
          .map((t) => `${t.tipoOperacao}/${t.tipoTransacao}: ${JSON.stringify(t).slice(0, 1200)}`)
          .join(" | ");
        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "inter_extrato",
          status: "sucesso",
          registrosProcessados: totalInseridos,
          detalhes: `Período: ${input.dataInicio} a ${input.dataFim}. Total API: ${totalTransacoes}. Novos: ${totalInseridos}. Páginas: ${pagina}.${amostras ? ` Amostra bruta: ${amostras}` : ""}`,
        });

        return { success: true, totalInseridos, totalTransacoes, paginas: pagina };
      } catch (error: any) {
        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "inter_extrato",
          status: "erro",
          registrosProcessados: totalInseridos,
          detalhes: error.message,
        });
        throw error;
      }
    }),

    /**
     * Salva as credenciais OAuth do Banco Inter para a unidade.
     */
    salvarCredenciais: adminProcedure.input(z.object({
      unidadeId: z.number(),
      interClientId: z.string().min(1),
      interClientSecret: z.string().min(1),
      interCertificado: z.string().min(1),
      interChavePrivada: z.string().min(1),
      interContaCorrente: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { unidadeId, ...dados } = input;
      await db.updateUnidade(unidadeId, dados);
      return { success: true };
    }),

    /**
     * Importa transações de um extrato em CSV (formato: data, descrição,
     * tipo C/D, valor). Usa o mesmo dedup por idTransacao do sync do
     * Inter — reimportar o mesmo arquivo não duplica linhas, já que o
     * idTransacao é derivado do conteúdo da própria linha.
     */
    importarCsv: protectedProcedure.input(z.object({
      contaId: z.number(),
      linhas: z.array(z.object({
        data: z.string(), // AAAA-MM-DD
        descricao: z.string(),
        tipo: z.enum(["C", "D"]),
        valor: z.number().positive(),
      })).min(1),
    })).mutation(async ({ input }) => {
      const conta = await db.getContaById(input.contaId);
      if (!conta) throw new Error("Conta não encontrada");

      const regras = await db.listRegrasParaMatch();
      const cnpjsContas = await db.listCnpjsDeContas();
      const transacoes = await Promise.all(input.linhas.map(async (linha, i) => {
        const idTransacao = `csv:${input.contaId}:${linha.data}:${linha.tipo}:${linha.valor}:${i}`;
        const resultado = await db.categorizarTransacaoAutomaticamente({
          contaId: input.contaId,
          dataEntrada: linha.data,
          titulo: linha.descricao,
          valor: linha.valor,
          origem: "csv",
          tipoOperacao: linha.tipo,
        }, regras, cnpjsContas);
        return {
          unidadeId: conta.unidadeId,
          contaId: input.contaId,
          idTransacao,
          dataEntrada: linha.data,
          tipoOperacao: linha.tipo,
          valor: linha.valor.toFixed(2),
          titulo: linha.descricao,
          origem: "csv" as const,
          dreDescricaoId: resultado.dreDescricaoId,
          categorizacaoStatus: resultado.categorizacaoStatus,
          alerta: resultado.alerta,
        };
      }));
      const inseridos = await db.upsertInterExtratos(conta.unidadeId, transacoes);
      await db.createSyncLog({
        unidadeId: conta.unidadeId,
        tipo: "csv_extrato",
        status: "sucesso",
        registrosProcessados: inseridos,
        detalhes: `Importação manual via CSV na conta "${conta.nome}". ${input.linhas.length} linha(s) no arquivo, ${inseridos} nova(s).`,
      });
      return { success: true, totalInseridos: inseridos, totalLinhas: input.linhas.length };
    }),

    /**
     * Importa transações a partir do PDF "Extrato completo" do Banco
     * Inter (mesmo modelo exportado pelo app/site do banco). Extrai o
     * texto do PDF no servidor e aplica o parser de
     * server/interExtratoPdfParser.ts — mesmo dedup por idTransacao dos
     * outros dois modos de importação.
     */
    importarPdf: protectedProcedure.input(z.object({
      contaId: z.number(),
      pdfBase64: z.string().min(1),
    })).mutation(async ({ input }) => {
      const conta = await db.getContaById(input.contaId);
      if (!conta) throw new Error("Conta não encontrada");

      const buffer = Buffer.from(input.pdfBase64, "base64");
      const parser = new PDFParse({ data: buffer });
      let texto: string;
      try {
        const resultado = await parser.getText();
        texto = resultado.text;
      } finally {
        await parser.destroy();
      }

      const linhas = parseExtratoInterPdf(texto);
      if (linhas.length === 0) {
        throw new Error("Nenhuma transação encontrada no PDF. Confirme que é um extrato completo do Banco Inter.");
      }

      const regras = await db.listRegrasParaMatch();
      const cnpjsContas = await db.listCnpjsDeContas();
      const transacoes = await Promise.all(linhas.map(async (linha, i) => {
        const resultado = await db.categorizarTransacaoAutomaticamente({
          contaId: input.contaId,
          dataEntrada: linha.data,
          titulo: linha.descricao,
          valor: linha.valor,
          origem: "pdf",
          tipoOperacao: linha.tipo,
        }, regras, cnpjsContas);
        return {
          unidadeId: conta.unidadeId,
          contaId: input.contaId,
          idTransacao: `pdf:${input.contaId}:${linha.data}:${linha.tipo}:${linha.valor}:${i}`,
          dataEntrada: linha.data,
          tipoOperacao: linha.tipo,
          valor: linha.valor.toFixed(2),
          titulo: linha.descricao,
          origem: "pdf" as const,
          dreDescricaoId: resultado.dreDescricaoId,
          categorizacaoStatus: resultado.categorizacaoStatus,
          alerta: resultado.alerta,
        };
      }));

      const inseridos = await db.upsertInterExtratos(conta.unidadeId, transacoes);
      await db.createSyncLog({
        unidadeId: conta.unidadeId,
        tipo: "pdf_extrato",
        status: "sucesso",
        registrosProcessados: inseridos,
        detalhes: `Importação manual via PDF (Banco Inter) na conta "${conta.nome}". ${linhas.length} transação(ões) no arquivo, ${inseridos} nova(s).`,
      });
      return { success: true, totalInseridos: inseridos, totalLinhas: linhas.length };
    }),

    /**
     * Importa transações de um extrato em OFX (Open Financial Exchange,
     * exportação padrão de banco). Mais confiável que CSV/PDF porque o
     * FITID já vem do banco — usamos ele direto como idTransacao, sem
     * precisar de hash sintético.
     */
    importarOfx: protectedProcedure.input(z.object({
      contaId: z.number(),
      ofxTexto: z.string().min(1),
    })).mutation(async ({ input }) => {
      const conta = await db.getContaById(input.contaId);
      if (!conta) throw new Error("Conta não encontrada");

      const linhas = parseExtratoOfx(input.ofxTexto);
      if (linhas.length === 0) {
        throw new Error("Nenhuma transação encontrada no OFX. Confirme que o arquivo é um extrato bancário válido.");
      }

      const regras = await db.listRegrasParaMatch();
      const cnpjsContas = await db.listCnpjsDeContas();
      const transacoes = await Promise.all(linhas.map(async (linha) => {
        const resultado = await db.categorizarTransacaoAutomaticamente({
          contaId: input.contaId,
          dataEntrada: linha.data,
          tipoTransacao: linha.trnType,
          titulo: linha.descricao,
          valor: linha.valor,
          origem: "ofx",
          tipoOperacao: linha.tipo,
        }, regras, cnpjsContas);
        return {
          unidadeId: conta.unidadeId,
          contaId: input.contaId,
          idTransacao: `ofx:${input.contaId}:${linha.fitid}`,
          dataEntrada: linha.data,
          tipoTransacao: linha.trnType ?? undefined,
          tipoOperacao: linha.tipo,
          valor: linha.valor.toFixed(2),
          titulo: linha.descricao,
          origem: "ofx" as const,
          dreDescricaoId: resultado.dreDescricaoId,
          categorizacaoStatus: resultado.categorizacaoStatus,
          alerta: resultado.alerta,
        };
      }));

      const inseridos = await db.upsertInterExtratos(conta.unidadeId, transacoes);

      // Saldo do <LEDGERBAL> — só grava pra conta manual (a inter_oauth
      // já tem saldo ao vivo via inter.saldo, não precisa do snapshot do OFX).
      if (conta.tipo !== "inter_oauth") {
        const saldoOfx = parseSaldoOfx(input.ofxTexto);
        if (saldoOfx) {
          await db.atualizarSaldoImportado(input.contaId, saldoOfx.saldo.toFixed(2), saldoOfx.dataApuracao);
        }
      }

      await db.createSyncLog({
        unidadeId: conta.unidadeId,
        tipo: "ofx_extrato",
        status: "sucesso",
        registrosProcessados: inseridos,
        detalhes: `Importação manual via OFX na conta "${conta.nome}". ${linhas.length} transação(ões) no arquivo, ${inseridos} nova(s).`,
      });
      return { success: true, totalInseridos: inseridos, totalLinhas: linhas.length };
    }),
  }),

  // ===== Sicredi =====
  // PROVISÓRIO (ver server/sicrediApi.ts): sem adesão aprovada no Portal
  // do Desenvolvedor ainda, então o formato do payload de extrato não
  // está confirmado. O sync abaixo já grava uma amostra bruta da
  // resposta no log — assim que rodar contra credencial real pela
  // primeira vez, uso esse log pra corrigir o mapeamento (mesmo processo
  // usado pro Inter em InterTransacaoCompleta).
  sicredi: router({
    status: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      const configurado = !!(unidade?.sicrediClientId && unidade?.sicrediClientSecret && unidade?.sicrediCertificado && unidade?.sicrediChavePrivada);
      const tokenValido = isSicrediTokenValid(unidade?.sicrediTokenExpiresAt);
      return { configurado, tokenValido, cooperativa: unidade?.sicrediCooperativa ?? null, agencia: unidade?.sicrediAgencia ?? null, conta: unidade?.sicrediConta ?? null };
    }),

    autenticar: adminProcedure.input(z.object({ unidadeId: z.number() })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.sicrediClientId || !unidade?.sicrediClientSecret || !unidade?.sicrediCertificado || !unidade?.sicrediChavePrivada) {
        throw new Error("Credenciais Sicredi não configuradas para esta unidade (client_id/secret + certificado)");
      }
      const { accessToken, expiresAt } = await getSicrediAccessToken(
        unidade.sicrediClientId,
        unidade.sicrediClientSecret,
        { certificado: unidade.sicrediCertificado, chavePrivada: unidade.sicrediChavePrivada },
      );
      await db.updateSicrediToken(input.unidadeId, accessToken, expiresAt);
      return { success: true };
    }),

    saldo: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.sicrediClientId || !unidade?.sicrediClientSecret || !unidade?.sicrediCertificado || !unidade?.sicrediChavePrivada) {
        throw new Error("Credenciais Sicredi não configuradas (client_id/secret + certificado)");
      }
      const credenciais = { certificado: unidade.sicrediCertificado, chavePrivada: unidade.sicrediChavePrivada };
      let token = unidade.sicrediAccessToken;
      if (!token || !isSicrediTokenValid(unidade.sicrediTokenExpiresAt)) {
        const { accessToken, expiresAt } = await getSicrediAccessToken(unidade.sicrediClientId, unidade.sicrediClientSecret, credenciais);
        await db.updateSicrediToken(input.unidadeId, accessToken, expiresAt);
        token = accessToken;
      }
      return sicrediApi.consultarSaldo(token, { cooperativa: unidade.sicrediCooperativa, agencia: unidade.sicrediAgencia, numeroConta: unidade.sicrediConta }, credenciais);
    }),

    sincronizar: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.sicrediClientId || !unidade?.sicrediClientSecret || !unidade?.sicrediCertificado || !unidade?.sicrediChavePrivada) {
        throw new Error("Credenciais Sicredi não configuradas (client_id/secret + certificado)");
      }
      const credenciais = { certificado: unidade.sicrediCertificado, chavePrivada: unidade.sicrediChavePrivada };

      let token = unidade.sicrediAccessToken;
      if (!token || !isSicrediTokenValid(unidade.sicrediTokenExpiresAt)) {
        const { accessToken, expiresAt } = await getSicrediAccessToken(unidade.sicrediClientId, unidade.sicrediClientSecret, credenciais);
        await db.updateSicrediToken(input.unidadeId, accessToken, expiresAt);
        token = accessToken;
      }

      const contaSicredi = await db.getOrCreateContaSicredi(input.unidadeId);
      const regrasDre = await db.listRegrasParaMatch();
      const cnpjsContasDre = await db.listCnpjsDeContas();

      try {
        const resposta = await sicrediApi.consultarExtrato(
          token,
          input.dataInicio,
          input.dataFim,
          { cooperativa: unidade.sicrediCooperativa, agencia: unidade.sicrediAgencia, numeroConta: unidade.sicrediConta },
          credenciais,
        );

        const transacoes = await Promise.all(resposta.transacoes.map(async (t) => {
          const resultado = contaSicredi?.id
            ? await db.categorizarTransacaoAutomaticamente({
              contaId: contaSicredi.id,
              dataEntrada: t.data,
              tipoTransacao: t.historico ?? "",
              titulo: t.descricao,
              descricao: t.historico ?? "",
              valor: parseFloat(t.valor),
              origem: "sicredi",
              tipoOperacao: t.tipoOperacao,
            }, regrasDre, cnpjsContasDre)
            : { dreDescricaoId: undefined, categorizacaoStatus: "pendente" as const };
          return {
            unidadeId: input.unidadeId,
            contaId: contaSicredi?.id,
            idTransacao: t.documento || `sicredi:${t.data}:${t.tipoOperacao}:${t.descricao.slice(0, 60)}:${t.valor}`,
            dataEntrada: t.data,
            tipoTransacao: t.historico,
            tipoOperacao: t.tipoOperacao,
            valor: t.valor,
            titulo: t.descricao,
            descricao: t.historico,
            origem: "sicredi" as const,
            dreDescricaoId: resultado.dreDescricaoId ?? undefined,
            categorizacaoStatus: resultado.categorizacaoStatus,
          };
        }));

        const inseridos = await db.upsertInterExtratos(input.unidadeId, transacoes);

        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "sicredi_extrato",
          status: "sucesso",
          registrosProcessados: inseridos,
          detalhes: `Período: ${input.dataInicio} a ${input.dataFim}. Total API: ${resposta.transacoes.length}. Novos: ${inseridos}. Amostra bruta: ${JSON.stringify(resposta).slice(0, 2000)}`,
        });

        return { success: true, totalInseridos: inseridos, totalTransacoes: resposta.transacoes.length };
      } catch (error: any) {
        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "sicredi_extrato",
          status: "erro",
          registrosProcessados: 0,
          detalhes: error.message,
        });
        throw error;
      }
    }),
  }),

  // ===== Contas (bancárias/caixa, por unidade) =====
  contas: router({
    /**
     * Lista as contas da unidade, garantindo que a conta "Banco Inter"
     * sempre apareça (auto-provisionada na primeira chamada).
     */
    list: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      await db.getOrCreateContaInter(input.unidadeId);
      await db.getOrCreateContaCaixaFisico(input.unidadeId);
      await db.ensureContasPadrao(input.unidadeId);
      return db.listContas(input.unidadeId);
    }),

    create: adminProcedure.input(z.object({
      unidadeId: z.number(),
      nome: z.string().min(1),
      agencia: z.string().optional(),
      numeroConta: z.string().optional(),
      cnpj: z.string().optional(),
      saldoInicial: z.number().optional(),
      saldoInicialEm: z.string().optional(), // AAAA-MM-DD
    })).mutation(async ({ input }) => {
      const { unidadeId, saldoInicial, ...resto } = input;
      const id = await db.createConta(unidadeId, {
        ...resto,
        saldoInicial: saldoInicial !== undefined ? saldoInicial.toFixed(2) : undefined,
      });
      return { success: true, id };
    }),

    atualizar: adminProcedure.input(z.object({
      id: z.number(),
      nome: z.string().min(1),
      agencia: z.string().optional(),
      numeroConta: z.string().optional(),
      cnpj: z.string().optional(),
      saldoInicial: z.number().optional(),
      saldoInicialEm: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { id, saldoInicial, ...resto } = input;
      await db.atualizarConta(id, {
        ...resto,
        saldoInicial: saldoInicial !== undefined ? saldoInicial.toFixed(2) : undefined,
      });
      return { success: true };
    }),

    /**
     * Saldo real da conta no início do período exibido — usado pra
     * montar a coluna Saldo (acumulado) na tabela. Null se a conta não
     * tem saldo inicial cadastrado.
     */
    saldoNaData: protectedProcedure.input(z.object({
      contaId: z.number(),
      data: z.string(),
    })).query(async ({ input }) => {
      return db.calcularSaldoNaData(input.contaId, input.data);
    }),

    /**
     * Sincroniza o extrato da conta Mercado Pago (relatório "Dinheiro
     * liberado" — assíncrono: gera, espera ficar pronto, baixa o CSV).
     * Diferente de adquirentes.sincronizarMercadoPago: aqui é o
     * movimento da conta (dinheiro entrando/saindo do saldo), não a
     * venda em si.
     */
    sincronizarMercadoPago: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.mpAccessToken) {
        throw new Error("Mercado Pago não configurado (falta o Access Token)");
      }

      let diagnostico = "";
      try {
        // Confirmado com payload real: nem o "status" da criação
        // ("pending") nem o da listagem ("enabled", sempre — não muda
        // quando fica pronto) indicam se o arquivo já pode ser baixado.
        // A única forma confiável é tentar baixar de verdade. O
        // end_date que a API devolve também pode vir com o dia seguinte
        // (fuso: 23:59:59Z do dia pedido vira madrugada UTC do dia
        // depois), então a comparação de período tolera esse +1 dia.
        // O MP retorna begin_date/end_date em UTC (ex.: 2026-07-31T03:00:00Z
        // = 2026-08-01 00:00 BRT). Por isso a comparação precisa aceitar
        // início um dia antes e fim um dia depois do período solicitado.
        const diaAnterior = (data: string) => {
          const d = new Date(`${data}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() - 1);
          return d.toISOString().slice(0, 10);
        };
        const diaSeguinte = (data: string) => {
          const d = new Date(`${data}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() + 1);
          return d.toISOString().slice(0, 10);
        };
        const mesmoPeriodo = (r: { begin_date?: string; end_date?: string }) => {
          const inicio = (r.begin_date ?? "").slice(0, 10);
          const fim = (r.end_date ?? "").slice(0, 10);
          return (inicio === input.dataInicio || inicio === diaAnterior(input.dataInicio))
            && (fim === input.dataFim || fim === diaSeguinte(input.dataFim));
        };

        const tentarBaixar = async (nome: string): Promise<string | undefined> => {
          try {
            return await baixarRelatorioLiberado(unidade.mpAccessToken!, nome);
          } catch (erroDownload: any) {
            diagnostico += ` | Download de "${nome}" falhou: ${erroDownload.message}`;
            return undefined;
          }
        };

        // Tenta baixar o relatório mais recente do período imediatamente.
        // O MP retorna file_name mesmo com download_date=null — o arquivo
        // já está disponível para download, o campo de status não é confiável.
        let lista = await listarRelatoriosLiberados(unidade.mpAccessToken);
        const doPeriodo = lista.filter((r) => mesmoPeriodo(r) && r.file_name);
        let csvTexto: string | undefined;
        // Tenta baixar do mais recente para o mais antigo
        for (const r of doPeriodo) {
          csvTexto = await tentarBaixar(r.file_name!);
          if (csvTexto) break;
        }

        if (!csvTexto) {
          // Nenhum relatório existente do período funcionou — cria um novo
          const criacao = await criarRelatorioLiberado(unidade.mpAccessToken, input.dataInicio, input.dataFim);
          diagnostico += ` | Criação: status ${criacao.status} — ${criacao.corpo.slice(0, 500)}`;
          // Polling: aguarda 60s, tenta baixar. Se não tiver, aguarda
          // mais 60s e tenta novamente. Se ainda não der, erro.
          for (let tentativa = 1; !csvTexto && tentativa <= 2; tentativa++) {
            await new Promise((resolve) => setTimeout(resolve, 60000));
            lista = await listarRelatoriosLiberados(unidade.mpAccessToken);
            const novos = lista.filter((r) => mesmoPeriodo(r) && r.file_name);
            for (const r of novos) {
              csvTexto = await tentarBaixar(r.file_name!);
              if (csvTexto) break;
            }
            diagnostico += ` | Tentativa ${tentativa} (60s): ${csvTexto ? 'CSV baixado' : 'ainda não pronto'}`;
          }
        }

        if (!csvTexto) {
          await db.createSyncLog({
            unidadeId: input.unidadeId,
            tipo: "mercadopago_extrato_diagnostico",
            status: "erro",
            registrosProcessados: 0,
            detalhes: `Nenhum arquivo baixável encontrado.${diagnostico}`,
          });
          throw new Error("O relatório do Mercado Pago não ficou pronto após 2 minutos. Tente novamente em alguns instantes. Diagnóstico salvo no log (tipo mercadopago_extrato_diagnostico).");
        }
        const linhasCsv = parseRelatorioLiberadoMp(csvTexto);

        const contaMp = await db.getOrCreateContaMercadoPago(input.unidadeId);
        const inseridos = await db.upsertInterExtratos(
          input.unidadeId,
          linhasCsv.map((l) => ({
            unidadeId: input.unidadeId,
            contaId: contaMp?.id,
            idTransacao: l.idTransacao,
            dataEntrada: l.dataEntrada,
            tipoTransacao: l.tipoTransacao,
            tipoOperacao: l.tipoOperacao,
            valor: l.valor,
            titulo: l.titulo,
            descricao: l.descricao,
            origem: "mercadopago" as const,
          })),
        );

        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "mercadopago_extrato",
          status: "sucesso",
          registrosProcessados: inseridos,
          detalhes: `Período: ${input.dataInicio} a ${input.dataFim}. Linhas no CSV: ${linhasCsv.length}. Novos: ${inseridos}. Amostra CSV (500 chars): ${csvTexto.slice(0, 500)}`,
        });

        return { success: true, totalInseridos: inseridos, totalNoCsv: linhasCsv.length };
      } catch (error: any) {
        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "mercadopago_extrato",
          status: "erro",
          registrosProcessados: 0,
          detalhes: error.message,
        });
        throw error;
      }
    }),

    /**
     * Sincroniza o Caixa Físico (planilha Google Sheets da unidade —
     * RBS ou SSU) direto pra inter_extratos, junto de todas as outras
     * contas — assim participa do Consolidado normalmente. Lê sempre
     * os últimos 60 lançamentos da planilha; o filtro de período da
     * tela só afeta a apresentação, não a busca.
     */
    sincronizarCaixaFisico: protectedProcedure.input(z.object({
      unidadeId: z.number(),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade) throw new Error("Unidade não encontrada");

      try {
        const isRbs = unidade.slug.includes("ribeirao") || unidade.slug.includes("rbs");
        const spreadsheetId = isRbs ? SPREADSHEET_IDS.rbs : SPREADSHEET_IDS.ssu;
        const aba = isRbs ? SPREADSHEET_ABAS.rbs : SPREADSHEET_ABAS.ssu;
        const linhas = await lerCaixaFisicoSheet(spreadsheetId, aba, 9999, "2025-12-01");

        const contaCaixa = await db.getOrCreateContaCaixaFisico(input.unidadeId);
        const inseridos = await db.upsertInterExtratos(
          input.unidadeId,
          linhas.map((l) => ({
            unidadeId: input.unidadeId,
            contaId: contaCaixa?.id,
            // Sintético — a planilha não tem um ID de transação próprio.
            // Inclui valor no id pra não colidir quando há mais de um
            // lançamento igual (ocorrência+tipo) no mesmo dia.
            idTransacao: `caixa:${l.data}:${l.tipoOperacao}:${l.ocorrencia.slice(0, 60)}:${l.valor}`,
            dataEntrada: l.data,
            tipoOperacao: l.tipoOperacao,
            valor: l.valor.toFixed(2),
            titulo: l.ocorrencia,
            descricao: l.conferidoPor ? `Conferido por: ${l.conferidoPor}` : undefined,
            origem: "caixa_fisico" as const,
          })),
        );

        // Diagnóstico: intervalo de datas encontrado — se um dia vier
        // muito antigo (ex.: meses atrás), é sinal de que a "cauda" da
        // planilha ainda não está pegando os lançamentos certos.
        const datas = linhas.map((l) => l.data).sort();
        const intervalo = datas.length > 0 ? `${datas[0]} a ${datas[datas.length - 1]}` : "nenhuma data";

        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "caixa_fisico",
          status: "sucesso",
          registrosProcessados: inseridos,
          detalhes: `Lidos: ${linhas.length}. Novos: ${inseridos}. Intervalo de datas: ${intervalo}.`,
        });
        return { success: true, totalLidos: linhas.length, totalInseridos: inseridos };
      } catch (error: any) {
        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "caixa_fisico",
          status: "erro",
          registrosProcessados: 0,
          detalhes: error.message,
        });
        throw error;
      }
    }),
  }),

  // ===== Comanda Recepção (conciliação semanal de caixa) =====
  comandaRecepcao: router({
    sincronizar: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      ano: z.number(),
      mes: z.number().min(1).max(12),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade) throw new Error("Unidade não encontrada");

      const isRbs = unidade.slug.includes("ribeirao") || unidade.slug.includes("rbs");
      const slug = isRbs ? "rbs" as const : "ssu" as const;
      const spreadsheetId = SPREADSHEET_IDS_COMANDA[slug];

      try {
        const linhas = await lerComandaConsolidadoSheet(spreadsheetId, slug, input.ano, input.mes);
        const gravados = await db.upsertComandaDiaria(input.unidadeId, linhas);

        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "comanda_recepcao",
          status: "sucesso",
          registrosProcessados: gravados,
          detalhes: `Mês ${input.mes}/${input.ano}. Dias lidos: ${linhas.length}.`,
        });
        return { success: true, totalDias: linhas.length };
      } catch (error: any) {
        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "comanda_recepcao",
          status: "erro",
          registrosProcessados: 0,
          detalhes: error.message,
        });
        throw error;
      }
    }),

    detalhe: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    })).query(async ({ input }) => {
      return db.detalheContasBancariasPorDia(input.unidadeId, input.dataInicio, input.dataFim);
    }),

    resumo: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    })).query(async ({ input }) => {
      const [comanda, contas] = await Promise.all([
        db.listComandaDiaria(input.unidadeId, input.dataInicio, input.dataFim),
        db.resumoContasBancariasPorDia(input.unidadeId, input.dataInicio, input.dataFim),
      ]);

      const porData = new Map(comanda.map((c) => [c.data, c]));
      const datas = Array.from(new Set([...Array.from(porData.keys()), ...Array.from(contas.keys())])).sort();

      return datas.map((data) => {
        const c = porData.get(data);
        const b = contas.get(data);
        const comandaDia = {
          dinheiro: Number(c?.dinheiro ?? 0),
          cartaoDebito: Number(c?.cartaoDebito ?? 0),
          cartaoCredito: Number(c?.cartaoCredito ?? 0),
          pix: Number(c?.pix ?? 0),
        };
        const contasDia = {
          dinheiro: b?.dinheiro ?? 0,
          cartaoDebito: b?.cartaoDebito ?? 0,
          cartaoCredito: b?.cartaoCredito ?? 0,
          pix: b?.pix ?? 0,
        };
        return {
          data,
          comanda: comandaDia,
          contasBancarias: contasDia,
          diferenca: {
            dinheiro: comandaDia.dinheiro - contasDia.dinheiro,
            cartaoDebito: comandaDia.cartaoDebito - contasDia.cartaoDebito,
            cartaoCredito: comandaDia.cartaoCredito - contasDia.cartaoCredito,
            pix: comandaDia.pix - contasDia.pix,
          },
        };
      });
    }),
  }),

  // ===== Plano de contas do DRE =====
  dreCategorias: router({
    list: protectedProcedure.query(async () => {
      return db.listDreCategorias();
    }),

    criar: adminProcedure.input(z.object({
      nome: z.string().min(1),
      secao: z.enum(["receitas", "impostos", "custos_diretos", "despesas_pessoal", "marketing", "despesas_administrativas", "despesas_financeiras", "devolucoes", "excluido"]),
    })).mutation(async ({ input }) => {
      const id = await db.criarDreCategoria(input.nome, input.secao);
      return { success: true, id };
    }),

    atualizar: adminProcedure.input(z.object({
      id: z.number(),
      nome: z.string().min(1).optional(),
      secao: z.enum(["receitas", "impostos", "custos_diretos", "despesas_pessoal", "marketing", "despesas_administrativas", "despesas_financeiras", "devolucoes", "excluido"]).optional(),
    })).mutation(async ({ input }) => {
      const { id, ...dados } = input;
      await db.atualizarDreCategoria(id, dados);
      return { success: true };
    }),

    /**
     * Exclui em cascata (todas as Descrições da categoria + regras que
     * apontam pra elas) — lançamentos afetados voltam pra "Pendente".
     * Bloqueia se a categoria tiver alguma Descrição usada internamente
     * pelo sistema (identificada por ter uma `chave` não nula).
     */
    excluir: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      return db.excluirDreCategoria(input.id);
    }),
  }),

  // ===== Descrições (nível intermediário entre Categoria e lançamento) =====
  dreDescricoes: router({
    list: protectedProcedure.query(async () => {
      return db.listDreDescricoes();
    }),

    listPorCategoria: protectedProcedure.input(z.object({
      dreCategoriaId: z.number(),
    })).query(async ({ input }) => {
      return db.listDreDescricoesPorCategoria(input.dreCategoriaId);
    }),

    criar: protectedProcedure.input(z.object({
      nome: z.string().min(1),
      dreCategoriaId: z.number(),
    })).mutation(async ({ input }) => {
      const id = await db.criarDreDescricao(input.nome, input.dreCategoriaId);
      return { success: true, id };
    }),

    atualizar: protectedProcedure.input(z.object({
      id: z.number(),
      nome: z.string().min(1).optional(),
      dreCategoriaId: z.number().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...dados } = input;
      await db.atualizarDreDescricao(id, dados);
      return { success: true };
    }),

    /**
     * Exclui a Descrição — lançamentos já categorizados com ela (extrato
     * e adquirente) voltam pra "Pendente", e as regras que apontavam
     * pra ela são removidas junto. Bloqueia as 4 de "Receitas de Vendas"
     * e "Excluído do DRE" (usadas internamente).
     */
    excluir: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      return db.excluirDreDescricao(input.id);
    }),
  }),

  // ===== Regras de categorização automática (tela Parâmetros) =====
  dreRegras: router({
    list: protectedProcedure.query(async () => {
      return db.listDreRegrasCompleto();
    }),

    criar: adminProcedure.input(z.object({
      padrao: z.string().min(1),
      dreDescricaoId: z.number(),
      valorMin: z.number().optional(),
      valorMax: z.number().optional(),
      alertaSeRepetirNoMes: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      const id = await db.criarDreRegra({
        ...input,
        valorMin: input.valorMin?.toFixed(2),
        valorMax: input.valorMax?.toFixed(2),
      });
      return { success: true, id };
    }),

    atualizar: adminProcedure.input(z.object({
      id: z.number(),
      padrao: z.string().min(1).optional(),
      dreDescricaoId: z.number().optional(),
      valorMin: z.number().nullable().optional(),
      valorMax: z.number().nullable().optional(),
      alertaSeRepetirNoMes: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      const { id, valorMin, valorMax, ...resto } = input;
      await db.atualizarDreRegra(id, {
        ...resto,
        valorMin: valorMin === null ? undefined : valorMin?.toFixed(2),
        valorMax: valorMax === null ? undefined : valorMax?.toFixed(2),
      });
      return { success: true };
    }),

    ativarDesativar: adminProcedure.input(z.object({
      id: z.number(),
      ativa: z.boolean(),
    })).mutation(async ({ input }) => {
      await db.ativarDesativarDreRegra(input.id, input.ativa);
      return { success: true };
    }),

    excluir: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.excluirDreRegra(input.id);
      return { success: true };
    }),
  }),

  // ===== Adquirentes (vendas de maquininha — sub-seção Adquirentes) =====
  adquirentes: router({
    status: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      return { mercadoPagoConfigurado: !!unidade?.mpAccessToken };
    }),

    vendas: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
      adquirente: z.enum(["mercadopago", "interpag"]).optional(),
    })).query(async ({ input }) => {
      return db.listAdquirenteVendas(input.unidadeId, input.dataInicio, input.dataFim, input.adquirente);
    }),

    /**
     * Puxa vendas do Mercado Pago via /v1/payments/search. Só crédito/
     * débito/pix aprovados chegam com date_approved preenchido — usamos
     * isso como filtro de período (mesmo padrão de dataEntrada no Inter).
     */
    sincronizarMercadoPago: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.mpAccessToken) {
        throw new Error("Mercado Pago não configurado (falta o Access Token)");
      }

      let totalInseridos = 0;
      let totalNaApi = 0;
      let offset = 0;
      const limit = 50;
      let amostraBruta: string | null = null;

      try {
        while (true) {
          const pagina = await consultarPagamentos(unidade.mpAccessToken, input.dataInicio, input.dataFim, offset, limit);
          totalNaApi = pagina.paging.total;
          if (offset === 0 && pagina.results.length > 0) {
            // Amostra focada em TODAS as vendas da 1ª página (não só a
            // primeira) — o objeto de pagamento completo tem tanta coisa
            // (payer, additional_info, order...) que fee_details ficaria
            // truncado se eu logasse tudo. Precisa de mais de uma amostra
            // porque o fee_details muda conforme parcelas/tipo — já vi
            // 1 caso onde bruto - taxa não bate com net_received_amount,
            // então tem algo em outra transação que ainda não vi.
            amostraBruta = JSON.stringify(pagina.results.map((p) => ({
              id: p.id,
              installments: p.installments,
              transaction_amount: p.transaction_amount,
              fee_details: p.fee_details,
              transaction_details: p.transaction_details,
              money_release_date: p.money_release_date,
              financing_group: p.financing_group,
            }))).slice(0, 4000);
          }

          const linhas = pagina.results.map((p) => {
            const { bruto, taxa, antecipacao, liquido } = extrairValoresMp(p);
            return {
              unidadeId: input.unidadeId,
              adquirente: "mercadopago" as const,
              idTransacaoExterno: String(p.id),
              dataHora: (p.date_approved ?? "").replace("T", " ").slice(0, 19),
              tipo: p.payment_type_id,
              status: p.status,
              parcela: p.installments ? `1/${p.installments}` : undefined,
              bandeira: p.payment_method_id,
              valorBruto: bruto?.toFixed(2),
              valorTaxa: taxa?.toFixed(2),
              valorAntecipacao: antecipacao?.toFixed(2),
              valorLiquido: liquido?.toFixed(2),
              dataPagamento: p.money_release_date?.slice(0, 10),
            };
          });

          totalInseridos += await db.upsertAdquirenteVendas(input.unidadeId, linhas);
          offset += limit;
          if (offset >= totalNaApi) break;
        }

        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "mercadopago_vendas",
          status: "sucesso",
          registrosProcessados: totalInseridos,
          detalhes: `Período: ${input.dataInicio} a ${input.dataFim}. Total API: ${totalNaApi}. Novos: ${totalInseridos}.${amostraBruta ? ` Amostra bruta: ${amostraBruta}` : ""}`,
        });

        return { success: true, totalInseridos, totalNaApi };
      } catch (error: any) {
        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "mercadopago_vendas",
          status: "erro",
          registrosProcessados: totalInseridos,
          detalhes: error.message,
        });
        throw error;
      }
    }),

    /**
     * Importa o CSV exportado do Portal Interpag (schedules) — formato:
     * ID Transação;Data e Hora;Tipo;Status;Parcela;Bandeira;Valor bruto;
     * Valor taxa;Valor antecipação;Valor líquido;Data pagamento
     */
    importarCsvInterpag: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      linhas: z.array(z.object({
        idTransacaoExterno: z.string(),
        dataHora: z.string(),
        tipo: z.string().optional(),
        status: z.string().optional(),
        parcela: z.string().optional(),
        bandeira: z.string().optional(),
        valorBruto: z.number().optional(),
        valorTaxa: z.number().optional(),
        valorAntecipacao: z.number().optional(),
        valorLiquido: z.number().optional(),
        dataPagamento: z.string().optional(),
      })),
    })).mutation(async ({ input }) => {
      const linhas = input.linhas.map((l) => ({
        unidadeId: input.unidadeId,
        adquirente: "interpag" as const,
        idTransacaoExterno: l.idTransacaoExterno,
        dataHora: l.dataHora,
        tipo: l.tipo,
        status: l.status,
        parcela: l.parcela,
        bandeira: l.bandeira,
        valorBruto: l.valorBruto?.toFixed(2),
        valorTaxa: l.valorTaxa?.toFixed(2),
        valorAntecipacao: l.valorAntecipacao?.toFixed(2),
        valorLiquido: l.valorLiquido?.toFixed(2),
        dataPagamento: l.dataPagamento,
      }));
      const totalInseridos = await db.upsertAdquirenteVendas(input.unidadeId, linhas);
      return { success: true, totalInseridos, totalLinhas: input.linhas.length };
    }),
  }),

  // ===== Configurações globais (chave-valor) =====
  configuracoes: router({
    get: adminProcedure.input(z.object({ chave: z.string() })).query(async ({ input }) => {
      const config = await db.getConfig(input.chave);
      return config?.valor ?? null;
    }),

    set: adminProcedure.input(z.object({
      chave: z.string(),
      valor: z.string(),
    })).mutation(async ({ input }) => {
      await db.setConfig(input.chave, input.valor);
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
