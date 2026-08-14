import { COOKIE_NAME, ATENDENTE_COOKIE_NAME, ATENDENTE_SESSION_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure, adminProcedure, syncProcedure } from "./_core/trpc";
import { z } from "zod";
import { parse as parseCookieHeader } from "cookie";
import * as db from "./db";
import { hashPin, verifyPin } from "./atendenteAuth";
import { belleApi } from "./belleApi";
import { zapiApi } from "./zapiApi";
import { buddhaMktApi } from "./buddhaMktApi";
import { storagePut, storageGetSignedUrl, normalizeStorageKey } from "./storage";
import { invokeLLM } from "./_core/llm";
import { interApi, getInterAccessToken, isTokenValid, dataEntradaDe, extrairContraparte, type InterTransacaoCompleta } from "./interApi";
import { sicrediApi, getSicrediAccessToken, isSicrediTokenValid } from "./sicrediApi";
import { parseExtratoInterPdf } from "./interExtratoPdfParser";
import { parseFaturaInterPdf } from "./interFaturaPdfParser";
import { parseFaturaSicrediPdf } from "./sicrediFaturaPdfParser";
import { parseClientesXlsx } from "./clientesXlsxParser";
import { parseComandaVirtualXlsx } from "./comandaVirtualXlsxParser";
import { parseExtratoOfx, parseSaldoOfx } from "./interExtratoOfxParser";
import { consultarPagamentos, extrairValoresMp, criarRelatorioLiberado, listarRelatoriosLiberados, baixarRelatorioLiberado, parseRelatorioLiberadoMp } from "./mercadoPagoApi";
import { PDFParse } from "pdf-parse";
import { lerCaixaFisicoSheet, SPREADSHEET_IDS, SPREADSHEET_ABAS, lerComandaConsolidadoSheet, SPREADSHEET_IDS_COMANDA, escreverContasBancariasSheet, type LinhaContasBancariasParaSheet, SPREADSHEET_IDS_COMANDA_VIRTUAL, lerComandaVirtualDiaSheet } from "./googleSheets";
import { transcribeAudio } from "./_core/voiceTranscription";
import { sendTelegramParaRecepcao } from "./telegramApi";
import { DEFAULT_INBOX_AI_MESSAGE_PROMPT, INBOX_AI_PROMPT_KEY, montarPedidoSugestaoMensagem } from "@shared/inboxAi";
import { upsertHeartbeatJob } from "./_core/heartbeat";
import { iniciarExecucaoFluxo } from "./fluxos";

function fmtDateIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ===== Zod dos Fluxos de automação =====
//
// z.union() testa cada opção NA ORDEM e usa a primeira que casar. Sem
// `.strict()` em cada branch, o Zod por padrão descarta silenciosamente
// chaves desconhecidas em vez de rejeitar — então um config de "menu"
// (que também tem `texto`) validava com sucesso contra o schema de
// "mensagem" (que só exige `texto`) e todas as outras chaves (opcoes,
// ordemSeNaoEntendeu etc.) eram descartadas antes de chegar no banco.
// `.strict()` faz o Zod rejeitar chave extra em vez de descartar, daí
// cai pro próximo branch do union até achar o formato exato. Isso já
// mordeu o mobai-crm de origem (menu perdia as opções salvas) — todo
// branch novo aqui PRECISA de `.strict()`, sem exceção.
const fluxoGatilhoConfigSchema = z.union([
  z.object({}).strict(), // manual
  z.object({}).strict(), // mensagem_recebida
  z.object({ dias: z.number() }).strict(), // dias_sem_contato
  z.object({ canalCaptacao: z.string().optional() }).strict(), // cliente_novo
]);

const fluxoNoTipoSchema = z.enum(["mensagem", "aguardar", "condicional", "salvar_variavel", "fim", "randomizador", "webhook", "midia", "menu"]);

const fluxoNoConfigSchema = z.union([
  z.object({ texto: z.string() }).strict(), // mensagem
  z.object({ valor: z.number(), unidade: z.enum(["segundos", "minutos", "horas", "dias"]) }).strict(), // aguardar
  z.object({
    logica: z.enum(["E", "OU"]),
    condicoes: z.array(z.object({
      variavel: z.string(),
      operador: z.enum(["igual", "diferente", "contem", "existe", "nao_existe"]),
      valor: z.string().optional(),
    })),
    ordemSeVerdadeiro: z.number().nullable(),
    ordemSeFalso: z.number().nullable(),
  }).strict(), // condicional
  z.object({
    nome: z.string(),
    origem: z.enum(["fixo", "ia"]),
    valorFixo: z.string().optional(),
    promptIa: z.string().optional(),
  }).strict(), // salvar_variavel
  z.object({}).strict(), // fim
  z.object({
    ramos: z.array(z.object({ pesoPercentual: z.number(), ordemDestino: z.number().nullable() })),
  }).strict(), // randomizador
  z.object({
    url: z.string(),
    variavelResposta: z.string().optional(),
    campoResposta: z.string().optional(),
    ordemSeErro: z.number().nullable(),
  }).strict(), // webhook
  z.object({
    tipoMidia: z.enum(["imagem", "audio", "documento"]),
    storageKey: z.string(),
    nomeArquivo: z.string().optional(),
    legenda: z.string().optional(),
  }).strict(), // midia
  z.object({
    texto: z.string(),
    opcoes: z.array(z.object({
      label: z.string(),
      ordemDestino: z.number().nullable(),
      descricao: z.string().optional(),
    })),
    ordemSeNaoEntendeu: z.number().nullable(),
    diasTimeoutSemResposta: z.number().optional(),
    estilo: z.enum(["texto", "botoes", "lista"]).optional(),
  }).strict(), // menu
]);

/**
 * Identifica quem emitiu a fatura de cartão (Inter ou Sicredi) pelo
 * próprio conteúdo do PDF, pra aplicar o parser certo sem depender de
 * o usuário escolher manualmente — critério exato (marca d'água de
 * texto que só aparece na fatura de cada banco), não heurística.
 */
function detectarEmissorFatura(texto: string): "inter" | "sicredi" | null {
  const lower = texto.toLowerCase();
  if (lower.includes("bancointer.com.br") || lower.includes("banco inter s/a")) return "inter";
  if (lower.includes("sicredi.com.br")) return "sicredi";
  return null;
}

/**
 * "Recebimentos" do Dashboard: soma de Contas bancárias (Dinheiro +
 * Débito + Crédito + Pix, já deduplicado — ver db.ts:
 * resumoContasBancariasPorDia) no período. Substitui o antigo
 * `recebimentos` do Belle (2026-08-08) — o dado do Belle dependia de
 * token configurado por unidade e ficava zerado sem ele; este é
 * calculado por este sistema e já bate com a Comanda Recepção.
 */
async function totalContasBancariasNoPeriodo(unidadeId: number, dataInicio: string, dataFim: string): Promise<number> {
  const resumo = await db.resumoContasBancariasPorDia(unidadeId, dataInicio, dataFim);
  let total = 0;
  for (const valores of Array.from(resumo.values())) {
    total += valores.dinheiro + valores.cartaoDebito + valores.cartaoCredito + valores.pix;
  }
  return total;
}

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
    // Filtrado pelo controle de acesso por unidade (ver Usuários →
    // permissões) — único ponto de filtro: todo o resto da UI
    // (UnidadeSelector, Dashboard, Configurações etc.) consome esta
    // query via useUnidade(), então herda o filtro automaticamente.
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getUnidadesParaUsuario(ctx.user.id, ctx.user.role);
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

  // ===== Clientes (Belle API desativada por enquanto — acesso negado
  // pelo franqueador; a base de clientes real vem só da planilha
  // importada, ver importarXlsx/listImportados/buscarLocal abaixo) =====
  clientes: router({
    list: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      pagina: z.number().default(0),
      dt_ultima_compra: z.string().optional(),
      dt_ultima_presenca: z.string().optional(),
      sexo: z.string().optional(),
      dt_cadastro: z.string().optional(),
    })).query(async () => {
      throw new Error("Acesso à API de clientes do Belle está desativado por enquanto — use a base local (planilha importada).");
    }),

    buscar: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      cpf: z.string().optional(),
      email: z.string().optional(),
      celular: z.string().optional(),
      id: z.number().optional(),
    })).query(async () => {
      throw new Error("Acesso à API de clientes do Belle está desativado por enquanto — use a base local (planilha importada).");
    }),

    // Busca por CPF na base local — usado pelo Copilot desde que
    // clientes.buscar (Belle) foi desativado.
    buscarLocal: protectedProcedure.input(z.object({
      cpf: z.string().min(3),
    })).query(async ({ input }) => {
      return db.buscarClienteLocalPorCpf(input.cpf);
    }),

    planos: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      codCliente: z.number(),
    })).query(async () => {
      throw new Error("Acesso à API de clientes do Belle está desativado por enquanto — use a base local (planilha importada).");
    }),

    atualizar: adminProcedure.input(z.object({
      unidadeId: z.number(),
      codCliente: z.number(),
      dados: z.record(z.string(), z.unknown()),
    })).mutation(async () => {
      throw new Error("Acesso à API de clientes do Belle está desativado por enquanto — use a base local (planilha importada).");
    }),

    historico: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      codCliente: z.number(),
    })).query(async () => {
      throw new Error("Acesso à API de clientes do Belle está desativado por enquanto — use a base local (planilha importada).");
    }),

    /**
     * Base local de clientes, importada da planilha "[Buddha] Clientes"
     * que cada unidade exporta do Belle — passou a existir porque o
     * acesso via API foi negado (franqueador precisa autorizar). Uma
     * unidade por vez; upsert por ID da planilha (belleId), ligando a
     * flag clienteSsu/clienteRbs correspondente sem apagar a outra.
     */
    importarXlsx: adminProcedure.input(z.object({
      unidade: z.enum(["rbs", "ssu"]),
      xlsxBase64: z.string().min(1),
    })).mutation(async ({ input }) => {
      const buffer = Buffer.from(input.xlsxBase64, "base64");
      const linhas = parseClientesXlsx(buffer);
      if (linhas.length === 0) {
        throw new Error("Nenhum cliente encontrado na planilha.");
      }
      const resultado = await db.upsertClientesImportados(input.unidade, linhas);
      return { success: true, totalLinhas: linhas.length, ...resultado };
    }),

    resumoImportados: protectedProcedure.query(async () => {
      return db.resumoClientesLocal();
    }),

    // Sem filtro/paginação server-side — busca e ordenação ficam no
    // client (Clientes.tsx), a base cabe inteira numa resposta.
    listImportados: protectedProcedure.query(async () => {
      return db.listClientesLocal();
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

      const [vendas, recebimentosMes, agendamentos] = await Promise.all([
        belleApi.relatorioVendas(unidade.belleToken, unidade.codEstab, {
          data_inicio: fmtDate(dataInicio),
          data_fim: fmtDate(hoje),
        }).catch(() => null),
        totalContasBancariasNoPeriodo(input.unidadeId, fmtDateIso(dataInicio), fmtDateIso(hoje)).catch(() => 0),
        belleApi.listarAgendamentos(unidade.belleToken, unidade.codEstab).catch(() => null),
      ]);

      return {
        faturamentoMes: vendas?.valorTotal ?? 0,
        totalVendasMes: vendas?.totalVendas ?? 0,
        recebimentosMes,
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
      const dataInicioIso = fmtDateIso(dataInicio);
      const dataFimIso = fmtDateIso(hoje);

      const resultados = await Promise.all(
        unidades.map(async (unidade) => {
          // Recebimentos não depende mais de token Belle — calculado
          // direto das Contas bancárias, então roda pra toda unidade.
          const recebimentosMes = await totalContasBancariasNoPeriodo(unidade.id, dataInicioIso, dataFimIso).catch(() => 0);

          if (!unidade.belleToken) {
            return {
              unidadeId: unidade.id,
              nome: unidade.nome,
              corTema: unidade.corTema,
              faturamentoMes: 0,
              totalVendasMes: 0,
              recebimentosMes,
              agendamentosHoje: 0,
              totalAgendamentos: 0,
              semToken: true,
            };
          }
          try {
            const [vendas, agendamentos] = await Promise.all([
              belleApi.relatorioVendas(unidade.belleToken, unidade.codEstab, {
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
              recebimentosMes,
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
              recebimentosMes,
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

      abrirPorCliente: protectedProcedure.input(z.object({
        clienteId: z.number(),
        unidadeId: z.number(),
      })).mutation(async ({ input }) => {
        const conversaId = await db.abrirInboxPorCliente(input);
        if (!conversaId) throw new Error("Não foi possível abrir o Inbox");
        return { conversaId };
      }),

      qrCode: protectedProcedure.input(z.object({
        unidadeId: z.number(),
      })).query(async ({ input }) => {
        const unidade = await db.getUnidadeById(input.unidadeId);
        if (!unidade?.zapiInstanceId || !unidade?.zapiToken || !unidade?.zapiClientToken) {
          return { qrcode: null, error: "Z-API não configurado para esta unidade" };
        }
        try {
          const qrcode = await zapiApi.getQrCodeImage(
            unidade.zapiInstanceId,
            unidade.zapiToken,
            unidade.zapiClientToken,
          );
          return { qrcode, error: null };
        } catch (e: any) {
          return { qrcode: null, error: e?.message || "Erro ao buscar QR code" };
        }
      }),

      status: protectedProcedure.input(z.object({
        unidadeId: z.number(),
      })).query(async ({ input }) => {
        const unidade = await db.getUnidadeById(input.unidadeId);
        if (!unidade?.zapiInstanceId || !unidade?.zapiToken || !unidade?.zapiClientToken) {
          return { connected: false, status: "not_configured", phone: null };
        }
        try {
          const data = await zapiApi.getStatus(
            unidade.zapiInstanceId,
            unidade.zapiToken,
            unidade.zapiClientToken,
          );
          return {
            connected: data?.connected ?? false,
            status: data?.status ?? "unknown",
            phone: data?.phone ?? null,
          };
        } catch {
          return { connected: false, status: "error", phone: null };
        }
      }),

      get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
        const conversa = await db.getInboxConversaById(input.id);
        if (conversa) await db.marcarInboxConversaLida(input.id);
        return conversa;
      }),

      atualizarNome: protectedProcedure.input(z.object({
        id: z.number(),
        nome: z.string().min(1),
      })).mutation(async ({ input }) => {
        await db.atualizarNomeContatoInbox(input.id, input.nome);
        return { success: true };
      }),

      /**
       * Card "Criar cliente no CRM" no painel direito — conversa já
       * ativa cujo telefone não bate com nenhum cliente Belle. Cria o
       * cliente (tipoCliente "lead", belleId sintético) e vincula.
       */
      criarClienteRapido: protectedProcedure.input(z.object({
        conversaId: z.number(),
        nome: z.string().min(1).max(200),
        // Confirmado pela recepção depois de ver o aviso de celular já
        // cadastrado noutro cliente — ver ResultadoCriarCliente em db.ts.
        forcarDuplicata: z.boolean().optional(),
      })).mutation(async ({ input }) => {
        return db.criarClienteRapidoDeConversa(input.conversaId, input.nome, input.forcarDuplicata);
      }),

      alterarStatus: protectedProcedure.input(z.object({
        id: z.number(),
        status: z.enum(["aberta", "encerrada"]),
      })).mutation(async ({ input }) => {
        await db.alterarStatusInboxConversa(input.id, input.status);
        return { success: true };
      }),

      definirEtiquetas: protectedProcedure.input(z.object({
        id: z.number(),
        etiquetas: z.array(z.string()),
      })).mutation(async ({ input }) => {
        await db.definirEtiquetasInbox(input.id, input.etiquetas);
        return { success: true };
      }),

      excluir: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
        await db.excluirInboxConversa(input.id);
        return { success: true };
      }),

      /**
       * Lista de participantes do grupo (painel direito + autocomplete de
       * @menção no composer) — GET /group-metadata da Z-API, reforçado
       * pelo nome já visto no histórico de mensagens quando a Z-API não
       * devolve "name" (WhatsApp nem sempre expõe isso).
       */
      membrosGrupo: protectedProcedure.input(z.object({ conversaId: z.number() })).query(async ({ input }) => {
        const conversa = await db.getInboxConversaById(input.conversaId);
        if (!conversa || conversa.isGrupo !== "true" || !conversa.unidadeId) return [];
        const unidade = await db.getUnidadeById(conversa.unidadeId);
        if (!unidade?.zapiInstanceId || !unidade.zapiToken || !unidade.zapiClientToken) return [];
        const [participantes, nomesConhecidos] = await Promise.all([
          zapiApi.getGroupMetadata(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, conversa.telefone),
          db.listNomesConhecidosPorTelefone(input.conversaId),
        ]);
        if (!participantes) return [];
        return participantes.map((p) => ({
          telefone: p.phone,
          nome: p.name || p.short || nomesConhecidos.get(p.phone) || null,
          isAdmin: p.isAdmin || p.isSuperAdmin,
        }));
      }),
    }),

    /**
     * Botão "+" ao lado de Atualizar no Inbox — recepção cria cliente
     * (tipoCliente "lead") + conversa sem precisar de mensagem prévia
     * (ex.: cliente chegou no balcão e pediu pra mandar a tabela de
     * preços).
     */
    iniciarConversaComCliente: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      nome: z.string().min(1).max(200),
      telefone: z.string().min(8).max(20),
      forcarDuplicata: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      return db.iniciarConversaComCliente(input);
    }),

    mensagens: router({
      list: protectedProcedure.input(z.object({
        conversaId: z.number(),
        limit: z.number().default(50),
      })).query(async ({ input }) => {
        return db.listInboxMensagens(input.conversaId, input.limit);
      }),

      sugerir: protectedProcedure.input(z.object({
        conversaId: z.number(),
        rascunho: z.string().trim().min(1).max(4000),
      })).mutation(async ({ input }) => {
        const conversa = await db.getInboxConversaById(input.conversaId);
        if (!conversa) throw new Error("Conversa não encontrada");

        const promptConfigurado = await db.getConfig(INBOX_AI_PROMPT_KEY);
        const systemPrompt = promptConfigurado?.valor?.trim() || DEFAULT_INBOX_AI_MESSAGE_PROMPT;
        try {
          const response = await invokeLLM({
            model: "gpt-5-mini",
            maxTokens: 500,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: montarPedidoSugestaoMensagem(input.rascunho) },
            ],
          });
          const content = response.choices[0]?.message.content;
          const sugestao = typeof content === "string" ? content.trim() : "";
          if (!sugestao) throw new Error("A IA não retornou uma sugestão de mensagem");
          return { sugestao: sugestao.slice(0, 4000) };
        } catch (error) {
          console.error("[Inbox IA] Falha ao gerar sugestão:", error);
          throw new Error("Não foi possível gerar a sugestão de mensagem agora. Tente novamente.");
        }
      }),

      enviar: protectedProcedure.input(z.object({
        conversaId: z.number(),
        texto: z.string().min(1),
        // Telefones marcados com @menção no texto (só faz sentido em
        // grupo — ver Mensagens.tsx, autocomplete de @).
        mentioned: z.array(z.string()).optional(),
      })).mutation(async ({ input, ctx }) => {
        if (!(await db.mensageriaEstaAtiva())) {
          throw new Error("Envio de mensagens pausado — kill switch de mensageria ativado por um administrador");
        }
        const conversa = await db.getInboxConversaById(input.conversaId);
        if (!conversa) throw new Error("Conversa não encontrada");

        // Assina a mensagem com quem está atendendo (PIN da recepção),
        // igual mobai-crm (client/src/pages/Inbox.tsx: `*Nome:*\ntexto`)
        // — sem isso o cliente não sabe quem está falando num terminal
        // compartilhado por várias atendentes. Admin sem PIN selecionado
        // cai no nome da conta Google.
        const nomeRemetente = ctx.atendente?.nome ?? ctx.user.name;
        const textoFinal = nomeRemetente?.trim() ? `*${nomeRemetente.trim()}:*\n${input.texto}` : input.texto;

        let zapiMessageId: string | undefined;
        if (conversa.canal === "zapi") {
          if (!conversa.unidadeId) throw new Error("Conversa sem unidade associada");
          const unidade = await db.getUnidadeById(conversa.unidadeId);
          if (!unidade?.zapiInstanceId || !unidade.zapiToken || !unidade.zapiClientToken) {
            throw new Error("Z-API não configurado para esta unidade");
          }
          try {
            const resultado = await zapiApi.sendText(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, conversa.telefone, textoFinal, input.mentioned);
            zapiMessageId = resultado.messageId;
          } catch (error) {
            // Mesmo motivo do enviarMidia logo abaixo: engolir aqui fazia a
            // mensagem "sumir" da caixa de texto sem nunca chegar no
            // WhatsApp, sem nenhum aviso pra quem enviou.
            console.error("[Inbox] Falha ao enviar via Z-API:", error);
            const detalhe = error instanceof Error ? error.message : "erro desconhecido";
            throw new Error(`Falha ao enviar mensagem pelo WhatsApp: ${detalhe}`);
          }
        } else {
          try {
            await buddhaMktApi.sendText(conversa.telefone, textoFinal);
          } catch (error) {
            console.error("[Inbox] Falha ao enviar via Buddha Mkt:", error);
            const detalhe = error instanceof Error ? error.message : "erro desconhecido";
            throw new Error(`Falha ao enviar mensagem: ${detalhe}`);
          }
        }

        await db.insertInboxMensagem({
          conversaId: input.conversaId,
          direcao: "enviada",
          tipo: "texto",
          conteudo: textoFinal,
          enviadaPorUserId: ctx.user.id,
          enviadaPorAtendenteId: ctx.atendente?.id ?? null,
          zapiMessageId: zapiMessageId ?? null,
        });
        await db.upsertInboxConversa({
          unidadeId: conversa.unidadeId,
          canal: conversa.canal,
          telefone: conversa.telefone,
          nomeContato: conversa.nomeContato ?? undefined,
          ultimaMensagemTexto: textoFinal,
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

        let zapiMessageId: string | undefined;
        if (conversa.canal === "zapi") {
          if (!conversa.unidadeId) throw new Error("Conversa sem unidade associada");
          const unidade = await db.getUnidadeById(conversa.unidadeId);
          if (!unidade?.zapiInstanceId || !unidade.zapiToken || !unidade.zapiClientToken) {
            throw new Error("Z-API não configurado para esta unidade");
          }
          try {
            let resultado;
            if (input.tipo === "imagem") {
              resultado = await zapiApi.sendImageBase64(
                unidade.zapiInstanceId,
                unidade.zapiToken,
                unidade.zapiClientToken,
                conversa.telefone,
                input.arquivoBase64,
                input.contentType,
                input.legenda,
              );
            } else if (input.tipo === "audio") {
              resultado = await zapiApi.sendAudio(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, conversa.telefone, url);
            } else if (input.tipo === "documento") {
              resultado = await zapiApi.sendDocumentBase64(
                unidade.zapiInstanceId,
                unidade.zapiToken,
                unidade.zapiClientToken,
                conversa.telefone,
                input.arquivoBase64,
                input.contentType,
                input.fileName,
                input.legenda,
              );
            }
            zapiMessageId = resultado?.messageId;
          } catch (error) {
            // Antes engolia o erro aqui e seguia como se tivesse dado certo
            // — a caixa de legenda fechava (sucesso na UI) mas a mídia
            // nunca chegava no WhatsApp (ex.: Z-API rejeita formato/URL),
            // sem nenhum aviso. Agora propaga pro usuário tentar de novo.
            console.error("[Inbox] Falha ao enviar mídia via Z-API:", error);
            const detalhe = error instanceof Error ? error.message : "erro desconhecido";
            throw new Error(`Falha ao enviar mídia pelo WhatsApp: ${detalhe}`);
          }
        }
        // Buddha Mkt: envio de mídia via Cloud API exige upload prévio pra
        // biblioteca de mídia da Meta — fica pra quando o canal estiver
        // configurado de verdade.

        const mensagemId = await db.insertInboxMensagem({
          conversaId: input.conversaId,
          direcao: "enviada",
          tipo: input.tipo,
          conteudo: input.legenda ?? "",
          metadados: JSON.stringify({ url, storageKey: key, legenda: input.legenda, fileName: input.fileName }),
          enviadaPorUserId: ctx.user.id,
          enviadaPorAtendenteId: ctx.atendente?.id ?? null,
          zapiMessageId: zapiMessageId ?? null,
        });

        // Transcrição de áudio enviado pelo CRM — mesmo padrão do áudio
        // recebido (ver webhooks.ts), assíncrono pra não segurar a
        // resposta do envio.
        if (input.tipo === "audio" && mensagemId) {
          transcribeAudio({ audioUrl: url, language: "pt" })
            .then((result) => {
              if ("text" in result) {
                return db.updateInboxMensagemTranscricao(mensagemId, result.text.trim() || "(sem fala identificada)");
              }
              console.error("[Inbox] Transcrição do áudio enviado recusada:", result.code, result.details ?? result.error);
            })
            .catch((error) => console.error("[Inbox] Falha na transcrição do áudio enviado:", error));
        }

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

  // ===== Scripts (mensagens prontas do Inbox) =====
  scripts: router({
    list: protectedProcedure.input(z.object({
      busca: z.string().optional(),
      categoria: z.string().optional(),
    })).query(async ({ input }) => {
      return db.listScripts(input.busca, input.categoria);
    }),

    listCategorias: protectedProcedure.query(async () => {
      return db.listCategoriasScript();
    }),

    listRecentes: protectedProcedure.query(async () => {
      return db.listScriptsRecentes();
    }),

    registrarUso: protectedProcedure.input(z.object({ scriptId: z.number() })).mutation(async ({ input, ctx }) => {
      await db.registrarUsoScript(input.scriptId, ctx.user.id);
      return { success: true };
    }),

    // Não é adminProcedure — recepção também mantém os scripts prontos
    // do dia a dia (2026-08-13). tipo="fluxo" só referencia um Fluxo
    // já pronto (montado por um admin em /fluxos) — quem cria/edita
    // script não constrói fluxo nenhum aqui.
    create: protectedProcedure.input(z.object({
      categoriaScript: z.string().min(1).max(100),
      tipo: z.enum(["texto", "fluxo"]).default("texto"),
      script: z.string().min(1).optional(),
      fluxoId: z.number().optional(),
      observacoes: z.string().optional(),
    }).refine((v) => v.tipo === "texto" ? !!v.script?.trim() : !!v.fluxoId, {
      message: "Script de texto precisa de mensagem; script de fluxo precisa de um fluxo selecionado",
    })).mutation(async ({ input }) => {
      const id = await db.createScript(input);
      return { id };
    }),

    update: protectedProcedure.input(z.object({
      id: z.number(),
      categoriaScript: z.string().min(1).max(100).optional(),
      tipo: z.enum(["texto", "fluxo"]).optional(),
      script: z.string().nullable().optional(),
      fluxoId: z.number().nullable().optional(),
      observacoes: z.string().nullable().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...dados } = input;
      await db.updateScript(id, dados);
      return { success: true };
    }),

    excluir: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.excluirScript(input.id);
      return { success: true };
    }),
  }),

  // ===== Fluxos de automação de WhatsApp (porte do mobai-crm, 2026-08-13) =====
  fluxos: router({
    list: adminProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      return db.listFluxos(input.unidadeId);
    }),

    get: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const [fluxo, nos] = await Promise.all([db.getFluxoById(input.id), db.listFluxoNos(input.id)]);
      if (!fluxo) return null;
      return { fluxo, nos };
    }),

    create: adminProcedure.input(z.object({
      unidadeId: z.number(),
      nome: z.string().min(1),
      descricao: z.string().optional(),
    })).mutation(async ({ input }) => {
      const id = await db.createFluxo(input);
      return { id };
    }),

    update: adminProcedure.input(z.object({
      id: z.number(),
      nome: z.string().min(1).optional(),
      descricao: z.string().nullable().optional(),
      ativo: z.boolean().optional(),
      entradaNoOrdem: z.number().nullable().optional(),
      gatilhoTipo: z.enum(["manual", "mensagem_recebida", "dias_sem_contato", "cliente_novo"]).optional(),
      gatilhoConfig: fluxoGatilhoConfigSchema.optional(),
      visivelNoInbox: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...dados } = input;
      await db.updateFluxo(id, dados);
      return { success: true };
    }),

    excluir: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.excluirFluxo(input.id);
      return { success: true };
    }),

    nos: router({
      list: adminProcedure.input(z.object({ fluxoId: z.number() })).query(async ({ input }) => {
        return db.listFluxoNos(input.fluxoId);
      }),

      create: adminProcedure.input(z.object({
        fluxoId: z.number(),
        tipo: fluxoNoTipoSchema,
        ordem: z.number(),
        config: fluxoNoConfigSchema,
        proximoNoOrdem: z.number().nullable().optional(),
        posX: z.number().nullable().optional(),
        posY: z.number().nullable().optional(),
      })).mutation(async ({ input }) => {
        const id = await db.createFluxoNo(input as any);
        return { id };
      }),

      update: adminProcedure.input(z.object({
        id: z.number(),
        config: fluxoNoConfigSchema.optional(),
        proximoNoOrdem: z.number().nullable().optional(),
        posX: z.number().nullable().optional(),
        posY: z.number().nullable().optional(),
      })).mutation(async ({ input }) => {
        const { id, ...dados } = input;
        await db.updateFluxoNo(id, dados as any);
        return { success: true };
      }),

      excluir: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
        await db.excluirFluxoNo(input.id);
        return { success: true };
      }),

      // Só armazena — não envia nada. O envio de verdade acontece na
      // execução do fluxo (server/fluxos.ts, nó midia), que baixa esse
      // arquivo do storage e manda em Base64 pra Z-API.
      uploadMidia: adminProcedure.input(z.object({
        nomeArquivo: z.string(),
        conteudoBase64: z.string(),
        mimeType: z.string(),
      })).mutation(async ({ input, ctx }) => {
        const buffer = Buffer.from(input.conteudoBase64, "base64");
        const nomeLimpo = normalizeStorageKey(input.nomeArquivo);
        const key = `fluxos/${ctx.user.id}/${Date.now()}-${nomeLimpo}`;
        const { key: storageKey } = await storagePut(key, buffer, input.mimeType);
        return { storageKey };
      }),
    }),

    // "Testar com um cliente" no editor — admin only.
    iniciar: adminProcedure.input(z.object({
      fluxoId: z.number(),
      conversaId: z.number(),
      clienteId: z.number().optional(),
    })).mutation(async ({ input }) => {
      const execucaoId = await iniciarExecucaoFluxo(input.fluxoId, input.conversaId, input.clienteId);
      return { execucaoId };
    }),

    // Menu "Executar fluxo" no Inbox — qualquer atendente, só se
    // fluxos.visivelNoInbox estiver ligado pra esse fluxo.
    iniciarVisivel: protectedProcedure.input(z.object({
      fluxoId: z.number(),
      conversaId: z.number(),
      clienteId: z.number().optional(),
    })).mutation(async ({ input, ctx }) => {
      const fluxo = await db.getFluxoById(input.fluxoId);
      if (!fluxo?.visivelNoInbox) throw new Error("Esse fluxo não está liberado pra execução manual no Inbox");
      const nomeAtendente = ctx.atendente?.nome ?? ctx.user.name ?? "";
      const execucaoId = await iniciarExecucaoFluxo(
        input.fluxoId, input.conversaId, input.clienteId,
        nomeAtendente ? { nome_atendente: nomeAtendente } : undefined,
      );
      return { execucaoId };
    }),

    execucoes: router({
      list: adminProcedure.input(z.object({ fluxoId: z.number() })).query(async ({ input }) => {
        return db.listFluxoExecucoesPorFluxo(input.fluxoId);
      }),
    }),

    registrarHeartbeat: adminProcedure.mutation(async ({ ctx }) => {
      const userSession = parseCookieHeader(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      await upsertHeartbeatJob({
        name: "cron-retomar-fluxos",
        cron: "0 * * * * *",
        path: "/api/scheduled/retomar-fluxos",
        method: "POST",
        description: "Fluxos: retoma execuções pausadas (nó aguardar) e trata timeout de menu aguardando resposta.",
      }, userSession);
      return { success: true };
    }),

    registrarHeartbeatGatilhosAgendados: adminProcedure.mutation(async ({ ctx }) => {
      const userSession = parseCookieHeader(ctx.req.headers.cookie ?? "")[COOKIE_NAME] ?? "";
      await upsertHeartbeatJob({
        name: "cron-disparar-fluxos-agendados",
        cron: "0 0 6 * * *",
        path: "/api/scheduled/disparar-fluxos-agendados",
        method: "POST",
        description: "Fluxos: varredura diária do gatilho dias_sem_contato.",
      }, userSession);
      return { success: true };
    }),
  }),

  // ===== Telegram (avisos pro grupo da recepção via BotFather) =====
  telegram: router({
    status: adminProcedure.query(() => ({
      configurado: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID_GRUPO_RECEPCAO),
    })),
    enviarTeste: adminProcedure.mutation(async () => {
      await sendTelegramParaRecepcao("🤖 Teste de integração — Buddha Spa CRM conectado ao Telegram com sucesso.");
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
      tiposConta: z.array(z.enum(["inter_oauth", "sicredi_oauth", "manual", "cartao_credito", "conta_corrente", "caixa_fisico"])).optional(),
    })).query(async ({ input }) => {
      return db.listInterExtratos(input.unidadeId, input.dataInicio, input.dataFim, input.contaId, input.tiposConta);
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
     * Split de lançamento: divide uma transação em N Descrições (e,
     * opcionalmente, unidades) diferentes — pra casos como fatura de
     * cartão paga de uma vez que na real é várias categorias.
     */
    splits: router({
      list: protectedProcedure.input(z.object({
        unidadeId: z.number(),
        dataInicio: z.string(),
        dataFim: z.string(),
        contaId: z.number().optional(),
      })).query(async ({ input }) => {
        return db.listSplitsPorPeriodo(input.unidadeId, input.dataInicio, input.dataFim, input.contaId);
      }),
      salvar: protectedProcedure.input(z.object({
        interExtratoId: z.number(),
        linhas: z.array(z.object({
          dreDescricaoId: z.number(),
          valor: z.number().positive(),
          unidadeId: z.number(),
          observacao: z.string().optional(),
        })).min(1),
      })).mutation(async ({ input }) => {
        await db.salvarSplits(input.interExtratoId, input.linhas);
        return { success: true };
      }),
      excluir: protectedProcedure.input(z.object({
        interExtratoId: z.number(),
      })).mutation(async ({ input }) => {
        await db.excluirSplits(input.interExtratoId);
        return { success: true };
      }),
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
     * Reaplica as regras de categorização atuais em toda transação
     * ainda não confirmada ("Pendente" ou "Sugerida") — usado depois
     * que uma regra é adicionada/editada/removida, pra não deixar
     * lançamentos já importados presos numa sugestão desatualizada.
     */
    reprocessarCategorias: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      contaId: z.number().optional(),
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    })).mutation(async ({ input }) => {
      const atualizados = await db.reprocessarPendentes(input.unidadeId, input.contaId, input.dataInicio, input.dataFim);
      return { success: true, atualizados };
    }),

    /**
     * Sincroniza o extrato enriquecido do período com o banco local.
     * Usa paginação por scroll para grandes volumes.
     * Rate limit: 10 req/min — não chamar em loop apertado.
     */
    sincronizar: syncProcedure.input(z.object({
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
      const cnpjsPorUnidadeDre = await db.listCnpjsPorUnidade();
      const categorizar = async (t: InterTransacaoCompleta) => {
        if (!contaInter?.id) return { dreDescricaoId: undefined, categorizacaoStatus: "pendente" as const, alerta: null };
        const contraparte = extrairContraparte(t);
        const resultado = await db.categorizarTransacaoAutomaticamente({
          unidadeId: input.unidadeId,
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
        }, regrasDre, cnpjsPorUnidadeDre);
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
      const cnpjsPorUnidade = await db.listCnpjsPorUnidade();
      const transacoes = await Promise.all(input.linhas.map(async (linha, i) => {
        const idTransacao = `csv:${input.contaId}:${linha.data}:${linha.tipo}:${linha.valor}:${i}`;
        const resultado = await db.categorizarTransacaoAutomaticamente({
          unidadeId: conta.unidadeId,
          contaId: input.contaId,
          dataEntrada: linha.data,
          titulo: linha.descricao,
          valor: linha.valor,
          origem: "csv",
          tipoOperacao: linha.tipo,
        }, regras, cnpjsPorUnidade);
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
      const cnpjsPorUnidade = await db.listCnpjsPorUnidade();
      const transacoes = await Promise.all(linhas.map(async (linha, i) => {
        const resultado = await db.categorizarTransacaoAutomaticamente({
          unidadeId: conta.unidadeId,
          contaId: input.contaId,
          dataEntrada: linha.data,
          titulo: linha.descricao,
          valor: linha.valor,
          origem: "pdf",
          tipoOperacao: linha.tipo,
        }, regras, cnpjsPorUnidade);
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
     * Importa a fatura de cartão de crédito em PDF (Inter ou Sicredi —
     * conta tipo "cartao_credito") item a item. Detecta sozinho qual
     * dos dois bancos emitiu o PDF pelo próprio conteúdo
     * (detectarEmissorFatura) e aplica o parser certo — o usuário só
     * escolhe o arquivo, não precisa dizer de qual banco é.
     */
    importarFaturaCartao: protectedProcedure.input(z.object({
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

      const emissor = detectarEmissorFatura(texto);
      if (!emissor) {
        throw new Error("Não foi possível identificar o banco emissor da fatura. Confirme que é um PDF de fatura do Inter ou do Sicredi.");
      }

      const linhas = emissor === "inter" ? parseFaturaInterPdf(texto) : parseFaturaSicrediPdf(texto);
      if (linhas.length === 0) {
        throw new Error(`Nenhuma transação encontrada na fatura (${emissor === "inter" ? "Inter" : "Sicredi"}). Confirme que o PDF é a fatura completa, com a seção de transações.`);
      }

      const regras = await db.listRegrasParaMatch();
      const cnpjsPorUnidade = await db.listCnpjsPorUnidade();
      const transacoes = await Promise.all(linhas.map(async (linha, i) => {
        const resultado = await db.categorizarTransacaoAutomaticamente({
          unidadeId: conta.unidadeId,
          contaId: input.contaId,
          dataEntrada: linha.data,
          titulo: linha.descricao,
          valor: linha.valor,
          origem: "pdf",
          tipoOperacao: linha.tipo,
        }, regras, cnpjsPorUnidade);
        return {
          unidadeId: conta.unidadeId,
          contaId: input.contaId,
          idTransacao: `fatura:${input.contaId}:${linha.data}:${linha.tipo}:${linha.valor}:${i}`,
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
        detalhes: `Importação de fatura (${emissor === "inter" ? "Inter" : "Sicredi"}) na conta "${conta.nome}". ${linhas.length} transação(ões) no arquivo, ${inseridos} nova(s).`,
      });
      return { success: true, emissor, totalInseridos: inseridos, totalLinhas: linhas.length };
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
      const cnpjsPorUnidade = await db.listCnpjsPorUnidade();
      const transacoes = await Promise.all(linhas.map(async (linha) => {
        const resultado = await db.categorizarTransacaoAutomaticamente({
          unidadeId: conta.unidadeId,
          contaId: input.contaId,
          dataEntrada: linha.data,
          tipoTransacao: linha.trnType,
          titulo: linha.descricao,
          valor: linha.valor,
          origem: "ofx",
          tipoOperacao: linha.tipo,
        }, regras, cnpjsPorUnidade);
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

  /**
   * "Conta corrente" entre RBS/Satori e SSU/Agama — junta rateio de
   * despesa (gerado por inter.splits.salvar) e transferência bancária
   * real entre as unidades (gerada por inter.confirmarSugestao), além
   * de lançamento manual pra casos sem transação bancária (ex.:
   * mercadoria que volta de uma unidade pra outra).
   */
  transacoesEntreUnidades: router({
    list: protectedProcedure.query(async () => {
      return db.listTransacoesEntreUnidades();
    }),
    saldo: protectedProcedure.query(async () => {
      return db.saldoEntreUnidades();
    }),
    criar: adminProcedure.input(z.object({
      data: z.string(),
      unidadeCredora: z.number(),
      unidadeDevedora: z.number(),
      valor: z.number().positive(),
      descricao: z.string().min(1),
    })).mutation(async ({ input }) => {
      const id = await db.criarTransacaoManualEntreUnidades(input);
      return { success: true, id };
    }),
  }),

  // ===== Sicredi =====
  // API "Extrato de Conta Corrente" confirmada contra a documentação
  // oficial (developers.sicredi.com.br, 2026-08-11) — ver
  // server/sicrediApi.ts. "Saldo de Conta Corrente" ainda não.
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
      return sicrediApi.consultarSaldo();
    }),

    sincronizar: syncProcedure.input(z.object({
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
      const cnpjsPorUnidadeDre = await db.listCnpjsPorUnidade();

      try {
        // Paginado — busca a página 0 pra saber quantas existem, depois
        // o resto, acumulando tudo antes de processar.
        const primeira = await sicrediApi.consultarExtrato(token, input.dataInicio, input.dataFim, credenciais, 0);
        const movimentos = [...primeira.dtlMovimentos];
        for (let pagina = 1; pagina < primeira.totalPages; pagina++) {
          const proxima = await sicrediApi.consultarExtrato(token, input.dataInicio, input.dataFim, credenciais, pagina);
          movimentos.push(...proxima.dtlMovimentos);
        }

        const transacoes = await Promise.all(movimentos.map(async (m) => {
          const tipoOperacao: "C" | "D" = m.valor >= 0 ? "C" : "D";
          const resultado = contaSicredi?.id
            ? await db.categorizarTransacaoAutomaticamente({
              unidadeId: input.unidadeId,
              contaId: contaSicredi.id,
              dataEntrada: m.data,
              tipoTransacao: m.codigoLancamento,
              titulo: m.descricao,
              descricao: m.complemento ?? "",
              valor: m.valor,
              origem: "sicredi",
              tipoOperacao,
            }, regrasDre, cnpjsPorUnidadeDre)
            : { dreDescricaoId: undefined, categorizacaoStatus: "pendente" as const };
          return {
            unidadeId: input.unidadeId,
            contaId: contaSicredi?.id,
            idTransacao: m.idMovimento,
            dataEntrada: m.data,
            tipoTransacao: m.codigoLancamento,
            tipoOperacao,
            valor: String(m.valor),
            titulo: m.descricao,
            descricao: m.complemento,
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
          detalhes: `Período: ${input.dataInicio} a ${input.dataFim}. Saldo anterior: ${primeira.saldoAnterior}. Total API: ${movimentos.length}. Novos: ${inseridos}.`,
        });

        return { success: true, totalInseridos: inseridos, totalTransacoes: movimentos.length };
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
      tipo: z.enum(["conta_corrente", "caixa_fisico", "cartao_credito"]).optional(),
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
      tipo: z.enum(["conta_corrente", "caixa_fisico", "cartao_credito"]).optional(),
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
    sincronizarMercadoPago: syncProcedure.input(z.object({
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

        // Diagnóstico: confirma (ou não) se SOURCE_ID do relatório de
        // liquidação bate com idTransacaoExterno das vendas conhecidas
        // (adquirenteVendas) — ainda não validado com dado real. Janela
        // alargada 7 dias antes do período pedido porque a liquidação
        // pode cair depois da venda (money_release_date != date_approved).
        // Só enriquece a Descrição quando o match é exato — sem match,
        // fica como já era (RECORD_TYPE genérico), nunca um chute.
        const seteDiasAntes = (data: string) => {
          const d = new Date(`${data}T00:00:00Z`);
          d.setUTCDate(d.getUTCDate() - 7);
          return d.toISOString().slice(0, 10);
        };
        const vendasDoPeriodo = await db.listAdquirenteVendas(
          input.unidadeId,
          seteDiasAntes(input.dataInicio),
          input.dataFim,
          "mercadopago",
        );
        const tipoPorIdTransacao = new Map(
          vendasDoPeriodo.filter((v) => v.idTransacaoExterno).map((v) => [v.idTransacaoExterno!, v.tipo]),
        );
        let bateram = 0;
        const amostraMatch: string[] = [];
        const linhasEnriquecidas = linhasCsv.map((l) => {
          const tipoVenda = l.sourceId ? tipoPorIdTransacao.get(l.sourceId) : undefined;
          if (!tipoVenda) return l;
          bateram++;
          if (amostraMatch.length < 5) {
            amostraMatch.push(`SOURCE_ID=${l.sourceId} → tipo venda="${tipoVenda}" (RECORD_TYPE original="${l.tipoTransacao}")`);
          }
          return { ...l, titulo: `Liquidação · ${db.labelTipoAdquirente(tipoVenda)}` };
        });

        const contaMp = await db.getOrCreateContaMercadoPago(input.unidadeId);
        const inseridos = await db.upsertInterExtratos(
          input.unidadeId,
          linhasEnriquecidas.map((l) => ({
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

        // upsertInterExtratos é insert-only (nunca atualiza linha já
        // existente, de propósito — não pode recalcular dreDescricaoId/
        // categorizacaoStatus a cada re-sync, senão apagaria categorização
        // manual). Então, pra linhas que já existiam de um sync anterior a
        // esse enriquecimento, o título novo não é gravado pelo upsert
        // acima — atualiza à parte, só o título, sem tocar em mais nada.
        for (const l of linhasEnriquecidas) {
          if (l.titulo?.startsWith("Liquidação · ")) {
            await db.atualizarTituloInterExtrato(input.unidadeId, l.idTransacao, l.titulo);
          }
        }

        const diagnosticoSourceId = `Cruzamento SOURCE_ID x idTransacaoExterno: ${bateram}/${linhasCsv.length} linhas bateram com vendas conhecidas (janela: ${seteDiasAntes(input.dataInicio)} a ${input.dataFim}, ${vendasDoPeriodo.length} vendas MP no período).${amostraMatch.length ? ` Amostra: ${amostraMatch.join(" | ")}` : ""}`;

        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "mercadopago_extrato",
          status: "sucesso",
          registrosProcessados: inseridos,
          detalhes: `Período: ${input.dataInicio} a ${input.dataFim}. Linhas no CSV: ${linhasCsv.length}. Novos: ${inseridos}. ${diagnosticoSourceId} Amostra CSV (500 chars): ${csvTexto.slice(0, 500)}`,
        });

        return { success: true, totalInseridos: inseridos, totalNoCsv: linhasCsv.length, bateramSourceId: bateram };
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
    sincronizarCaixaFisico: syncProcedure.input(z.object({
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
    sincronizar: syncProcedure.input(z.object({
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

    /**
     * Sincroniza a "Comanda virtual" (item a item, uma aba por dia) pro
     * período exato pedido — não pelo mês inteiro como `sincronizar`
     * acima (a Consolidado comanda tem uma aba por mês; a Comanda
     * virtual tem uma aba POR DIA, então sincronizar o mês inteiro toda
     * vez seria caro à toa quando só a semana visível importa). Alimenta
     * só o drill-down (hover) da linha "Comanda (Recepção)" — não muda
     * o número agregado, que continua vindo de comanda_diaria.
     */
    sincronizarItens: syncProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade) throw new Error("Unidade não encontrada");

      const isRbs = unidade.slug.includes("ribeirao") || unidade.slug.includes("rbs");
      const slug = isRbs ? "rbs" as const : "ssu" as const;
      const spreadsheetId = SPREADSHEET_IDS_COMANDA_VIRTUAL[slug];

      try {
        const dias: string[] = [];
        for (const d = new Date(`${input.dataInicio}T00:00:00`); fmtDateIso(d) <= input.dataFim; d.setDate(d.getDate() + 1)) {
          dias.push(fmtDateIso(d));
        }

        let totalItens = 0;
        let diasComDados = 0;
        const diasComErro: string[] = [];
        for (const dia of dias) {
          // Um dia falhando (rate limit do Google Sheets, timeout) não pode
          // derrubar o resto do período — sem isso, um erro transitório no
          // meio do mês cancelava a sincronização de todos os dias
          // seguintes, sem aviso claro do que ficou de fora. Uma
          // segunda tentativa (com uma pausa curta) resolve a maioria
          // dos casos de rate limit sem precisar de retry manual.
          try {
            let linhas;
            try {
              linhas = await lerComandaVirtualDiaSheet(spreadsheetId, dia);
            } catch {
              await new Promise((resolve) => setTimeout(resolve, 1500));
              linhas = await lerComandaVirtualDiaSheet(spreadsheetId, dia);
            }
            if (linhas.length === 0) continue;
            diasComDados++;
            const r = await db.upsertComandaItens(input.unidadeId, linhas);
            totalItens += r.inseridos + r.atualizados;
          } catch (erroDia: any) {
            console.error(`[ComandaItens] Falha no dia ${dia}:`, erroDia);
            diasComErro.push(dia);
          }
        }

        const detalhesErro = diasComErro.length > 0 ? ` Falhou em: ${diasComErro.join(", ")}.` : "";
        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "comanda_itens",
          status: diasComErro.length > 0 ? "erro" : "sucesso",
          registrosProcessados: totalItens,
          detalhes: `Período ${input.dataInicio} a ${input.dataFim}. Dias com dados: ${diasComDados}/${dias.length}.${detalhesErro}`,
        });
        if (diasComErro.length > 0) {
          throw new Error(`Sincronizado, mas falhou em ${diasComErro.length} dia(s): ${diasComErro.join(", ")}. Tenta sincronizar de novo.`);
        }
        return { success: true, totalItens, diasComDados };
      } catch (error: any) {
        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "comanda_itens",
          status: "erro",
          registrosProcessados: 0,
          detalhes: error.message,
        });
        throw error;
      }
    }),

    /**
     * Carga histórica da "Comanda virtual" a partir do arquivo baixado
     * do Drive (todas as abas "DDMMYYYY" de uma vez) — evita centenas
     * de chamadas à API do Sheets pra trazer o passado inteiro. O dia a
     * dia continua pelo `sincronizarItens` acima.
     */
    importarHistoricoItensXlsx: adminProcedure.input(z.object({
      unidadeId: z.number(),
      xlsxBase64: z.string().min(1),
    })).mutation(async ({ input }) => {
      const buffer = Buffer.from(input.xlsxBase64, "base64");
      const linhas = parseComandaVirtualXlsx(buffer);
      if (linhas.length === 0) {
        throw new Error("Nenhum lançamento encontrado na planilha (nenhuma aba no formato \"DDMMYYYY\" com dados).");
      }
      const resultado = await db.upsertComandaItens(input.unidadeId, linhas);
      const dias = new Set(linhas.map((l) => l.data));
      return { success: true, totalLinhas: linhas.length, totalDias: dias.size, ...resultado };
    }),

    itensDetalhe: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    })).query(async ({ input }) => {
      return db.listComandaItensDetalhe(input.unidadeId, input.dataInicio, input.dataFim);
    }),

    /**
     * Caminho inverso do `sincronizar` acima: escreve de volta na
     * planilha "Consolidado comanda" o que este sistema calcula como
     * "Contas bancárias" (débito/crédito/pix, já deduplicado) — linhas
     * 10/11/12, ver escreverContasBancariasSheet. Agrupa por mês porque
     * cada mês é uma aba diferente na planilha; o período pode cair em
     * mais de uma aba se a semana visível cruzar virada de mês.
     */
    sincronizarContasBancariasParaDrive: syncProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade) throw new Error("Unidade não encontrada");

      const isRbs = unidade.slug.includes("ribeirao") || unidade.slug.includes("rbs");
      const slug = isRbs ? "rbs" as const : "ssu" as const;
      const spreadsheetId = SPREADSHEET_IDS_COMANDA[slug];

      try {
        const conciliacaoPorDia = await db.calcularConciliacaoPorDia(input.unidadeId, input.dataInicio, input.dataFim);

        const porMes = new Map<string, LinhaContasBancariasParaSheet[]>();
        for (const dia of conciliacaoPorDia) {
          const chave = dia.data.slice(0, 7); // "AAAA-MM"
          const lista = porMes.get(chave) ?? [];
          lista.push({
            data: dia.data,
            cartaoDebito: dia.cartaoDebito,
            cartaoCredito: dia.cartaoCredito,
            pix: dia.pix,
            // null = conciliado (diferença zero) — escreve string vazia
            // para limpar a mensagem antiga da linha 20 da planilha
            textoConciliacao: dia.texto ?? "",
          });
          porMes.set(chave, lista);
        }

        let totalDias = 0;
        for (const [chave, linhas] of Array.from(porMes)) {
          const [ano, mes] = chave.split("-").map(Number);
          totalDias += await escreverContasBancariasSheet(spreadsheetId, slug, ano, mes, linhas);
        }

        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "comanda_contas_bancarias",
          status: "sucesso",
          registrosProcessados: totalDias,
          detalhes: `Período ${input.dataInicio} a ${input.dataFim}. Dias escritos: ${totalDias}.`,
        });
        return { success: true, totalDias };
      } catch (error: any) {
        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "comanda_contas_bancarias",
          status: "erro",
          registrosProcessados: 0,
          detalhes: error.message,
        });
        throw error;
      }
    }),

    /**
     * Um disparo por dia (por unidade) — dispara manualmente pelo botão
     * "Enviar recepção" ao lado de "Sincronizar com Drive". Reaproveita
     * o mesmo cálculo de conciliação que já vai pra linha 20 da
     * planilha, só que manda pro grupo do Telegram em vez de escrever
     * na planilha.
     */
    enviarRelatorioRecepcao: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade) throw new Error("Unidade não encontrada");

      // O grupo do Telegram (TELEGRAM_CHAT_ID_GRUPO_RECEPCAO) existe só
      // pra recepção da Shopping Santa Úrsula — Ribeirão Shopping não
      // tem grupo próprio ainda.
      const isRbs = unidade.slug.includes("ribeirao") || unidade.slug.includes("rbs");
      if (isRbs) throw new Error("Ribeirão Shopping ainda não tem grupo de Telegram configurado.");

      if (await db.jaEnviouRelatorioRecepcaoHoje(input.unidadeId)) {
        throw new Error("Relatório de pendências já foi enviado hoje para o grupo da recepção.");
      }

      const conciliacaoPorDia = await db.calcularConciliacaoPorDia(input.unidadeId, input.dataInicio, input.dataFim);
      const pendencias = conciliacaoPorDia
        .filter((dia) => dia.texto !== null)
        .sort((a, b) => a.data.localeCompare(b.data));

      if (pendencias.length === 0) {
        await db.marcarRelatorioRecepcaoEnviadoHoje(input.unidadeId);
        return { success: true, enviado: false, dias: 0 };
      }

      const texto = `📋 Pendências de conciliação — ${unidade.nome}\n\n${pendencias.map((dia) => dia.texto).join("\n\n")}`;
      await sendTelegramParaRecepcao(texto);
      await db.marcarRelatorioRecepcaoEnviadoHoje(input.unidadeId);
      return { success: true, enviado: true, dias: pendencias.length };
    }),

    statusEnvioRecepcao: protectedProcedure.input(z.object({
      unidadeId: z.number(),
    })).query(async ({ input }) => {
      return { jaEnviadoHoje: await db.jaEnviouRelatorioRecepcaoHoje(input.unidadeId) };
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
    sincronizarMercadoPago: syncProcedure.input(z.object({
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
              tipo: db.normalizarTipoAdquirente(p.payment_type_id, p.payment_method_id),
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

  // ===== Atendentes (identidade por PIN — ver server/atendenteAuth.ts) =====
  atendentes: router({
    list: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      return db.listAtendentesAtivos(input.unidadeId);
    }),

    listAdmin: adminProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      return db.listAtendentesAdmin(input.unidadeId);
    }),

    criar: adminProcedure.input(z.object({
      unidadeId: z.number(),
      nome: z.string().min(1),
      pin: z.string().regex(/^\d{4}$/, "PIN precisa ter 4 dígitos"),
    })).mutation(async ({ input }) => {
      const pinHash = hashPin(input.pin);
      const id = await db.criarAtendente(input.unidadeId, input.nome, pinHash);
      return { success: true, id };
    }),

    atualizar: adminProcedure.input(z.object({
      id: z.number(),
      nome: z.string().min(1).optional(),
      pin: z.string().regex(/^\d{4}$/, "PIN precisa ter 4 dígitos").optional(),
      ativo: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      const dados: { nome?: string; pinHash?: string; ativo?: boolean } = {};
      if (input.nome !== undefined) dados.nome = input.nome;
      if (input.pin !== undefined) dados.pinHash = hashPin(input.pin);
      if (input.ativo !== undefined) dados.ativo = input.ativo;
      await db.atualizarAtendente(input.id, dados);
      return { success: true };
    }),

    // Não é adminProcedure — qualquer um logado pode dizer "sou fulano
    // com esse PIN". A conta Google/Manus (protectedProcedure) já
    // barrou quem não devia nem chegar no computador da recepção; PIN
    // errado só retorna erro genérico, sem dizer se o ID existe.
    entrar: protectedProcedure.input(z.object({
      atendenteId: z.number(),
      pin: z.string().min(1),
    })).mutation(async ({ input, ctx }) => {
      const atendente = await db.getAtendenteComHash(input.atendenteId);
      if (!atendente || !atendente.ativo || !verifyPin(input.pin, atendente.pinHash)) {
        throw new Error("PIN inválido");
      }
      const expiraEm = new Date(Date.now() + ATENDENTE_SESSION_MS);
      const token = await db.criarSessaoAtendente(atendente.id, expiraEm);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(ATENDENTE_COOKIE_NAME, token, { ...cookieOptions, maxAge: ATENDENTE_SESSION_MS });
      return { success: true, nome: atendente.nome };
    }),

    sair: protectedProcedure.mutation(async ({ ctx }) => {
      const token = parseCookieHeader(ctx.req.headers.cookie ?? "")[ATENDENTE_COOKIE_NAME];
      if (token) await db.encerrarSessaoAtendente(token);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(ATENDENTE_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    atual: protectedProcedure.query(async ({ ctx }) => {
      return ctx.atendente;
    }),
  }),

  // ===== Controle de acesso por módulo (ver shared/modulos.ts) =====
  permissoes: router({
    // Não é adminProcedure — todo mundo precisa saber os próprios
    // módulos liberados pra filtrar o menu lateral.
    minhas: protectedProcedure.query(({ ctx }) => {
      if (!ctx.permissoesModulos) return { restrito: false, modulos: [] as string[], subsecoes: [] as string[] };
      return { restrito: true, modulos: Array.from(ctx.permissoesModulos), subsecoes: Array.from(ctx.permissoesSubsecoes) };
    }),

    listUsuarios: adminProcedure.query(async () => {
      return db.listUsuariosComPermissoes();
    }),

    convidar: adminProcedure.input(z.object({
      email: z.string().email(),
      nome: z.string().optional(),
    })).mutation(async ({ input }) => {
      const id = await db.criarConvite(input.email, input.nome?.trim() || null);
      return { success: true, id };
    }),

    alterarRole: adminProcedure.input(z.object({
      userId: z.number(),
      role: z.enum(["user", "admin"]),
    })).mutation(async ({ input }) => {
      await db.alterarRoleUsuario(input.userId, input.role);
      return { success: true };
    }),

    obter: adminProcedure.input(z.object({ userId: z.number() })).query(async ({ input }) => {
      const [permissoes, unidades] = await Promise.all([
        db.getPermissoesUsuario(input.userId),
        db.getUnidadesPermitidasUsuario(input.userId),
      ]);
      return { ...permissoes, unidadesRestrito: unidades.restrito, unidadeIds: unidades.unidadeIds };
    }),

    salvar: adminProcedure.input(z.object({
      userId: z.number(),
      modulos: z.array(z.string()),
      subsecoes: z.array(z.string()).optional(),
    })).mutation(async ({ input }) => {
      await db.salvarPermissoesUsuario(input.userId, input.modulos, input.subsecoes ?? []);
      return { success: true };
    }),

    removerRestricao: adminProcedure.input(z.object({ userId: z.number() })).mutation(async ({ input }) => {
      await db.removerRestricaoUsuario(input.userId);
      return { success: true };
    }),

    // Eixo independente de módulo/sub-seção — ver drizzle/schema.ts
    // users.unidadesCustomizadas.
    salvarUnidades: adminProcedure.input(z.object({
      userId: z.number(),
      restrito: z.boolean(),
      unidadeIds: z.array(z.number()),
    })).mutation(async ({ input }) => {
      await db.salvarUnidadesUsuario(input.userId, input.restrito, input.unidadeIds);
      return { success: true };
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

  // ===== Log de auditoria (trazido do mobai-crm) =====
  auditLog: router({
    list: adminProcedure.input(z.object({
      userId: z.number().optional(),
      atendenteId: z.number().optional(),
      procedureContains: z.string().optional(),
      apenasErros: z.boolean().default(false),
      cursorId: z.number().optional(),
      limit: z.number().min(1).max(200).default(50),
    })).query(async ({ input }) => {
      return db.listAuditLog(input);
    }),

    usuarios: adminProcedure.query(async () => {
      return db.listUsuariosParaFiltro();
    }),

    atendentes: adminProcedure.query(async () => {
      return db.listAtendentesParaFiltro();
    }),
  }),
});

export type AppRouter = typeof appRouter;
