import { COOKIE_NAME, ATENDENTE_COOKIE_NAME, ATENDENTE_SESSION_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure, adminProcedure, syncProcedure, confirmacaoPagamentoProcedure } from "./_core/trpc";
import { z } from "zod";
import { parse as parseCookieHeader } from "cookie";
import * as db from "./db";
import { DATA_ISO_REGEX } from "./terapeutasRelatorios";
import { hashPin, verifyPin } from "./atendenteAuth";
import { belleApi } from "./belleApi";
import { zapiApi } from "./zapiApi";
import { buddhaMktApi } from "./buddhaMktApi";
import { metaTemplatesApi } from "./metaTemplatesApi";
import { validarCorpo, validarCabecalho, extrairVariaveis } from "@shared/templateVariaveis";
import { telefoneCanonico } from "@shared/telefone";
import { storagePut, storageGetSignedUrl, normalizeStorageKey } from "./storage";
import { invokeLLM } from "./_core/llm";
import { interApi, getInterAccessToken, isTokenValid, dataEntradaDe, extrairContraparte, type InterTransacaoCompleta } from "./interApi";
import { sicrediApi, getSicrediAccessToken, isSicrediTokenValid } from "./sicrediApi";
import { parseExtratoInterPdf } from "./interExtratoPdfParser";
import { parseFaturaInterPdf } from "./interFaturaPdfParser";
import { parseFaturaSicrediPdf } from "./sicrediFaturaPdfParser";
import { parseClientesXlsx } from "./clientesXlsxParser";
import { parseAtendimentosBelleXlsx } from "./atendimentosBelleXlsxParser";
import { parseRegistrosFinanceirosBelleXlsx } from "./registrosFinanceirosBelleXlsxParser";
import { parsePlanosBelleXls, parseVinculosPlanosBelleXlsx } from "./planosBelleXlsParser";
import { parseComandaVirtualXlsx } from "./comandaVirtualXlsxParser";
import { parseExtratoOfx, parseSaldoOfx } from "./interExtratoOfxParser";
import { consultarTodosPagamentos, consultarPagamentoPorId, criarPreferenciaPagamento, cancelarPreferenciaPagamento, extrairValoresMp, criarRelatorioLiberado, listarRelatoriosLiberados, baixarRelatorioLiberado, parseRelatorioLiberadoMp, ehCompraEquipamentoPoint, resumirOrigemPagamentoMp, classificarOrigemPagamentoMp } from "./mercadoPagoApi";
import { combinarLinksConfirmacao, dataSaoPaulo, listarLinksConfirmadosLocalmente, listarLinksMercadoPagoRecentes, listarPixInterRecentes } from "./confirmacaoPagamento";
import { listarMigracoes, aplicarMigracao, marcarMigracaoAplicada, executarConsultaSql } from "./migracoesRunner";
import { PDFParse } from "pdf-parse";
import { lerCaixaFisicoSheet, SPREADSHEET_IDS, SPREADSHEET_ABAS, lerComandaConsolidadoSheet, SPREADSHEET_IDS_COMANDA, SPREADSHEET_IDS_COMANDA_VIRTUAL, lerComandaVirtualDiaSheet, preencherLinhaVaziaComandaVirtual, chaveComandaVirtualPorUnidade, SPREADSHEET_IDS_INFORME_VENDAS, escreverContasBancariasInforme, escreverBelleInforme } from "./googleSheets";
import { transcribeAudio } from "./_core/voiceTranscription";
import { sendTelegramParaRecepcao } from "./telegramApi";
import { UNIDADE_GRUPO_GERAL_RBS_ID, GRUPOS_CHAMADO_RBS, type ChaveGrupoChamado, grupoChamadoPadrao, conversaIdDoGrupoChamado, montarMensagemChamadoTerapeuta } from "./chamadoTerapeuta";
import { DEFAULT_INBOX_AI_MESSAGE_PROMPT, INBOX_AI_PROMPT_KEY, montarPedidoSugestaoMensagem } from "@shared/inboxAi";
import { iniciarExecucaoFluxo } from "./fluxos";
import { agentesRouter, tabelaPrecosRouter } from "./routers/agentes";
import * as agentesDb from "./agentesDb";
import { normalizarExtracaoCobrancaLink, normalizarValorCobranca, CONVERSA_GRUPO_RECEPCAO_EXCECAO_PARCELAMENTO_ID, montarMensagemExcecaoParcelamento } from "./cobrancaLink";
import { parcelamentoForaDoPadrao } from "@shared/cobrancaParcelamento";
import { normalizarSugestaoProximoAtendimento } from "./proximoAtendimentoIa";

const FORMAS_PAGAMENTO_COBRANCA = ["Não especificada", "Pix", "Cartão", "Pix ou cartão"] as const;

// Token configurado sozinho não basta: a unidade pode ter integração
// desligada em Configurações > Belle (belleAtivo=false) enquanto aguarda
// liberação de acesso do Belle Software — nesse caso não faz sentido
// tentar a chamada só pra falhar (rate limit, timeout, erro de auth).
// Type predicate (em vez de retornar boolean simples) pra manter o
// narrowing de unidade.belleToken de string|null pra string nos call
// sites, do jeito que `if (unidade?.belleToken)` já fazia antes.
type UnidadeComBelleToken = NonNullable<Awaited<ReturnType<typeof db.getUnidadeById>>> & { belleToken: string };
function belleIntegracaoAtiva(
  unidade: { belleToken?: string | null; belleAtivo?: boolean } | null | undefined
): unidade is UnidadeComBelleToken {
  return !!unidade?.belleToken && unidade.belleAtivo !== false;
}

function textoCobrancaComLink(texto: string, initPoint: string): string {
  const limpo = texto.trim();
  return limpo.includes(initPoint) ? limpo : `${limpo}\n${initPoint}`;
}

async function usuarioPodeOperarNaUnidade(user: { id: number; role: "user" | "admin" }, unidadeId: number): Promise<boolean> {
  const unidadesPermitidas = await db.getUnidadesParaUsuario(user.id, user.role);
  return unidadesPermitidas.some((unidade) => unidade.id === unidadeId);
}

/**
 * A sugestão manual é uma reescrita curta do rascunho da recepção. Sem uma
 * margem de saída, o gpt-5-mini pode consumir o limite inteiro em raciocínio
 * interno e devolver `content` vazio. Ferramentas também não fazem sentido
 * nesse fluxo e precisam ser desabilitadas explicitamente.
 */
export const INBOX_MANUAL_SUGGESTION_LLM_OPTIONS = {
  model: "gpt-5-mini",
  maxTokens: 1200,
  reasoningEffort: "low" as const,
  tools: [],
  toolChoice: "none" as const,
};

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
  z.object({ valor: z.number(), unidade: z.enum(["segundos", "minutos", "horas", "dias"]), mostrarDigitando: z.boolean().optional() }).strict(), // aguardar
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

/**
 * Mapeamento proativo telefone→lid (2026-08-15) + correção retroativa
 * das conversas @lid que já podem ser resolvidas com o mapeamento
 * resultante. Usado tanto pelo botão manual "Resolver LIDs" quanto
 * automaticamente ao fim de cada import de planilha (reconciliação —
 * cobre o cliente lançado direto no Belle no balcão assim que ele
 * aparece na próxima planilha, sem precisar clicar em nada).
 */
async function resolverEPromoverLids(unidade: NonNullable<Awaited<ReturnType<typeof db.getUnidadeById>>>) {
  if (!unidade.zapiInstanceId || !unidade.zapiToken || !unidade.zapiClientToken) {
    throw new Error("Unidade sem credenciais Z-API configuradas.");
  }

  const telefones = await db.listTelefonesCanonicosDaUnidade(unidade.slug);
  let resolvidos = 0;
  let semWhatsapp = 0;
  let erros = 0;
  const LOTE = 1000;
  for (let i = 0; i < telefones.length; i += LOTE) {
    const lote = telefones.slice(i, i + LOTE);
    try {
      const resultados = await zapiApi.phoneExistsBatch(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, lote);
      const linhas: Array<{ unidadeId: number; telefoneCanonico: string; lid: string }> = [];
      for (const r of resultados) {
        if (!r.exists || !r.lid) { semWhatsapp++; continue; }
        const canonico = telefoneCanonico(r.outputPhone || r.inputPhone);
        if (!canonico) continue;
        linhas.push({ unidadeId: unidade.id, telefoneCanonico: canonico, lid: r.lid });
      }
      await db.upsertLidMapping(linhas);
      resolvidos += linhas.length;
    } catch (error) {
      console.error("[resolverEPromoverLids] Falha no lote:", error);
      erros += lote.length;
    }
  }

  const conversasPromovidas = await db.promoverConversasPendentesPorLidMapping(unidade.id);
  return { totalTelefones: telefones.length, resolvidos, semWhatsapp, erros, conversasPromovidas };
}

export const appRouter = router({
  agentes: agentesRouter,
  tabelaPrecos: tabelaPrecosRouter,
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
      const unidades = await db.getUnidadesParaUsuario(ctx.user.id, ctx.user.role);
      if (ctx.user.role === "admin") return unidades;
      return unidades.map(db.unidadeSemCredenciais);
    }),
    get: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      return db.getUnidadeById(input.id);
    }),
    update: adminProcedure.input(z.object({
      id: z.number(),
      belleToken: z.string().optional(),
      belleAtivo: z.boolean().optional(),
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
      mpWebhookUrl: z.string().url().max(1000).optional(),
      mpWebhookSecret: z.string().max(500).optional(),
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
      const unidadeFisica = await db.getUnidadeFisicaPorFlag(input.unidade);
      if (unidadeFisica) {
        await db.createSyncLog({ unidadeId: unidadeFisica.id, tipo: "importacao_clientes", status: "sucesso", registrosProcessados: linhas.length, detalhes: "Relatório [Buddha] Clientes importado pela Manutenção de dados." });
      }

      // Reconciliação de @lid (2026-08-15): best-effort, nunca falha o
      // import — cobre o cliente lançado direto no Belle no balcão
      // (nunca esteve no CRM antes) assim que ele aparece na planilha.
      let lids: Awaited<ReturnType<typeof resolverEPromoverLids>> | null = null;
      try {
        const unidadeFisica = await db.getUnidadeFisicaPorFlag(input.unidade);
        if (unidadeFisica?.zapiInstanceId && unidadeFisica.zapiToken && unidadeFisica.zapiClientToken) {
          lids = await resolverEPromoverLids(unidadeFisica);
        }
      } catch (error) {
        console.error("[importarXlsx] Falha na reconciliação de @lid:", error);
      }

      return { success: true, totalLinhas: linhas.length, ...resultado, lids };
    }),

    statusImportacoesDados: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade || unidade.canal !== "zapi") throw new Error("Selecione uma unidade física.");
      return db.getStatusImportacoesDados(input.unidadeId);
    }),

    registrarFalhaImportacaoDados: adminProcedure.input(z.object({
      unidadeId: z.number(),
      tipo: z.enum(["clientes", "planos", "vinculos", "atendimentos"]),
      mensagem: z.string().min(1).max(2000),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade || unidade.canal !== "zapi") throw new Error("Selecione uma unidade física.");
      const tipos = { clientes: "importacao_clientes", planos: "importacao_planos", vinculos: "importacao_vinculos_planos", atendimentos: "importacao_atendimentos" } as const;
      await db.createSyncLog({ unidadeId: input.unidadeId, tipo: tipos[input.tipo], status: "erro", registrosProcessados: 0, detalhes: input.mensagem });
      return { success: true };
    }),

    /**
     * Espelha o relatório operacional de atendimentos exportado do Belle.
     * A unidade é escolhida explicitamente pela recepção para impedir mistura
     * de bases; o vínculo ao cliente só ocorre quando o telefone é único nela.
     */
    importarAtendimentosXlsx: adminProcedure.input(z.object({
      unidadeId: z.number(),
      xlsxBase64: z.string().min(1),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade) throw new Error("Unidade não encontrada.");
      if (unidade.canal !== "zapi") throw new Error("Selecione uma unidade física para importar atendimentos.");
      const linhas = parseAtendimentosBelleXlsx(Buffer.from(input.xlsxBase64, "base64"));
      if (linhas.length === 0) throw new Error("Nenhum atendimento válido foi encontrado no relatório.");
      const resultado = await db.upsertAtendimentosBelleImportados(input.unidadeId, linhas);
      await db.createSyncLog({ unidadeId: input.unidadeId, tipo: "importacao_atendimentos", status: "sucesso", registrosProcessados: linhas.length, detalhes: "Relatório de Atendimentos importado pela Manutenção de dados." });
      return { success: true, totalLinhas: linhas.length, ...resultado };
    }),

    /**
     * Recebe uma parte de até 512 KB pelo domínio autenticado da aplicação.
     * Cada parte é imediatamente armazenada, evitando limites de proxy e CORS.
     */
    enviarParteAtendimentos: adminProcedure.input(z.object({
      unidadeId: z.number(),
      uploadId: z.string().uuid(),
      indice: z.number().int().min(0).max(199),
      totalPartes: z.number().int().min(1).max(200),
      conteudoBase64: z.string().min(1).max(1_100_000),
    })).mutation(async ({ input, ctx }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade || unidade.canal !== "zapi") throw new Error("Selecione uma unidade física para importar atendimentos.");
      if (input.indice >= input.totalPartes) throw new Error("Índice de parte inválido.");
      const buffer = Buffer.from(input.conteudoBase64, "base64");
      if (buffer.length === 0 || buffer.length > 600_000) throw new Error("Parte do relatório fora do tamanho permitido.");
      const { key } = await storagePut(
        `importacoes/atendimentos-chunks/${ctx.user.id}/unidade-${input.unidadeId}/${input.uploadId}/parte-${input.indice}.bin`,
        buffer,
        "application/octet-stream",
      );
      return { storageKey: key };
    }),

    /** Recompõe e processa as partes já enviadas pelo domínio autenticado. */
    processarPartesAtendimentos: adminProcedure.input(z.object({
      unidadeId: z.number(),
      uploadId: z.string().uuid(),
      storageKeys: z.array(z.string().min(1)).min(1).max(200),
    })).mutation(async ({ input, ctx }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade || unidade.canal !== "zapi") throw new Error("Selecione uma unidade física para importar atendimentos.");
      const prefixoPermitido = `importacoes/atendimentos-chunks/${ctx.user.id}/unidade-${input.unidadeId}/${input.uploadId}/`;
      if (input.storageKeys.some((key) => !key.startsWith(prefixoPermitido))) throw new Error("Partes de relatório inválidas para a unidade selecionada.");
      const partes: Buffer[] = [];
      for (const storageKey of input.storageKeys) {
        const arquivo = await fetch(await storageGetSignedUrl(storageKey));
        if (!arquivo.ok) throw new Error(`Não foi possível recuperar uma parte do relatório (${arquivo.status}).`);
        partes.push(Buffer.from(await arquivo.arrayBuffer()));
      }
      const buffer = Buffer.concat(partes);
      if (buffer.length > 50 * 1024 * 1024) throw new Error("Relatório excede o limite de 50 MB.");
      const linhas = parseAtendimentosBelleXlsx(buffer);
      if (linhas.length === 0) throw new Error("Nenhum atendimento válido foi encontrado no relatório.");
      const resultado = await db.upsertAtendimentosBelleImportados(input.unidadeId, linhas);
      await db.createSyncLog({ unidadeId: input.unidadeId, tipo: "importacao_atendimentos", status: "sucesso", registrosProcessados: linhas.length, detalhes: `Relatório de Atendimentos importado em ${input.storageKeys.length} parte(s) autenticadas.` });
      return { success: true, totalLinhas: linhas.length, ...resultado };
    }),

    /** Espelha planos, sessões e saldos da exportação Belle da unidade escolhida. */
    importarPlanosXls: adminProcedure.input(z.object({
      unidadeId: z.number(),
      xlsxBase64: z.string().min(1),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade) throw new Error("Unidade não encontrada.");
      if (unidade.canal !== "zapi") throw new Error("Selecione uma unidade física para importar planos.");
      const relatorio = parsePlanosBelleXls(Buffer.from(input.xlsxBase64, "base64"));
      const resultado = await db.upsertPlanosBelleImportados(input.unidadeId, relatorio);
      await db.createSyncLog({ unidadeId: input.unidadeId, tipo: "importacao_planos", status: "sucesso", registrosProcessados: relatorio.planos.length, detalhes: "Relatório de Planos & Sessões importado pela Manutenção de dados." });
      return { success: true, totalPlanos: relatorio.planos.length, totalServicos: relatorio.servicos.length, ...resultado };
    }),

    /** Aplica uma exportação Belle que contém o elo explícito cliente–ID do plano. */
    importarVinculosPlanosXlsx: adminProcedure.input(z.object({
      unidadeId: z.number(),
      xlsxBase64: z.string().min(1),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade) throw new Error("Unidade não encontrada.");
      if (unidade.canal !== "zapi") throw new Error("Selecione uma unidade física para importar vínculos de planos.");
      const vinculos = parseVinculosPlanosBelleXlsx(Buffer.from(input.xlsxBase64, "base64"));
      const resultado = await db.aplicarVinculosPlanosBelle(input.unidadeId, vinculos);
      await db.createSyncLog({ unidadeId: input.unidadeId, tipo: "importacao_vinculos_planos", status: "sucesso", registrosProcessados: vinculos.length, detalhes: "Relatório de Sessões de Planos importado pela Manutenção de dados." });
      return { success: true, totalVinculos: vinculos.length, ...resultado };
    }),

    planosPendentesVinculo: adminProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      return db.listarPlanosBellePendentesVinculo(input.unidadeId);
    }),

    vincularPlanoManualmente: adminProcedure.input(z.object({
      unidadeId: z.number(),
      planoBelleId: z.number(),
      clienteId: z.number(),
    })).mutation(async ({ input }) => {
      return db.vincularPlanoBelleManualmente(input.unidadeId, input.planoBelleId, input.clienteId);
    }),

    historicoAtendimentosBelle: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      clienteId: z.number(),
    })).query(async ({ input }) => {
      return db.listarAtendimentosBellePorCliente(input.unidadeId, input.clienteId);
    }),

    planosBelle: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      clienteId: z.number(),
    })).query(async ({ input }) => {
      return db.listarPlanosBellePorCliente(input.unidadeId, input.clienteId);
    }),

    resumoImportados: protectedProcedure.query(async () => {
      return db.resumoClientesLocal();
    }),

    /**
     * Reconstrói o índice cliente_telefones (drizzle/schema.ts) do zero
     * a partir do cadastro atual e preenche telefoneNormalizado nas
     * conversas antigas — não muda nenhum vínculo cliente↔conversa
     * existente, só recalcula o índice e devolve um relatório de
     * auditoria (ver server/db.ts:backfillIndiceTelefones). Botão
     * manual em Clientes.tsx — não roda em cron nem no import.
     */
    reindexarTelefones: adminProcedure.mutation(async () => {
      return db.backfillIndiceTelefones();
    }),

    /**
     * Mapeamento proativo telefone→lid (2026-08-15) — resolve conversas
     * @lid não identificadas quando o WhatsApp mascara o número real
     * (ex.: confirmação de agendamento do Belle). A conversão @lid→
     * telefone não é suportada pela Z-API, mas o caminho inverso é
     * (zapiApi.phoneExistsBatch) — como já se sabe o telefone de todo
     * cliente cadastrado, resolve-se o lid de cada um ANTES de qualquer
     * mensagem chegar. Guarda em lid_mapping, usado pelo webhook Z-API
     * (server/webhooks.ts) como 2ª tentativa de resolução, e promove na
     * hora qualquer conversa já presa em @lid cujo mapeamento acabou de
     * ficar disponível (correção retroativa, sem esperar mensagem
     * nova). O mesmo fluxo roda automaticamente ao fim de cada
     * importação de planilha (ver importarXlsx) — cobre o cliente
     * lançado direto no Belle no balcão assim que ele aparecer na
     * próxima planilha.
     */
    resolverLids: adminProcedure.input(z.object({ unidadeId: z.number() })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade) throw new Error("Unidade não encontrada");
      return resolverEPromoverLids(unidade);
    }),

    // A busca e a ordenação permanecem locais porque a base cabe em uma
    // resposta, mas o recorte da unidade e o último contato são calculados no
    // servidor para não expor conversas de outra unidade.
    listImportados: protectedProcedure.input(z.object({ unidadeId: z.number().int().positive() }).optional()).query(async ({ input, ctx }) => {
      // O consumidor legado de Disparos usa a base completa para uma ação
      // administrativa. A tela Clientes sempre informa unidadeId e nunca usa
      // este ramo sem recorte.
      if (!input) {
        if (ctx.user.role !== "admin") throw new Error("A listagem completa de clientes é restrita a administradores.");
        return db.listClientesLocal();
      }
      if (!await usuarioPodeOperarNaUnidade(ctx.user, input.unidadeId)) {
        throw new Error("Sem acesso à unidade selecionada.");
      }
      return db.listClientesLocalPorUnidade(input.unidadeId);
    }),
  }),

  // ===== Kanban de Reativação =====
  kanban: router({
    list: protectedProcedure.input(z.object({
      unidadeId: z.number(),
    })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!belleIntegracaoAtiva(unidade)) throw new Error("Token Belle não configurado ou integração desativada");
      // Buscar todos os clientes (até 500 = 5 páginas)
      const allClientes: any[] = [];
      for (let p = 0; p < 5; p++) {
        const batch = await belleApi.listarClientes(unidade.belleToken, unidade.codEstab!, p);
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
    // Relatório de todos os atendimentos (qualquer status, passado ou
    // futuro) de um período — filtro define o recorte, sem status fixo.
    // Antes chamava a API ao vivo do Belle (belleApi.listarAgendamentos) —
    // nunca teve token configurado nesse projeto (tudo migrou pra
    // importação de planilha). Lê belle_atendimentos direto.
    list: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dataFim: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })).query(async ({ input }) => {
      return db.listarAgendaPeriodo(input.unidadeId, input.dataInicio, input.dataFim);
    }),
  }),
  proximosAtendimentos: router({
    listarHoje: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      return db.listarProximosAtendimentosHoje(input.unidadeId);
    }),
    opcoes: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      const [parametros, terapeutas] = await Promise.all([
        db.listChamadosParametros(input.unidadeId),
        db.listTerapeutasAtivos(input.unidadeId),
      ]);
      return { parametros, terapeutas };
    }),
    organizar: protectedProcedure.input(z.object({
      unidadeId: z.number(), atendimentoBelleId: z.number(), terapeutaNome: z.string().trim().nullable().optional(), sala: z.string().trim().nullable().optional(), preferencial: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      await db.salvarOrganizacaoProximoAtendimento(input);
      return { success: true };
    }),
    retirar: protectedProcedure.input(z.object({ unidadeId: z.number(), atendimentoBelleId: z.number() })).mutation(async ({ input, ctx }) => {
      await db.retirarProximoAtendimentoDaLista(input.unidadeId, input.atendimentoBelleId, ctx.user.id);
      return { success: true };
    }),
    banhosImersaoHoje: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      return db.listarBanhosImersaoHoje(input.unidadeId);
    }),
  }),

  // ===== Serviços =====
  servicos: router({
    // Antes consultava o catálogo do Belle (belleApi.listarServicos). A
    // integração Belle foi desligada nas duas unidades (2026-08), então
    // reaproveita a Tabela de Preços — já mantida manualmente — como
    // catálogo de terapias liberáveis. `codigo` aqui é o id da linha na
    // tabela de preços, não mais o código Belle (ver terapeutasLiberacoes
    // abaixo pro impacto disso nas liberações já salvas).
    list: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      const precos = await agentesDb.listarTabelaPrecos({ unidadeId: input.unidadeId, apenasAtivos: true });
      return precos.map((preco) => ({ codigo: preco.id, nome: preco.servico }));
    }),
  }),

  // ===== Planos =====
  planos: router({
    list: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!belleIntegracaoAtiva(unidade)) throw new Error("Token Belle não configurado ou integração desativada");
      return belleApi.listarPlanos(unidade.belleToken, unidade.codEstab!);
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
      if (!belleIntegracaoAtiva(unidade)) throw new Error("Token Belle não configurado ou integração desativada");
      return belleApi.relatorioVendas(unidade.belleToken, unidade.codEstab!, {
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
      if (!belleIntegracaoAtiva(unidade)) throw new Error("Token Belle não configurado ou integração desativada");
      return belleApi.listarRecebimentos(unidade.belleToken, unidade.codEstab!, {
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

    // Dashboard — faturamento/vendas vêm da Comanda (Recepção, planilha
    // já sincronizada) e agendamentos de belle_atendimentos (import +
    // reconhecimento automático via IA) — nunca mais depende da API ao
    // vivo do Belle, que nunca teve token configurado nesse projeto.
    dashboard: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      // Período exibido no Dashboard — padrão é o mês atual quando omitido.
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    })).query(async ({ input }) => {
      const hoje = new Date();
      const hojeIso = fmtDateIso(hoje);
      const dataInicioIso = input.dataInicio ?? fmtDateIso(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
      const dataFimIso = input.dataFim ?? hojeIso;

      const [comandaDias, totalVendasMes, recebimentosMes, agendamentosPeriodo, agendamentosHojeLista] = await Promise.all([
        db.listComandaDiaria(input.unidadeId, dataInicioIso, dataFimIso),
        db.contarVendasComandaPeriodo(input.unidadeId, dataInicioIso, dataFimIso),
        totalContasBancariasNoPeriodo(input.unidadeId, dataInicioIso, dataFimIso).catch(() => 0),
        db.listarAgendaPeriodo(input.unidadeId, dataInicioIso, dataFimIso),
        db.listarAgendaPeriodo(input.unidadeId, hojeIso, hojeIso),
      ]);

      const faturamentoMes = comandaDias.reduce((acc, d) =>
        acc + Number(d.dinheiro) + Number(d.cartaoDebito) + Number(d.cartaoCredito) + Number(d.pix), 0);

      return {
        faturamentoMes,
        totalVendasMes,
        recebimentosMes,
        agendamentosHoje: agendamentosHojeLista.length,
        totalAgendamentos: agendamentosPeriodo.length,
      };
    }),

    // Dashboard consolidado — ambas as unidades, mesma fonte local
    dashboardConsolidado: protectedProcedure.input(z.object({
      dataInicio: z.string().optional(),
      dataFim: z.string().optional(),
    }).optional()).query(async ({ input }) => {
      // Buddha Mkt é uma unidade sintética (canal de WhatsApp de marketing,
      // sem Comanda/contas bancárias reais) — não entra em comparativo financeiro.
      const unidades = (await db.getUnidades()).filter((u) => u.canal !== "buddha_mkt");
      const hoje = new Date();
      const hojeIso = fmtDateIso(hoje);
      const dataInicioIso = input?.dataInicio ?? fmtDateIso(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
      const dataFimIso = input?.dataFim ?? hojeIso;

      const resultados = await Promise.all(
        unidades.map(async (unidade) => {
          try {
            const [comandaDias, totalVendasMes, recebimentosMes, agendamentosPeriodo, agendamentosHojeLista] = await Promise.all([
              db.listComandaDiaria(unidade.id, dataInicioIso, dataFimIso),
              db.contarVendasComandaPeriodo(unidade.id, dataInicioIso, dataFimIso),
              totalContasBancariasNoPeriodo(unidade.id, dataInicioIso, dataFimIso).catch(() => 0),
              db.listarAgendaPeriodo(unidade.id, dataInicioIso, dataFimIso),
              db.listarAgendaPeriodo(unidade.id, hojeIso, hojeIso),
            ]);

            const faturamentoMes = comandaDias.reduce((acc, d) =>
              acc + Number(d.dinheiro) + Number(d.cartaoDebito) + Number(d.cartaoCredito) + Number(d.pix), 0);

            return {
              unidadeId: unidade.id,
              nome: unidade.nome,
              corTema: unidade.corTema,
              faturamentoMes,
              totalVendasMes,
              recebimentosMes,
              agendamentosHoje: agendamentosHojeLista.length,
              totalAgendamentos: agendamentosPeriodo.length,
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
      if (belleIntegracaoAtiva(unidade)) {
        try {
          const { unidadeId, ...leadData } = input;
          const result = await belleApi.gravarLead(unidade.belleToken, {
            ...leadData,
            codEstab: unidade.codEstab!,
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

      if (input.clienteCpf && belleIntegracaoAtiva(unidade)) {
        try {
          const cliente = await belleApi.buscarCliente(unidade.belleToken, unidade.codEstab!, {
            cpf: input.clienteCpf,
          });
          const planos = await belleApi.planosCliente(unidade.belleToken, cliente.codigo, unidade.codEstab!).catch(() => []);

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

      /** Tela "Tratamento de erros → LIDs não resolvidos" (2026-08-15). */
      listLidsPendentes: adminProcedure.query(async () => {
        return db.listConversasLidPendente();
      }),

      /**
       * Rebusca as fotos de perfil perdidas na troca de storage pro R2
       * (2026-08-23) — mesma lógica do webhook (server/webhooks.ts), só
       * que disparada manualmente pra não depender de cada contato mandar
       * mensagem de novo. Processa só um lote por chamada (padrão igual ao
       * de atendimentosUploadRoute.ts "processar-lote"): uma lista grande
       * de conversas sem foto, com o delay de rate-limit da Z-API entre
       * cada uma, estourava o timeout do proxy do host e voltava como
       * página HTML em vez de JSON (erro real visto em produção). Quem
       * chama repete a chamada, com o unidadeId, até `restantes` zerar.
       */
      recuperarFotos: adminProcedure.input(z.object({ unidadeId: z.number(), limite: z.number().int().positive().max(30).optional() })).mutation(async ({ input }) => {
        const unidade = await db.getUnidadeById(input.unidadeId);
        if (!unidade?.zapiInstanceId || !unidade.zapiToken || !unidade.zapiClientToken) {
          throw new Error("Z-API não configurado para esta unidade");
        }
        const todasSemFoto = await db.listConversasZapiSemFoto(input.unidadeId);
        const limite = input.limite ?? 15;
        const lote = todasSemFoto.slice(0, limite);
        let recuperadas = 0;
        let semFotoNoWhatsapp = 0;
        let falhas = 0;
        for (const conversa of lote) {
          try {
            const fotoWhatsappUrl = conversa.isGrupo === "true"
              ? await zapiApi.getGroupPhoto(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, conversa.telefone)
              : await zapiApi.getProfilePicture(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, conversa.telefone);
            if (!fotoWhatsappUrl) { semFotoNoWhatsapp++; await db.marcarConversaSemFotoWhatsapp(conversa.id); continue; }
            const imgResp = await fetch(fotoWhatsappUrl);
            if (!imgResp.ok) { falhas++; continue; }
            const buffer = Buffer.from(await imgResp.arrayBuffer());
            const contentType = imgResp.headers.get("content-type") || "image/jpeg";
            const chaveSegura = conversa.telefone.replace(/[^a-zA-Z0-9_-]/g, "_");
            const { url } = await storagePut(`inbox-fotos-perfil/${chaveSegura}.jpg`, buffer, contentType);
            await db.atualizarFotoConversa(conversa.id, url);
            recuperadas++;
          } catch {
            falhas++;
          }
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
        return { total: todasSemFoto.length, processadas: lote.length, restantes: todasSemFoto.length - lote.length, recuperadas, semFotoNoWhatsapp, falhas };
      }),

      abrirPorCliente: protectedProcedure.input(z.object({
        clienteId: z.number(),
        unidadeId: z.number(),
      })).mutation(async ({ input, ctx }) => {
        const conversaId = await db.abrirInboxPorCliente(input);
        if (!conversaId) throw new Error("Não foi possível abrir o Inbox");
        if (ctx.atendente?.id) await db.atribuirConsultorResponsavelInbox(conversaId, ctx.atendente.id);
        return { conversaId };
      }),

      /** Igual a abrirPorCliente, mas a partir de um telefone (Próximos Atendimentos nem sempre tem clienteId vinculado). */
      abrirPorTelefone: protectedProcedure.input(z.object({
        telefone: z.string().trim().min(8),
        unidadeId: z.number(),
        clienteId: z.number().optional(),
        clienteNome: z.string().trim().min(1),
      })).mutation(async ({ input, ctx }) => {
        const conversaId = await db.abrirInboxPorTelefone({
          telefone: input.telefone,
          unidadeId: input.unidadeId,
          clienteId: input.clienteId ?? null,
          nomeContato: input.clienteNome,
        });
        if (!conversaId) throw new Error("Não foi possível abrir o Inbox");
        if (ctx.atendente?.id) await db.atribuirConsultorResponsavelInbox(conversaId, ctx.atendente.id);
        return { conversaId };
      }),

      /** Cancelar/editar o "próximo atendimento" mostrado no painel do cliente. */
      cancelarProximoAtendimento: protectedProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
        await db.cancelarAtendimentoBelle(input.id);
        return { success: true };
      }),

      editarProximoAtendimento: protectedProcedure.input(z.object({
        id: z.number(),
        dataAtendimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        horario: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
        servicoNome: z.string().nullable().optional(),
      })).mutation(async ({ input: { id, ...dados } }) => {
        await db.editarAtendimentoBelle(id, dados);
        return { success: true };
      }),

      criarProximoAtendimento: protectedProcedure.input(z.object({
        conversaId: z.number(),
        dataAtendimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        horario: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
        servicoNome: z.string().trim().min(2).max(250).nullable(),
      })).mutation(async ({ input, ctx }) => {
        const conversa = await db.getInboxConversaById(input.conversaId);
        if (!conversa?.unidadeId || !conversa.clienteId || conversa.isGrupo === "true") {
          throw new Error("O próximo atendimento só pode ser incluído para um cliente vinculado a uma conversa individual");
        }
        if (!(await usuarioPodeOperarNaUnidade(ctx.user, conversa.unidadeId))) throw new Error("Sem acesso à unidade desta conversa");
        const hojeBrt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
        if (input.dataAtendimento < hojeBrt) throw new Error("Informe uma data de hoje ou futura para o próximo atendimento");
        const id = await db.criarProximoAtendimentoInbox({
          unidadeId: conversa.unidadeId,
          clienteId: conversa.clienteId,
          clienteNome: conversa.clienteNome ?? conversa.nomeContato ?? "Cliente",
          telefone: conversa.telefone ?? null,
          dataAtendimento: input.dataAtendimento,
          horario: input.horario,
          servicoNome: input.servicoNome,
        });
        return { id };
      }),

      sugerirProximoAtendimento: protectedProcedure.input(z.object({ conversaId: z.number() })).mutation(async ({ input, ctx }) => {
        const conversa = await db.getInboxConversaById(input.conversaId);
        if (!conversa?.unidadeId || !conversa.clienteId || conversa.isGrupo === "true") {
          throw new Error("A IA só pode atualizar o próximo atendimento de um cliente vinculado a uma conversa individual");
        }
        if (!(await usuarioPodeOperarNaUnidade(ctx.user, conversa.unidadeId))) throw new Error("Sem acesso à unidade desta conversa");
        const mensagens = await db.listInboxMensagens(input.conversaId, 10);
        const contexto = mensagens.map((mensagem) => {
          const conteudo = mensagem.conteudo?.trim() || mensagem.transcricao?.trim() || "(sem conteúdo textual)";
          return `${mensagem.direcao === "recebida" ? "Cliente" : "Equipe"}: ${conteudo}`;
        }).join("\n");
        if (!contexto) throw new Error("Não há mensagens recentes para analisar");
        const hojeBrt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
        try {
          const resposta = await invokeLLM({
            model: "gpt-5-mini",
            maxTokens: 600,
            tools: [],
            toolChoice: "none",
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "sugestao_proximo_atendimento",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    dataAtendimento: { type: ["string", "null"] },
                    horario: { type: ["string", "null"] },
                    servicoNome: { type: ["string", "null"] },
                    confianca: { type: "integer", minimum: 0, maximum: 100 },
                    justificativa: { type: "string" },
                  },
                  required: ["dataAtendimento", "horario", "servicoNome", "confianca", "justificativa"],
                  additionalProperties: false,
                },
              },
            },
            messages: [
              { role: "system", content: `Você extrai somente dados de um próximo atendimento para a prévia editável da recepção. Hoje, no fuso de São Paulo, é ${hojeBrt}. Não agenda, não confirma disponibilidade e não inventa dados. Preencha data apenas quando ela for explícita ou quando a conversa trouxer hoje, amanhã ou um dia da semana claramente convertível a partir de hoje. Preencha horário e serviço apenas quando explícitos. Use null em qualquer dúvida. Responda somente com JSON compatível com o schema.` },
              { role: "user", content: `Analise exclusivamente as últimas mensagens abaixo e sugira os campos do próximo atendimento.\n\n${contexto}` },
            ],
          });
          const conteudo = resposta.choices[0]?.message.content;
          return normalizarSugestaoProximoAtendimento(typeof conteudo === "string" ? conteudo : null);
        } catch (error) {
          console.error("[Próximo atendimento] Falha na sugestão assistida:", error);
          throw new Error("Não foi possível atualizar a prévia pela conversa agora. Revise ou preencha os campos manualmente.");
        }
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

      get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input, ctx }) => {
        const conversa = await db.getInboxConversaById(input.id);
        if (conversa) await db.marcarInboxConversaLida(input.id);
        if (ctx.atendente?.id) await db.atribuirConsultorResponsavelInbox(input.id, ctx.atendente.id);
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

      /**
       * "Vincular a este cliente" — telefone bate com 2+ clientes Belle
       * (ex.: mãe e filha cadastradas com o mesmo celular). Não dá pra
       * adivinhar quem está mandando mensagem só pelo número, então o
       * painel do Inbox lista os candidatos e a recepção escolhe com 1
       * clique, em vez de criar um cadastro duplicado ou ficar sem
       * vincular pra sempre.
       */
      vincularCliente: protectedProcedure.input(z.object({
        conversaId: z.number(),
        clienteId: z.number(),
      })).mutation(async ({ input }) => {
        await db.vincularClienteAConversa(input.conversaId, input.clienteId);
        return { success: true };
      }),

      alterarStatus: protectedProcedure.input(z.object({
        id: z.number(),
        status: z.enum(["aberta", "encerrada"]),
      })).mutation(async ({ input }) => {
        await db.alterarStatusInboxConversa(input.id, input.status);
        return { success: true };
      }),

      definirAutomacaoAgentes: protectedProcedure.input(z.object({
        id: z.number(),
        modo: z.enum(["ativa", "bloqueada_temporariamente", "bloqueada_permanentemente"]),
      })).mutation(async ({ input }) => {
        const resultado = await db.definirAutomacaoAgentesInboxConversa(input.id, input.modo);
        if (input.modo === "bloqueada_permanentemente") {
          await agentesDb.reiniciarEstadoConversa(input.id);
        }
        return resultado;
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
        return db.resolverMembrosGrupo(unidade.id, participantes, nomesConhecidos);
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
      listPaginada: protectedProcedure.input(z.object({
        conversaId: z.number(),
        limit: z.number().int().min(1).max(200).default(15),
        antesDe: z.string().datetime().optional(),
      })).query(async ({ input }) => {
        return db.listInboxMensagensPaginada({
          conversaId: input.conversaId,
          limit: input.limit,
          antesDe: input.antesDe ? new Date(input.antesDe) : null,
        });
      }),

      // Poll incremental ("o que chegou desde a mensagem mais nova que já
      // tenho") — substitui reconsultar "as N mais recentes" a cada 8s,
      // que podia soltar uma mensagem da tela numa conversa ativa
      // (2026-09-02).
      mensagensDesde: protectedProcedure.input(z.object({
        conversaId: z.number(),
        desde: z.string().datetime(),
      })).query(async ({ input }) => {
        return db.listInboxMensagensDesde({ conversaId: input.conversaId, desde: new Date(input.desde) });
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
            ...INBOX_MANUAL_SUGGESTION_LLM_OPTIONS,
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

      // emoji="" remove a reação já enviada (mesmo botão clicado de novo,
      // ver Mensagens.tsx). Só canal zapi por enquanto — Buddha Mkt usa a
      // Cloud API oficial da Meta, que tem endpoint próprio de reação
      // ainda não portado (fora de escopo aqui).
      reagir: protectedProcedure.input(z.object({
        mensagemId: z.number(),
        emoji: z.string().max(8),
      })).mutation(async ({ input }) => {
        const mensagem = await db.getInboxMensagemById(input.mensagemId);
        if (!mensagem) throw new Error("Mensagem não encontrada");
        if (!mensagem.zapiMessageId) throw new Error("Essa mensagem não pode receber reação (sem messageId da Z-API)");

        const conversa = await db.getInboxConversaById(mensagem.conversaId);
        if (!conversa) throw new Error("Conversa não encontrada");
        if (conversa.canal !== "zapi" || !conversa.unidadeId) {
          throw new Error("Reação só é suportada em conversas do WhatsApp (Z-API) por enquanto");
        }
        const unidade = await db.getUnidadeById(conversa.unidadeId);
        if (!unidade?.zapiInstanceId || !unidade.zapiToken || !unidade.zapiClientToken) {
          throw new Error("Z-API não configurado para esta unidade");
        }

        try {
          await zapiApi.sendReaction(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, conversa.telefone, mensagem.zapiMessageId, input.emoji);
        } catch (error) {
          console.error("[Inbox] Falha ao enviar reação:", error);
          const detalhe = error instanceof Error ? error.message : "erro desconhecido";
          throw new Error(`Falha ao enviar reação: ${detalhe}`);
        }

        await db.atualizarReacaoMensagem(input.mensagemId, input.emoji);
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

  // ===== Cobrança individual por Link Mercado Pago =====
  cobrancasLink: router({
    configuracao: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input, ctx }) => {
      if (!(await usuarioPodeOperarNaUnidade(ctx.user, input.unidadeId))) throw new Error("Sem acesso a esta unidade");
      const unidade = await db.getUnidadeById(input.unidadeId);
      return {
        mercadoPagoConfigurado: Boolean(unidade?.mpAccessToken),
        webhookConfigurado: Boolean(unidade?.mpWebhookUrl && unidade?.mpWebhookSecret),
      };
    }),

    aberta: protectedProcedure.input(z.object({ conversaId: z.number() })).query(async ({ input, ctx }) => {
      const conversa = await db.getInboxConversaById(input.conversaId);
      if (!conversa?.unidadeId || conversa.isGrupo === "true") return null;
      if (!(await usuarioPodeOperarNaUnidade(ctx.user, conversa.unidadeId))) throw new Error("Sem acesso à unidade desta conversa");
      const cobranca = await db.getCobrancaLinkAbertaPorConversa(input.conversaId);
      if (!cobranca) return null;
      return {
        id: cobranca.id,
        titulo: cobranca.titulo,
        valor: cobranca.valor,
        parcelas: cobranca.parcelas,
        status: cobranca.status,
        enviadaEm: cobranca.enviadaEm,
        initPoint: cobranca.initPoint,
      };
    }),

    modelos: router({
      list: protectedProcedure.input(z.object({ unidadeId: z.number(), incluirInativos: z.boolean().optional() })).query(async ({ input, ctx }) => {
        if (!(await usuarioPodeOperarNaUnidade(ctx.user, input.unidadeId))) throw new Error("Sem acesso a esta unidade");
        return db.listModelosCobrancaLink(input.unidadeId, ctx.user.role === "admin" && Boolean(input.incluirInativos));
      }),
      create: adminProcedure.input(z.object({
        unidadeId: z.number(),
        titulo: z.string().trim().min(2).max(200),
        descricao: z.string().trim().max(2000).optional(),
        valor: z.number().positive().max(999999.99),
        formaPagamentoInformada: z.enum(FORMAS_PAGAMENTO_COBRANCA).optional(),
        parcelas: z.number().int().min(1).max(12).default(1),
        ordem: z.number().int().min(0).max(999).optional(),
      })).mutation(async ({ input, ctx }) => {
        if (!(await usuarioPodeOperarNaUnidade(ctx.user, input.unidadeId))) throw new Error("Sem acesso a esta unidade");
        const id = await db.criarModeloCobrancaLink({
          unidadeId: input.unidadeId,
          titulo: input.titulo,
          descricao: input.descricao || null,
          valor: normalizarValorCobranca(input.valor).toFixed(2),
          formaPagamentoInformada: input.formaPagamentoInformada ?? null,
          parcelas: input.parcelas,
          ordem: input.ordem ?? 0,
        });
        return { id };
      }),
      update: adminProcedure.input(z.object({
        id: z.number(),
        unidadeId: z.number(),
        titulo: z.string().trim().min(2).max(200),
        descricao: z.string().trim().max(2000).optional(),
        valor: z.number().positive().max(999999.99),
        formaPagamentoInformada: z.enum(FORMAS_PAGAMENTO_COBRANCA).optional(),
        parcelas: z.number().int().min(1).max(12).default(1),
        ativo: z.boolean(),
        ordem: z.number().int().min(0).max(999),
      })).mutation(async ({ input, ctx }) => {
        if (!(await usuarioPodeOperarNaUnidade(ctx.user, input.unidadeId))) throw new Error("Sem acesso a esta unidade");
        await db.atualizarModeloCobrancaLink(input.id, {
          titulo: input.titulo,
          descricao: input.descricao || null,
          valor: normalizarValorCobranca(input.valor).toFixed(2),
          formaPagamentoInformada: input.formaPagamentoInformada ?? null,
          parcelas: input.parcelas,
          ativo: input.ativo,
          ordem: input.ordem,
        });
        return { success: true };
      }),
    }),

    extrairDaConversa: protectedProcedure.input(z.object({ conversaId: z.number() })).mutation(async ({ input, ctx }) => {
      const conversa = await db.getInboxConversaById(input.conversaId);
      if (!conversa?.unidadeId || conversa.isGrupo === "true") throw new Error("A cobrança só pode usar uma conversa individual vinculada a uma unidade");
      if (!(await usuarioPodeOperarNaUnidade(ctx.user, conversa.unidadeId))) throw new Error("Sem acesso à unidade desta conversa");
      const mensagens = await db.listInboxMensagens(input.conversaId, 10);
      const contexto = mensagens.map((mensagem) => {
        const conteudo = mensagem.conteudo?.trim() || mensagem.transcricao?.trim() || "(sem conteúdo textual)";
        return `${mensagem.direcao === "recebida" ? "Cliente" : "Equipe"}: ${conteudo}`;
      }).join("\n");
      if (!contexto) throw new Error("Não há mensagens recentes para analisar");
      try {
        const resposta = await invokeLLM({
          model: "gpt-5-mini",
          maxTokens: 600,
          tools: [],
          toolChoice: "none",
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "extracao_cobranca_link",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  titulo: { type: ["string", "null"] },
                  descricao: { type: ["string", "null"] },
                  valor: { type: ["number", "null"] },
                  formaPagamentoMencionada: { type: ["string", "null"] },
                  confianca: { type: "integer", minimum: 0, maximum: 100 },
                  justificativa: { type: "string" },
                },
                required: ["titulo", "descricao", "valor", "formaPagamentoMencionada", "confianca", "justificativa"],
                additionalProperties: false,
              },
            },
          },
          messages: [
            { role: "system", content: "Você extrai dados para uma cobrança manual no Brasil. Não cria cobrança, não decide preço e não inventa dados. Só preencha valor se um valor monetário final estiver explícito nas mensagens; em dúvida, use null. A resposta será apenas JSON compatível com o schema." },
            { role: "user", content: `Analise somente as últimas mensagens abaixo. Sugira título e descrição apenas se o serviço ou produto estiver claro. Informe a forma de pagamento apenas se for mencionada.\n\n${contexto}` },
          ],
        });
        const conteudo = resposta.choices[0]?.message.content;
        return normalizarExtracaoCobrancaLink(typeof conteudo === "string" ? conteudo : null);
      } catch (error) {
        console.error("[Cobrança Link] Falha na extração assistida:", error);
        throw new Error("Não foi possível trazer os dados da conversa agora. Preencha manualmente e revise antes de enviar.");
      }
    }),

    criarEEnviar: protectedProcedure.input(z.object({
      conversaId: z.number(),
      titulo: z.string().trim().min(2).max(200),
      descricao: z.string().trim().max(2000).optional(),
      valor: z.number().positive().max(999999.99),
      formaPagamentoInformada: z.enum(FORMAS_PAGAMENTO_COBRANCA).optional(),
      parcelas: z.number().int().min(1).max(12).default(1),
      // Obrigatória só quando parcelamentoForaDoPadrao(valor, parcelas) —
      // não trava o envio, só exige essa justificativa quando foge da
      // regra normal (parcela mínima R$100, máximo 3x).
      excecaoParcelamento: z.object({
        motivo: z.string().trim().min(3).max(500),
        autorizador: z.string().trim().min(2).max(200),
      }).optional(),
      textoWhatsapp: z.string().trim().min(2).max(3500),
      reutilizarCobrancaAberta: z.boolean().default(false),
      confirmarCriacaoEEnvio: z.literal(true),
    })).mutation(async ({ input, ctx }) => {
      if (parcelamentoForaDoPadrao(input.valor, input.parcelas) && !input.excecaoParcelamento) {
        throw new Error("Esse parcelamento foge da regra padrão (mínimo R$100 por parcela, máximo 3x) — informe motivo e autorizador para prosseguir.");
      }
      const conversa = await db.getInboxConversaById(input.conversaId);
      if (!conversa?.unidadeId || conversa.isGrupo === "true") throw new Error("A cobrança só pode ser enviada em uma conversa individual vinculada a uma unidade");
      if (!(await usuarioPodeOperarNaUnidade(ctx.user, conversa.unidadeId))) throw new Error("Sem acesso à unidade desta conversa");
      if (!(await db.mensageriaEstaAtiva())) throw new Error("Envio de mensagens pausado — kill switch de mensageria ativado por um administrador");
      const unidade = await db.getUnidadeById(conversa.unidadeId);
      if (!unidade?.mpAccessToken) throw new Error("Mercado Pago não configurado para esta unidade");
      if (!unidade.mpWebhookUrl || !unidade.mpWebhookSecret) throw new Error("Configure a URL HTTPS e a assinatura secreta do Webhook Mercado Pago antes de criar Links para esta unidade");
      let urlNotificacao: URL;
      try {
        urlNotificacao = new URL(unidade.mpWebhookUrl);
      } catch {
        throw new Error("A URL de Webhook Mercado Pago configurada é inválida");
      }
      if (urlNotificacao.protocol !== "https:") throw new Error("A URL de Webhook Mercado Pago precisa usar HTTPS");

      const aberta = await db.getCobrancaLinkAbertaPorConversa(input.conversaId);
      let cobranca = aberta;
      if (aberta && !input.reutilizarCobrancaAberta) {
        throw new Error("Já existe um Link aberto para este cliente. Revise a cobrança existente e confirme se deseja reenviá-lo.");
      }

      if (!cobranca) {
        const externalReference = `buddha-link-${conversa.unidadeId}-${crypto.randomUUID()}`;
        const cobrancaId = await db.criarCobrancaLink({
          unidadeId: conversa.unidadeId,
          conversaId: conversa.id,
          clienteId: conversa.clienteId ?? null,
          clienteNome: conversa.nomeContato?.trim() || "Cliente sem nome",
          responsavelUserId: ctx.user.id,
          responsavelAtendenteId: ctx.atendente?.id ?? null,
          titulo: input.titulo,
          descricao: input.descricao || null,
          valor: normalizarValorCobranca(input.valor).toFixed(2),
          formaPagamentoInformada: input.formaPagamentoInformada ?? null,
          parcelas: input.parcelas,
          externalReference,
          chaveAberta: db.chaveCobrancaAberta(input.conversaId),
        });
        if (!cobrancaId) throw new Error("Não foi possível registrar a cobrança antes da criação do Link");
        cobranca = await db.getCobrancaLinkPorId(cobrancaId);
        if (!cobranca) throw new Error("Cobrança não encontrada após o registro");
        const cobrancaCriada = cobranca;
        try {
          const preferencia = await criarPreferenciaPagamento(unidade.mpAccessToken, {
            titulo: cobrancaCriada.titulo,
            descricao: cobrancaCriada.descricao,
            valor: Number(cobrancaCriada.valor),
            externalReference: cobrancaCriada.externalReference,
            notificationUrl: urlNotificacao.toString(),
            parcelas: cobrancaCriada.parcelas,
          });
          const initPoint = preferencia.init_point;
          if (!preferencia.id || !initPoint) throw new Error("O Mercado Pago não retornou uma URL de pagamento válida");
          await db.atualizarCobrancaLink(cobrancaCriada.id, { status: "criada", preferenceId: preferencia.id, initPoint, criadaEm: new Date() });
          cobranca = await db.getCobrancaLinkPorId(cobrancaCriada.id);
          if (!cobranca) throw new Error("Cobrança não encontrada após criar a preferência");
        } catch (error) {
          await db.atualizarCobrancaLink(cobrancaCriada.id, { status: "erro", chaveAberta: null });
          throw error;
        }
      }

      if (!cobranca.initPoint) throw new Error("A cobrança aberta não possui Link válido; crie uma nova cobrança após revisar os dados");
      const textoSemAssinatura = textoCobrancaComLink(input.textoWhatsapp, cobranca.initPoint);
      const nomeRemetente = ctx.atendente?.nome ?? ctx.user.name;
      const textoFinal = nomeRemetente?.trim() ? `*${nomeRemetente.trim()}:*\n${textoSemAssinatura}` : textoSemAssinatura;
      let zapiMessageId: string | undefined;
      if (conversa.canal === "zapi") {
        if (!unidade.zapiInstanceId || !unidade.zapiToken || !unidade.zapiClientToken) throw new Error("Z-API não configurado para esta unidade");
        zapiMessageId = (await zapiApi.sendText(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, conversa.telefone, textoFinal)).messageId;
      } else {
        await buddhaMktApi.sendText(conversa.telefone, textoFinal);
      }
      await db.insertInboxMensagem({
        conversaId: conversa.id,
        direcao: "enviada",
        tipo: "texto",
        conteudo: textoFinal,
        enviadaPorUserId: ctx.user.id,
        enviadaPorAtendenteId: ctx.atendente?.id ?? null,
        zapiMessageId: zapiMessageId ?? null,
      });
      await db.upsertInboxConversa({ unidadeId: conversa.unidadeId, canal: conversa.canal, telefone: conversa.telefone, nomeContato: conversa.nomeContato ?? undefined, ultimaMensagemTexto: textoFinal });
      await db.atualizarCobrancaLink(cobranca.id, { status: "enviada", enviadaEm: new Date() });

      // Aviso pro grupo da recepção — nunca trava o envio do Link em si,
      // que já aconteceu acima; uma falha aqui só fica no log.
      if (input.excecaoParcelamento) {
        try {
          const grupoRecepcao = await db.getInboxConversaById(CONVERSA_GRUPO_RECEPCAO_EXCECAO_PARCELAMENTO_ID);
          const unidadeGrupo = grupoRecepcao?.unidadeId ? await db.getUnidadeById(grupoRecepcao.unidadeId) : null;
          if (grupoRecepcao?.isGrupo === "true" && grupoRecepcao.canal === "zapi" && unidadeGrupo?.zapiInstanceId && unidadeGrupo.zapiToken && unidadeGrupo.zapiClientToken) {
            const textoExcecao = montarMensagemExcecaoParcelamento({
              clienteNome: conversa.nomeContato?.trim() || "Cliente sem nome",
              valor: input.valor,
              parcelas: input.parcelas,
              motivo: input.excecaoParcelamento.motivo,
              autorizador: input.excecaoParcelamento.autorizador,
              enviadoPor: nomeRemetente?.trim() || ctx.user.name || "Equipe",
            });
            await zapiApi.sendText(unidadeGrupo.zapiInstanceId, unidadeGrupo.zapiToken, unidadeGrupo.zapiClientToken, grupoRecepcao.telefone, textoExcecao);
          }
        } catch (error) {
          console.error("[Cobrança Link] Falha ao avisar exceção de parcelamento no grupo da recepção:", error);
        }
      }

      return { cobrancaId: cobranca.id, initPoint: cobranca.initPoint, reutilizada: Boolean(aberta) };
    }),

    /**
     * O Mercado Pago não tem "cancelar" preferência de verdade — a chamada
     * expira o Link no lado deles (best-effort, não bloqueia o cancelamento
     * local se falhar: a preferência pode já estar paga/expirada). O que
     * de fato libera a recepção pra criar uma cobrança nova pro mesmo
     * cliente é marcar status="cancelada" e limpar chaveAberta aqui.
     */
    cancelar: protectedProcedure.input(z.object({ cobrancaId: z.number() })).mutation(async ({ input, ctx }) => {
      const cobranca = await db.getCobrancaLinkPorId(input.cobrancaId);
      if (!cobranca) throw new Error("Cobrança não encontrada");
      if (!(await usuarioPodeOperarNaUnidade(ctx.user, cobranca.unidadeId))) throw new Error("Sem acesso à unidade desta cobrança");
      if (!db.STATUS_COBRANCA_ABERTA.includes(cobranca.status as any)) {
        throw new Error(`Esta cobrança já está com status "${cobranca.status}" e não pode ser cancelada.`);
      }
      if (cobranca.preferenceId) {
        const unidade = await db.getUnidadeById(cobranca.unidadeId);
        if (unidade?.mpAccessToken) {
          try {
            await cancelarPreferenciaPagamento(unidade.mpAccessToken, cobranca.preferenceId);
          } catch (error) {
            console.error("[Cobrança Link] Falha ao expirar preferência no Mercado Pago (cancelando localmente mesmo assim):", error);
          }
        }
      }
      await db.atualizarCobrancaLink(cobranca.id, { status: "cancelada", chaveAberta: null });
      return { success: true };
    }),

    alertas: protectedProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input, ctx }) => {
      if (!(await usuarioPodeOperarNaUnidade(ctx.user, input.unidadeId))) throw new Error("Sem acesso a esta unidade");
      return db.listCobrancasLinkAprovadasRecentes(input.unidadeId);
    }),

    reconhecerAlerta: protectedProcedure.input(z.object({ cobrancaId: z.number(), unidadeId: z.number() })).mutation(async ({ input, ctx }) => {
      if (!(await usuarioPodeOperarNaUnidade(ctx.user, input.unidadeId))) throw new Error("Sem acesso a esta unidade");
      await db.reconhecerAlertaCobrancaLink(input.cobrancaId, input.unidadeId);
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
    // script não constrói fluxo nenhum aqui. Só fluxo marcado
    // "Visível para criação de script" (fluxo.visivelNoInbox) pode ser
    // referenciado — é o admin quem decide, na tela de Fluxos, quais
    // ficam disponíveis (fluxos automáticos de gatilho/menu/bot ficam
    // de fora de propósito).
    create: protectedProcedure.input(z.object({
      categoriaScript: z.string().min(1).max(100),
      titulo: z.string().trim().min(3).max(200),
      descricao: z.string().trim().min(5).max(500),
      tipo: z.enum(["texto", "fluxo"]).default("texto"),
      script: z.string().min(1).nullable().optional(),
      fluxoId: z.number().nullable().optional(),
      observacoes: z.string().optional(),
      agentesPermitidos: z.array(z.enum(["bianca", "fabricia", "estela", "carol", "diana"])).max(5).optional(),
    }).refine((v) => v.tipo === "texto" ? !!v.script?.trim() : !!v.fluxoId, {
      message: "Script de texto precisa de mensagem; script de fluxo precisa de um fluxo selecionado",
    })).mutation(async ({ input, ctx }) => {
      if (input.tipo === "fluxo" && input.fluxoId) {
        const fluxo = await db.getFluxoById(input.fluxoId);
        if (!fluxo?.visivelNoInbox) throw new Error('Esse fluxo não está marcado como "Visível para criação de script" — libere em Fluxos primeiro.');
      }
      const agentesPermitidos = ctx.user.role === "admin" ? input.agentesPermitidos : undefined;
      const id = await db.createScript({ ...input, agentesPermitidos, script: input.script ?? undefined, fluxoId: input.fluxoId ?? undefined });
      return { id };
    }),

    update: protectedProcedure.input(z.object({
      id: z.number(),
      categoriaScript: z.string().min(1).max(100).optional(),
      titulo: z.string().trim().min(3).max(200).optional(),
      descricao: z.string().trim().min(5).max(500).optional(),
      tipo: z.enum(["texto", "fluxo"]).optional(),
      script: z.string().nullable().optional(),
      fluxoId: z.number().nullable().optional(),
      observacoes: z.string().nullable().optional(),
      agentesPermitidos: z.array(z.enum(["bianca", "fabricia", "estela", "carol", "diana"])).max(5).optional(),
    })).mutation(async ({ input, ctx }) => {
      const { id, ...dados } = input;
      if (dados.tipo === "fluxo" && dados.fluxoId) {
        const fluxo = await db.getFluxoById(dados.fluxoId);
        if (!fluxo?.visivelNoInbox) throw new Error('Esse fluxo não está marcado como "Visível para criação de script" — libere em Fluxos primeiro.');
      }
      const { agentesPermitidos, ...dadosSemElegibilidade } = dados;
      const dadosAutorizados = ctx.user.role === "admin" ? dados : dadosSemElegibilidade;
      await db.updateScript(id, dadosAutorizados);
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
      const cliques = await db.listFluxoNoOpcaoCliques([input.id]);
      return { fluxo, nos, cliques };
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

    // Esses três crons rodam automaticamente dentro do próprio processo
    // desde o boot (ver server/_core/scheduler.ts) — não dependem mais do
    // Heartbeat da Manus nem de um botão pra "ativar". As mutations abaixo
    // ficam só pra não quebrar os botões existentes no admin; retornam
    // sucesso na hora, sem fazer nada.
    registrarHeartbeat: adminProcedure.mutation(async () => {
      return { success: true };
    }),

    registrarHeartbeatGatilhosAgendados: adminProcedure.mutation(async () => {
      return { success: true };
    }),

    registrarHeartbeatBuddhaMktAlerta: adminProcedure.mutation(async () => {
      return { success: true };
    }),
  }),

  // ===== Buddha Mkt: Templates (Message Templates da Meta) =====
  templates: router({
    list: adminProcedure.query(async () => db.listBuddhaMktTemplates()),

    create: adminProcedure.input(z.object({
      nome: z.string().min(1),
      idioma: z.string().min(1).default("pt_BR"),
      categoria: z.enum(["MARKETING", "UTILITY"]).default("MARKETING"),
      corpo: z.string().min(1),
      corpoExemplos: z.array(z.string().min(1)).optional(),
      cabecalho: z.string().max(60).optional(),
      cabecalhoExemplo: z.string().max(60).optional(),
      rodape: z.string().max(60).optional(),
      botoes: z.array(z.union([
        z.object({ tipo: z.literal("QUICK_REPLY"), texto: z.string().min(1) }).strict(),
        z.object({ tipo: z.literal("URL"), texto: z.string().min(1), url: z.string().min(1), exemploVariavel: z.string().optional() }).strict(),
      ])).max(3).optional(),
    })).mutation(async ({ input }) => {
      // Regras de conteúdo da Meta (variável solta no início/fim,
      // sequência com buraco, variáveis coladas) — ver
      // shared/templateVariaveis.ts. Falha aqui é bem mais rápido pro
      // admin corrigir do que esperar a Meta rejeitar.
      const problemas = [
        ...validarCorpo(input.corpo),
        ...(input.cabecalho ? validarCabecalho(input.cabecalho) : []),
      ];
      if (problemas.length > 0) throw new Error(problemas.join(" | "));

      const variaveisCorpo = extrairVariaveis(input.corpo);
      if (variaveisCorpo.length > 0 && (input.corpoExemplos?.length ?? 0) !== variaveisCorpo.length) {
        throw new Error(`O corpo tem ${variaveisCorpo.length} variável(is) — informe um exemplo pra cada uma`);
      }

      const id = await db.createBuddhaMktTemplate(input);
      if (!id) throw new Error("Falha ao gravar template localmente");
      try {
        const resultado = await metaTemplatesApi.criarTemplate(input);
        await db.atualizarBuddhaMktTemplateStatus(id, { status: "pendente", metaTemplateId: resultado.metaTemplateId });
      } catch (error: any) {
        await db.atualizarBuddhaMktTemplateStatus(id, { status: "rejeitado", motivoRejeicao: error.message });
        throw error;
      }
      return { id };
    }),

    // Revisão da Meta é assíncrona — sem webhook de status configurado
    // ainda, então a sincronização é sob demanda (botão na tela).
    sincronizarStatus: adminProcedure.mutation(async () => {
      const [locais, remotos] = await Promise.all([db.listBuddhaMktTemplates(), metaTemplatesApi.listarTemplatesMeta()]);
      let atualizados = 0;
      for (const local of locais) {
        if (local.status === "aprovado" || local.status === "rejeitado") continue;
        const remoto = remotos.find((r) => r.nome === local.nome && r.idioma === local.idioma);
        if (!remoto) continue;
        const statusNormalizado = remoto.status === "APPROVED" ? "aprovado" : remoto.status === "REJECTED" ? "rejeitado" : "pendente";
        if (statusNormalizado === local.status) continue;
        await db.atualizarBuddhaMktTemplateStatus(local.id, { status: statusNormalizado, motivoRejeicao: remoto.motivoRejeicao ?? null });
        atualizados++;
      }
      return { atualizados };
    }),
  }),

  // ===== Buddha Mkt: Disparos (campanhas de marketing) =====
  disparos: router({
    list: adminProcedure.query(async () => db.listDisparos()),

    // Garante que a unidade sintética "Buddha Mkt" exista — normalmente
    // já foi criada pelo webhook na primeira mensagem recebida, mas a
    // tela de Disparos precisa dela mesmo antes disso (pra listar os
    // fluxos-resposta já montados nessa unidade).
    unidadeBuddhaMkt: adminProcedure.query(async () => db.getOrCreateUnidadeBuddhaMkt()),

    get: adminProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
      const [disparo, destinatarios] = await Promise.all([db.getDisparoById(input.id), db.listDisparoDestinatarios(input.id)]);
      if (!disparo) return null;
      return { disparo, destinatarios };
    }),

    create: adminProcedure.input(z.object({
      nome: z.string().min(1),
      templateId: z.number(),
      fluxoRespostaId: z.number().optional(),
      variaveisConfig: z.array(z.object({
        fonte: z.enum(["nome_cliente", "fixo"]),
        valor: z.string().optional(),
      }).strict()).optional(),
      clienteIds: z.array(z.number()).min(1),
    })).mutation(async ({ input }) => {
      const clientesResolvidos = await db.getClientesPorIds(input.clienteIds);
      const destinatarios = clientesResolvidos
        .map((c) => ({ clienteId: c.id, telefone: c.celular || c.telefone || "" }))
        .filter((d) => d.telefone);
      if (destinatarios.length === 0) throw new Error("Nenhum dos clientes selecionados tem celular cadastrado");
      const id = await db.createDisparo({
        nome: input.nome, templateId: input.templateId, fluxoRespostaId: input.fluxoRespostaId,
        variaveisConfig: input.variaveisConfig, destinatarios,
      });
      return { id };
    }),

    // Loop sequencial simples (sem fila/retry — v1, ver plano "Fora de
    // escopo"). Pequeno intervalo entre envios pra não estourar rate
    // limit da Cloud API.
    enviar: adminProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      const disparo = await db.getDisparoById(input.id);
      if (!disparo) throw new Error("Disparo não encontrado");
      const templateRow = await db.getBuddhaMktTemplateById(disparo.templateId);
      if (!templateRow) throw new Error("Template do disparo não encontrado");
      if (templateRow.status !== "aprovado") throw new Error("Template ainda não foi aprovado pela Meta");

      await db.atualizarDisparo(disparo.id, { status: "enviando", iniciadoEm: new Date() });
      const pendentes = await db.listDisparoDestinatariosPendentes(disparo.id);
      const variaveisConfig = (disparo.variaveisConfig as Array<{ fonte: "nome_cliente" | "fixo"; valor?: string }> | null) ?? [];
      const clientesPorId = new Map(
        (await db.getClientesPorIds(pendentes.map((d) => d.clienteId))).map((c) => [c.id, c.nome]),
      );
      let enviados = 0;
      let erros = 0;
      for (const destinatario of pendentes) {
        const variaveis = variaveisConfig.map((v) =>
          v.fonte === "nome_cliente" ? (clientesPorId.get(destinatario.clienteId) ?? "") : (v.valor ?? ""),
        );
        try {
          await buddhaMktApi.sendTemplate(destinatario.telefone, templateRow.nome, templateRow.idioma, variaveis);
          await db.atualizarDisparoDestinatario(destinatario.id, { status: "enviado", enviadoEm: new Date() });
          await db.incrementarDisparoContadores(disparo.id, { totalEnviados: 1 });
          enviados++;
        } catch (error: any) {
          await db.atualizarDisparoDestinatario(destinatario.id, { status: "erro", erroMsg: error.message });
          await db.incrementarDisparoContadores(disparo.id, { totalErros: 1 });
          erros++;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      await db.atualizarDisparo(disparo.id, { status: erros > 0 && enviados === 0 ? "erro" : "concluido", concluidoEm: new Date() });
      return { enviados, erros };
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
          if (tipoVenda) {
            bateram++;
            if (amostraMatch.length < 5) {
              amostraMatch.push(`SOURCE_ID=${l.sourceId} → tipo venda="${tipoVenda}" (RECORD_TYPE original="${l.tipoTransacao}")`);
            }
            return { ...l, titulo: `Liquidação · ${db.labelTipoAdquirente(tipoVenda)}` };
          }
          // Sem match de venda conhecida (venda de antes do primeiro
          // sync de Adquirentes, ou movimento sem venda associada, ex.:
          // reserva pra disputa) — usa o método de pagamento real do
          // próprio CSV do Mercado Pago (PAYMENT_METHOD_TYPE) em vez de
          // deixar em branco. Sem RECORD_TYPE nesse relatório (ver
          // mercadoPagoApi.ts), é o melhor dado real disponível.
          if (l.paymentMethodType || l.paymentMethod) {
            const tipoNormalizado = db.normalizarTipoAdquirente(l.paymentMethodType, l.paymentMethod);
            if (tipoNormalizado !== "desconhecido") {
              return { ...l, titulo: `Pagamento · ${db.labelTipoAdquirente(tipoNormalizado)}` };
            }
          }
          // Último recurso: o texto cru do CSV (ex.: "reserve_for_dispute")
          // vira o título em vez de duplicado em título E descrição.
          if (l.descricao) {
            return { ...l, titulo: l.descricao, descricao: undefined };
          }
          return l;
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
        // manual). Então, pra linhas que já existiam de um sync anterior
        // (seja o enriquecimento por SOURCE_ID, seja o fallback por
        // PAYMENT_METHOD_TYPE novo), o título não é gravado pelo upsert
        // acima — atualiza à parte, só o título, sem tocar em mais nada.
        for (const l of linhasEnriquecidas) {
          if (l.titulo) {
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
        // Categoriza na inserção (mesmo padrão do Sicredi/Inter) — sem
        // isso, a linha nasce com dreDescricaoId null e fica invisível
        // pra "Contas bancárias" da Comanda (detalheContasBancariasPorDia
        // filtra por dreDescricaoId), mesmo aparecendo normal em Contas.
        // Bug real encontrado 2026-08-17.
        const regrasDre = await db.listRegrasParaMatch();
        const cnpjsPorUnidadeDre = await db.listCnpjsPorUnidade();
        const transacoes = await Promise.all(linhas.map(async (l) => {
          const resultado = contaCaixa?.id
            ? await db.categorizarTransacaoAutomaticamente({
              unidadeId: input.unidadeId,
              contaId: contaCaixa.id,
              dataEntrada: l.data,
              titulo: l.ocorrencia,
              descricao: l.conferidoPor ?? "",
              valor: l.valor,
              origem: "caixa_fisico",
              tipoOperacao: l.tipoOperacao,
            }, regrasDre, cnpjsPorUnidadeDre)
            : { dreDescricaoId: undefined, categorizacaoStatus: "pendente" as const, alerta: null };
          return {
            unidadeId: input.unidadeId,
            contaId: contaCaixa?.id,
            // Sintético — a planilha não tem um ID de transação próprio.
            // Inclui unidadeId pra nunca colidir entre unidades no mesmo
            // dia/tipo/título (RBS e SSU sincronizam datas sobrepostas).
            // NÃO inclui o valor: a planilha soma tudo num único
            // lançamento "Vendas do dia" por data+tipo (confirmado pelo
            // usuário), então essa chave já é estável mesmo quando o
            // valor é corrigido depois. Incluir o valor aqui foi a causa
            // de um bug real (2026-08-17): corrigir o valor na planilha
            // gerava um idTransacao novo, e upsertOuAtualizarCaixaFisico
            // (abaixo) tratava como lançamento novo em vez de atualizar
            // o existente — duplicava o dia em vez de substituir.
            idTransacao: `caixa:${input.unidadeId}:${l.data}:${l.tipoOperacao}:${l.ocorrencia.slice(0, 60)}`,
            dataEntrada: l.data,
            tipoOperacao: l.tipoOperacao,
            valor: l.valor.toFixed(2),
            titulo: l.ocorrencia,
            descricao: l.conferidoPor ? `Conferido por: ${l.conferidoPor}` : undefined,
            origem: "caixa_fisico" as const,
            dreDescricaoId: resultado.dreDescricaoId ?? undefined,
            categorizacaoStatus: resultado.categorizacaoStatus,
          };
        }));

        // Caixa Físico é digitado à mão e pode ser corrigido depois na
        // planilha (diferente de Sicredi/Inter/Mercado Pago, extrato
        // bancário imutável) — por isso usa upsert-com-atualização em
        // vez do insert-only genérico (upsertInterExtratos): se o valor
        // do dia mudou, atualiza a linha existente em vez de criar uma
        // segunda. Bug real encontrado 2026-08-17 (ver comentário no
        // idTransacao acima).
        const { inseridos, atualizados } = await db.upsertOuAtualizarCaixaFisico(input.unidadeId, transacoes);
        // Corrige retroativamente linhas sincronizadas antes do fix de
        // categorização (2026-08-17) — a cada clique em "Sincronizar",
        // qualquer Caixa Físico ainda sem categoria é resolvido.
        const backfillados = await db.backfillCategorizacaoCaixaFisico(input.unidadeId);

        // Diagnóstico: intervalo de datas encontrado — se um dia vier
        // muito antigo (ex.: meses atrás), é sinal de que a "cauda" da
        // planilha ainda não está pegando os lançamentos certos.
        const datas = linhas.map((l) => l.data).sort();
        const intervalo = datas.length > 0 ? `${datas[0]} a ${datas[datas.length - 1]}` : "nenhuma data";

        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "caixa_fisico",
          status: "sucesso",
          registrosProcessados: inseridos + atualizados,
          detalhes: `Lidos: ${linhas.length}. Novos: ${inseridos}. Atualizados: ${atualizados}. Categorizados retroativamente: ${backfillados}. Intervalo de datas: ${intervalo}.`,
        });
        return { success: true, totalLidos: linhas.length, totalInseridos: inseridos, totalAtualizados: atualizados, totalBackfillados: backfillados };
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

    /**
     * A rotina diária (server/dailySyncReport.ts) roda automaticamente
     * dentro do próprio processo desde o boot (ver
     * server/_core/scheduler.ts), sem depender do Heartbeat da Manus.
     * Mutation mantida só pra não quebrar o botão existente no admin.
     */
    registrarHeartbeatSincronizacaoDiaria: adminProcedure.mutation(async () => {
      return { success: true };
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
     * o drill-down (hover) da linha "Comanda (Recepção)" e também o
     * número agregado quando o dia já tem item (ver listComandaDiaria).
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
     * Escreve na planilha "Informe de vendas" (mãe) o que este sistema
     * calcula como "Contas bancárias" (débito/crédito/pix, já
     * deduplicado) — linhas 43-45 (ver escreverContasBancariasInforme).
     * Até 2026-09-02 escrevia nas linhas 10-12 da planilha "Consolidado
     * comanda" (transição); trocado a pedido do usuário. O texto de
     * conciliação (antes linha 20 dessa planilha) não tem mais destino
     * em planilha — fica só no sistema/Telegram. Agrupa por mês porque
     * cada mês é uma aba diferente; o período pode cair em mais de uma
     * aba se a semana visível cruzar virada de mês — a aba do mês é
     * criada sozinha (clonando o mês anterior) se ainda não existir.
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
      const spreadsheetId = SPREADSHEET_IDS_INFORME_VENDAS[slug];

      try {
        const conciliacaoPorDia = await db.calcularConciliacaoPorDia(input.unidadeId, input.dataInicio, input.dataFim);
        const porData = new Map(conciliacaoPorDia.map((dia) => [dia.data, dia]));

        // Escreve TODO dia do período, não só os que tiveram algum
        // lançamento — um domingo sem nenhum movimento em nenhuma das 3
        // fontes vira zero explícito na planilha, não uma célula em
        // branco (que ficava indistinguível de "ainda não sincronizado").
        // Confirmado pelo usuário em 2026-09-02 (dia sem movimento real
        // ficando de fora, inconsistente com outros domingos parados).
        const porMes = new Map<string, { data: string; cartaoDebito: number; cartaoCredito: number; pix: number }[]>();
        for (const d = new Date(`${input.dataInicio}T00:00:00`); fmtDateIso(d) <= input.dataFim; d.setDate(d.getDate() + 1)) {
          const dataIso = fmtDateIso(d);
          const dia = porData.get(dataIso);
          const chave = dataIso.slice(0, 7); // "AAAA-MM"
          const lista = porMes.get(chave) ?? [];
          lista.push({ data: dataIso, cartaoDebito: dia?.cartaoDebito ?? 0, cartaoCredito: dia?.cartaoCredito ?? 0, pix: dia?.pix ?? 0 });
          porMes.set(chave, lista);
        }

        let totalDias = 0;
        for (const [chave, linhas] of Array.from(porMes)) {
          const [ano, mes] = chave.split("-").map(Number);
          totalDias += await escreverContasBancariasInforme(spreadsheetId, ano, mes, linhas);
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
     * Fase 2 — mesmo botão "Sincronizar com Drive" da Fase 1, mas
     * escrevendo os totais do Belle (Dinheiro/Débito/Crédito/Pix) nas
     * linhas 48-51 da mesma planilha "Informe de vendas" (ver
     * escreverBelleInforme). Adicionado em 2026-09-02.
     */
    sincronizarBelleParaDrive: syncProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade) throw new Error("Unidade não encontrada");

      const isRbs = unidade.slug.includes("ribeirao") || unidade.slug.includes("rbs");
      const slug = isRbs ? "rbs" as const : "ssu" as const;
      const spreadsheetId = SPREADSHEET_IDS_INFORME_VENDAS[slug];

      try {
        const resumoPorDia = await db.resumoBelleRegistrosPorDia(input.unidadeId, input.dataInicio, input.dataFim);

        // Mesmo raciocínio da Fase 1: escreve todo dia do período, com
        // zero explícito nos dias sem registro do Belle.
        const porMes = new Map<string, { data: string; dinheiro: number; cartaoDebito: number; cartaoCredito: number; pix: number }[]>();
        for (const d = new Date(`${input.dataInicio}T00:00:00`); fmtDateIso(d) <= input.dataFim; d.setDate(d.getDate() + 1)) {
          const dataIso = fmtDateIso(d);
          const valores = resumoPorDia.get(dataIso);
          const chave = dataIso.slice(0, 7); // "AAAA-MM"
          const lista = porMes.get(chave) ?? [];
          lista.push({ data: dataIso, dinheiro: valores?.dinheiro ?? 0, cartaoDebito: valores?.cartaoDebito ?? 0, cartaoCredito: valores?.cartaoCredito ?? 0, pix: valores?.pix ?? 0 });
          porMes.set(chave, lista);
        }

        let totalDias = 0;
        for (const [chave, linhas] of Array.from(porMes)) {
          const [ano, mes] = chave.split("-").map(Number);
          totalDias += await escreverBelleInforme(spreadsheetId, ano, mes, linhas);
        }

        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "comanda_belle_drive",
          status: "sucesso",
          registrosProcessados: totalDias,
          detalhes: `Período ${input.dataInicio} a ${input.dataFim}. Dias escritos: ${totalDias}.`,
        });
        return { success: true, totalDias };
      } catch (error: any) {
        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "comanda_belle_drive",
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
     * o mesmo cálculo de conciliação usado pra tela e pro relatório
     * automático do Telegram, só que manda pro grupo do Telegram sob
     * demanda em vez de escrever na planilha.
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

    // ===== Conciliação PDV — Fase 2 (Comanda x Belle) =====
    importarRegistrosFinanceirosBelleXlsx: adminProcedure.input(z.object({
      unidadeId: z.number(),
      xlsxBase64: z.string().min(1),
      // Passo 1 (dryRun) só lê o arquivo e devolve o período pra
      // confirmação na tela — evita importar no período/unidade errado
      // por engano (fácil de confundir, mesmo arquivo serve pra
      // qualquer unidade/período). Passo 2 repete a chamada sem dryRun
      // pra persistir de fato.
      dryRun: z.boolean().optional(),
    })).mutation(async ({ input }) => {
      const buffer = Buffer.from(input.xlsxBase64, "base64");
      const linhas = parseRegistrosFinanceirosBelleXlsx(buffer);
      if (linhas.length === 0) {
        throw new Error('Nenhum lançamento encontrado na planilha (verifique se tem as colunas "Cód.", "Valor" e "Forma Pagto.").');
      }
      const datas = linhas.map((l) => l.dataVencimento).sort();
      const periodoInicio = datas[0];
      const periodoFim = datas[datas.length - 1];
      if (input.dryRun) {
        return { success: true, totalLinhas: linhas.length, periodoInicio, periodoFim };
      }
      const resultado = await db.upsertRegistrosFinanceirosBelle(input.unidadeId, linhas);
      return { success: true, totalLinhas: linhas.length, periodoInicio, periodoFim, ...resultado };
    }),

    detalheBelle: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    })).query(async ({ input }) => {
      return db.detalheBelleRegistrosPorDia(input.unidadeId, input.dataInicio, input.dataFim);
    }),

    resumoBelle: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    })).query(async ({ input }) => {
      const [comanda, belle, pendencias] = await Promise.all([
        db.listComandaDiaria(input.unidadeId, input.dataInicio, input.dataFim),
        db.resumoBelleRegistrosPorDia(input.unidadeId, input.dataInicio, input.dataFim),
        db.pendenciasBelleRegistrosPorDia(input.unidadeId, input.dataInicio, input.dataFim),
      ]);

      const porData = new Map(comanda.map((c) => [c.data, c]));
      const datas = Array.from(new Set([...Array.from(porData.keys()), ...Array.from(belle.keys())])).sort();

      return datas.map((data) => {
        const c = porData.get(data);
        const b = belle.get(data);
        const comandaDia = {
          dinheiro: Number(c?.dinheiro ?? 0),
          cartaoDebito: Number(c?.cartaoDebito ?? 0),
          cartaoCredito: Number(c?.cartaoCredito ?? 0),
          pix: Number(c?.pix ?? 0),
        };
        const belleDia = {
          dinheiro: b?.dinheiro ?? 0,
          cartaoDebito: b?.cartaoDebito ?? 0,
          cartaoCredito: b?.cartaoCredito ?? 0,
          pix: b?.pix ?? 0,
        };
        const p = pendencias.get(data);
        return {
          data,
          comanda: comandaDia,
          belle: belleDia,
          diferenca: {
            dinheiro: comandaDia.dinheiro - belleDia.dinheiro,
            cartaoDebito: comandaDia.cartaoDebito - belleDia.cartaoDebito,
            cartaoCredito: comandaDia.cartaoCredito - belleDia.cartaoCredito,
            pix: comandaDia.pix - belleDia.pix,
          },
          pendenteConfirmacao: {
            dinheiro: p?.dinheiro ?? false,
            cartaoDebito: p?.cartaoDebito ?? false,
            cartaoCredito: p?.cartaoCredito ?? false,
            pix: p?.pix ?? false,
          },
        };
      });
    }),

    // ===== Conciliação PDV — Fase 3 (Terapeutas: Comanda x Belle) =====
    divergenciasTerapeutas: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      dataInicio: z.string(),
      dataFim: z.string(),
    })).query(async ({ input }) => {
      return db.listarDivergenciasTerapeutas(input.unidadeId, input.dataInicio, input.dataFim);
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

  // ===== Confirmação de Pagamento (recepção — últimos 48h) =====
  confirmacaoPagamentos: router({
    ultimaConsulta: confirmacaoPagamentoProcedure.input(z.object({
      unidadeId: z.number(),
    })).query(async ({ input }) => {
      const consultas = await db.getConsultasConfirmacaoPagamento(input.unidadeId);
      const pix = consultas.find((consulta) => consulta.fonte === "pix_inter") ?? null;
      const links = consultas.find((consulta) => consulta.fonte === "links_mercado_pago") ?? null;
      const inicioJanela = new Date(Date.now() - 48 * 60 * 60 * 1000);
      const cobrancasAprovadas = await db.listCobrancasLinkAprovadasParaConfirmacao(input.unidadeId, inicioJanela);
      const linksWebhook = listarLinksConfirmadosLocalmente(cobrancasAprovadas);
      const linksPersistidos = Array.isArray(links?.pagamentos) ? links.pagamentos as Parameters<typeof combinarLinksConfirmacao>[0] : [];
      return {
        pix: pix ? { ...pix, pagamentos: Array.isArray(pix.pagamentos) ? pix.pagamentos : [] } : null,
        links: links ? {
          ...links,
          pagamentos: combinarLinksConfirmacao(linksPersistidos, linksWebhook),
        } : linksWebhook.length ? {
          dataInicio: dataSaoPaulo(inicioJanela),
          dataFim: dataSaoPaulo(new Date()),
          consultaEm: new Date(),
          totalConsultado: 0,
          novasVendas: 0,
          pagamentos: linksWebhook,
        } : null,
      };
    }),
    sincronizarPixInter: confirmacaoPagamentoProcedure.input(z.object({
      unidadeId: z.number(),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.interClientId || !unidade?.interClientSecret || !unidade?.interCertificado || !unidade?.interChavePrivada) {
        throw new Error("Credenciais Banco Inter não configuradas para esta unidade");
      }

      const consultaEm = new Date();
      const inicioJanela = new Date(consultaEm.getTime() - 48 * 60 * 60 * 1000);
      const dataInicio = dataSaoPaulo(inicioJanela);
      const dataFim = dataSaoPaulo(consultaEm);
      const credenciais = { certificado: unidade.interCertificado, chavePrivada: unidade.interChavePrivada };
      let token = unidade.interAccessToken;
      if (!token || !isTokenValid(unidade.interTokenExpiresAt)) {
        const autenticacao = await getInterAccessToken(unidade.interClientId, unidade.interClientSecret, credenciais);
        await db.updateInterToken(input.unidadeId, autenticacao.accessToken, autenticacao.expiresAt);
        token = autenticacao.accessToken;
      }

      const transacoes: InterTransacaoCompleta[] = [];
      let pagina = await interApi.consultarExtratoCompleto(token, dataInicio, dataFim, {
        tamanhoPagina: 200,
        scrollEnabled: true,
        contaCorrente: unidade.interContaCorrente,
      }, credenciais);
      transacoes.push(...pagina.transacoes);
      while (pagina.hasMore && pagina.scrollId) {
        pagina = await interApi.consultarExtratoCompleto(token, dataInicio, dataFim, {
          tamanhoPagina: 200,
          scrollId: pagina.scrollId,
          contaCorrente: unidade.interContaCorrente,
        }, credenciais);
        transacoes.push(...pagina.transacoes);
      }

      const resultado = {
        dataInicio,
        dataFim,
        consultaEm: consultaEm.toISOString(),
        totalConsultado: transacoes.length,
        pagamentos: listarPixInterRecentes(transacoes, inicioJanela),
      };
      await db.salvarConsultaConfirmacaoPagamento({
        unidadeId: input.unidadeId,
        fonte: "pix_inter",
        consultaEm,
        dataInicio,
        dataFim,
        totalConsultado: resultado.totalConsultado,
        pagamentos: resultado.pagamentos,
      });
      return resultado;
    }),

    sincronizarLinksMercadoPago: confirmacaoPagamentoProcedure.input(z.object({
      unidadeId: z.number(),
    })).mutation(async ({ input }) => {
      const unidade = await db.getUnidadeById(input.unidadeId);
      if (!unidade?.mpAccessToken) {
        throw new Error("Mercado Pago não configurado para esta unidade");
      }

      const consultaEm = new Date();
      const inicioJanela = new Date(consultaEm.getTime() - 48 * 60 * 60 * 1000);
      const dataInicio = dataSaoPaulo(inicioJanela);
      const dataFim = dataSaoPaulo(consultaEm);
      const coleta = await consultarTodosPagamentos(unidade.mpAccessToken, dataInicio, dataFim);
      const vendas = coleta.pagamentos.filter((pagamento) => !ehCompraEquipamentoPoint(pagamento)).map((pagamento) => {
        const { bruto, taxa, antecipacao, liquido } = extrairValoresMp(pagamento);
        return {
          unidadeId: input.unidadeId,
          adquirente: "mercadopago" as const,
          idTransacaoExterno: String(pagamento.id),
          dataHora: (pagamento.date_approved ?? "").replace("T", " ").slice(0, 19),
          tipo: db.normalizarTipoAdquirente(pagamento.payment_type_id, pagamento.payment_method_id),
          status: pagamento.status,
          parcela: pagamento.installments ? `1/${pagamento.installments}` : undefined,
          bandeira: pagamento.payment_method_id,
          origemPagamento: classificarOrigemPagamentoMp(pagamento),
          valorBruto: bruto?.toFixed(2),
          valorTaxa: taxa?.toFixed(2),
          valorAntecipacao: antecipacao?.toFixed(2),
          valorLiquido: liquido?.toFixed(2),
          dataPagamento: pagamento.money_release_date?.slice(0, 10),
        };
      });
      const novasVendas = await db.upsertAdquirenteVendas(input.unidadeId, vendas);

      const cobrancasAprovadas = await db.listCobrancasLinkAprovadasParaConfirmacao(input.unidadeId, inicioJanela);
      const pagamentos = combinarLinksConfirmacao(
        listarLinksMercadoPagoRecentes(coleta.pagamentos, inicioJanela),
        listarLinksConfirmadosLocalmente(cobrancasAprovadas),
      );
      const resultado = {
        dataInicio,
        dataFim,
        consultaEm: consultaEm.toISOString(),
        totalConsultado: coleta.pagamentos.length,
        novasVendas,
        pagamentos,
      };
      await db.salvarConsultaConfirmacaoPagamento({
        unidadeId: input.unidadeId,
        fonte: "links_mercado_pago",
        consultaEm,
        dataInicio,
        dataFim,
        totalConsultado: resultado.totalConsultado,
        novasVendas,
        pagamentos: resultado.pagamentos,
      });
      return resultado;
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
      let totalEquipamentos = 0;
      let totalNaApi = 0;
      let amostraBruta: string | null = null;

      try {
        const contaMercadoPago = await db.getOrCreateContaMercadoPago(input.unidadeId);
        const coleta = await consultarTodosPagamentos(unidade.mpAccessToken, input.dataInicio, input.dataFim);
        totalNaApi = coleta.totalNaApi;
        const pagamentos = coleta.pagamentos;
        if (pagamentos.length > 0) {
            // Amostra focada em TODAS as vendas da 1ª página (não só a
            // primeira) — o objeto de pagamento completo tem tanta coisa
            // (payer, additional_info, order...) que fee_details ficaria
            // truncado se eu logasse tudo. Precisa de mais de uma amostra
            // porque o fee_details muda conforme parcelas/tipo — já vi
            // 1 caso onde bruto - taxa não bate com net_received_amount,
            // então tem algo em outra transação que ainda não vi.
            amostraBruta = JSON.stringify(pagamentos.slice(0, 50).map((p) => ({
              id: p.id,
              installments: p.installments,
              transaction_amount: p.transaction_amount,
              fee_details: p.fee_details,
              transaction_details: p.transaction_details,
              money_release_date: p.money_release_date,
              financing_group: p.financing_group,
              origem: resumirOrigemPagamentoMp(p),
            }))).slice(0, 4000);
          }

        const comprasPoint = pagamentos.filter(ehCompraEquipamentoPoint);
          for (const compra of comprasPoint) {
            if (!contaMercadoPago) continue;
            const valorPago = Number(compra.transaction_details?.total_paid_amount ?? 0);
            const valorTabela = Number(compra.transaction_amount ?? 0);
            const desconto = Number(compra.coupon_amount ?? 0);
            if (valorPago <= 0 || valorTabela <= 0) continue;
            const criada = await db.registrarDespesaEquipamentoPoint({
              unidadeId: input.unidadeId,
              contaId: contaMercadoPago.id,
              pagamentoId: String(compra.id),
              data: (compra.date_approved ?? "").slice(0, 10),
              descricaoEquipamento: compra.description ?? "Compra de equipamento Point",
              valorTabela,
              valorPago,
              desconto,
            });
            if (criada) totalEquipamentos++;
          }

        const linhas = pagamentos.filter((p) => !ehCompraEquipamentoPoint(p)).map((p) => {
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
              origemPagamento: classificarOrigemPagamentoMp(p),
              valorBruto: bruto?.toFixed(2),
              valorTaxa: taxa?.toFixed(2),
              valorAntecipacao: antecipacao?.toFixed(2),
              valorLiquido: liquido?.toFixed(2),
              dataPagamento: p.money_release_date?.slice(0, 10),
            };
          });

        totalInseridos += await db.upsertAdquirenteVendas(input.unidadeId, linhas);

        await db.createSyncLog({
          unidadeId: input.unidadeId,
          tipo: "mercadopago_vendas",
          status: "sucesso",
          registrosProcessados: totalInseridos,
          detalhes: `Período: ${input.dataInicio} a ${input.dataFim}. Total API: ${totalNaApi}. Vendas únicas coletadas: ${pagamentos.length}. Varreduras: ${coleta.varreduras}; páginas: ${coleta.paginasConsultadas}. Novos: ${totalInseridos}. Compras Point registradas como despesa: ${totalEquipamentos}.${amostraBruta ? ` Amostra bruta: ${amostraBruta}` : ""}`,
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

  chamados: router({
    opcoes: protectedProcedure.input(z.object({ unidadeId: z.number(), clienteId: z.number().optional() })).query(async ({ input }) => {
      const [parametros, terapeutasAtivos, preferencia] = await Promise.all([
        db.listChamadosParametros(input.unidadeId),
        db.listTerapeutasAtivos(input.unidadeId),
        input.clienteId ? db.getClientePreferenciaTerapeuta(input.clienteId, input.unidadeId) : Promise.resolve(null),
      ]);
      return {
        parametros,
        terapeutas: terapeutasAtivos,
        preferencia,
        gruposChamado: GRUPOS_CHAMADO_RBS.map(({ chave, label }) => ({ chave, label })),
        grupoChamadoPadrao: grupoChamadoPadrao(new Date()),
      };
    }),
    listAdmin: adminProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      return db.listChamadosParametrosAdmin(input.unidadeId);
    }),
    criarParametro: adminProcedure.input(z.object({
      unidadeId: z.number(), tipo: z.enum(["aguardando", "sala", "taa"]), nome: z.string().trim().min(1),
      descricao: z.string().trim().nullable(), ordem: z.number().int().min(0).default(0),
    })).mutation(async ({ input }) => {
      const id = await db.criarChamadoParametro({ ...input, descricao: input.descricao || null, ativo: true });
      return { success: true, id };
    }),
    atualizarParametro: adminProcedure.input(z.object({
      id: z.number(), nome: z.string().trim().min(1).optional(), descricao: z.string().trim().nullable().optional(),
      ordem: z.number().int().min(0).optional(), ativo: z.boolean().optional(),
    })).mutation(async ({ input: { id, ...dados } }) => {
      await db.atualizarChamadoParametro(id, dados);
      return { success: true };
    }),
    salvarPreferenciaCliente: protectedProcedure.input(z.object({
      clienteId: z.number(), unidadeId: z.number(), terapeutaId: z.number().nullable(), terapeutaNome: z.string().nullable(),
    })).mutation(async ({ input }) => {
      await db.salvarClientePreferenciaTerapeuta(input);
      return { success: true };
    }),
    enviarTeste: protectedProcedure.input(z.object({
      unidadeId: z.number(),
      clienteNome: z.string().trim().min(1),
      modalidade: z.enum(["chamado", "pre_chamado"]),
      horarioPrevisto: z.string().trim().nullable(),
      aguardandoEm: z.string().trim().min(1),
      terapeutaNome: z.string().trim().min(1),
      terapiaBemEstar: z.string().trim().nullable(),
      terapiaEstetica: z.string().trim().nullable(),
      sala: z.string().trim().min(1),
      taa: z.string().trim().min(1),
      preferencial: z.boolean(),
      enviarParaComanda: z.boolean().default(false),
      atendimentoBelleId: z.number().int().nullable().optional(),
      // Escolha de QUAL GRUPO recebe o chamado — independente de qual
      // terapeuta está sendo chamada (ver "terapeuta de outra unidade"
      // no client, um controle separado). Aos domingos todo chamado do
      // RBS roda no grupo de plantão, não só o de terapeuta visitante —
      // por isso é uma chave fixa (nunca um conversaId vindo do
      // cliente, pra não abrir brecha de mandar mensagem pra qualquer
      // conversa), com o padrão sugerido pelo client mudando conforme
      // o dia da semana.
      grupoChamado: z.enum(GRUPOS_CHAMADO_RBS.map((g) => g.chave) as [ChaveGrupoChamado, ...ChaveGrupoChamado[]]).default("geral"),
    })).mutation(async ({ input, ctx }) => {
      const conversaId = conversaIdDoGrupoChamado(input.grupoChamado);
      const conversa = await db.getInboxConversaById(conversaId);
      if (!conversa || conversa.unidadeId !== UNIDADE_GRUPO_GERAL_RBS_ID || conversa.isGrupo !== "true" || conversa.canal !== "zapi") {
        throw new Error(`O grupo "${GRUPOS_CHAMADO_RBS.find((g) => g.chave === input.grupoChamado)?.label}" não está disponível.`);
      }
      if (!(await db.mensageriaEstaAtiva())) throw new Error("Envio de mensagens pausado — kill switch de mensageria ativado por um administrador");
      const unidade = await db.getUnidadeById(conversa.unidadeId!);
      if (!unidade?.zapiInstanceId || !unidade.zapiToken || !unidade.zapiClientToken) throw new Error("Z-API não configurado para o grupo de teste");
      let comanda: { aba: string; linha: number } | null = null;
      if (input.enviarParaComanda) {
        if (!input.atendimentoBelleId) throw new Error("Este chamado não possui atendimento vinculado para preencher a Comanda");
        if (!ctx.atendente?.nome?.trim()) throw new Error("Selecione seu nome pelo PIN antes de enviar dados para a Comanda");
        comanda = await db.obterPreenchimentoComanda(input.unidadeId, input.atendimentoBelleId);
        if (!comanda) {
        const slug = chaveComandaVirtualPorUnidade(input.unidadeId);
        if (!slug) throw new Error("A unidade não possui Comanda virtual configurada");
        comanda = await preencherLinhaVaziaComandaVirtual({
          spreadsheetId: SPREADSHEET_IDS_COMANDA_VIRTUAL[slug], data: dataSaoPaulo(new Date()), cliente: input.clienteNome,
          terapia: input.terapiaBemEstar || input.terapiaEstetica || "Não informada", terapeuta: input.terapeutaNome, responsavel: ctx.atendente.nome.trim(),
        });
        await db.registrarPreenchimentoComanda(input.unidadeId, input.atendimentoBelleId, comanda.aba, comanda.linha);
        }
      }
      const texto = montarMensagemChamadoTerapeuta(input);
      const resultado = await zapiApi.sendText(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, conversa.telefone, texto);
      if (input.modalidade === "chamado" && input.atendimentoBelleId) {
        try {
          await db.registrarChamadoAtendimento(input.unidadeId, input.atendimentoBelleId, input.terapeutaNome, new Date());
        } catch (error) {
          console.error("[Chamados] Falha ao registrar hora do chamado:", error);
        }
      }
      await db.insertInboxMensagem({
        conversaId: conversa.id, direcao: "enviada", tipo: "texto", conteudo: texto,
        enviadaPorUserId: ctx.user.id, enviadaPorAtendenteId: ctx.atendente?.id ?? null, zapiMessageId: resultado.messageId ?? null,
      });
      await db.upsertInboxConversa({
        unidadeId: conversa.unidadeId, canal: "zapi", telefone: conversa.telefone,
        nomeContato: conversa.nomeContato ?? undefined, ultimaMensagemTexto: texto,
      });
      return { success: true, conversaId: conversa.id, mensagem: texto, comanda };
    }),
  }),
  terapeutas: router({
    listAdmin: adminProcedure.input(z.object({ unidadeId: z.number() })).query(async ({ input }) => {
      return db.listTerapeutasAdmin(input.unidadeId);
    }),

    criar: adminProcedure.input(z.object({
      unidadeId: z.number(),
      nomeCompleto: z.string().min(1),
      nomeAbreviado: z.string().min(1),
      celular: z.string().optional(),
      whatsappParticipanteId: z.string().trim().max(100).optional(),
      cpf: z.string().optional(),
      vinculo: z.enum(["fixo", "freelancer"]).optional(),
      nivel: z.enum(["diamante", "ouro", "prata", "bronze"]).optional(),
    })).mutation(async ({ input }) => {
      const id = await db.criarTerapeuta({
        unidadeId: input.unidadeId,
        nomeCompleto: input.nomeCompleto,
        nomeAbreviado: input.nomeAbreviado,
        celular: input.celular || null,
        whatsappParticipanteId: input.whatsappParticipanteId || null,
        cpf: input.cpf || null,
        vinculo: input.vinculo,
        nivel: input.nivel,
      });
      await db.reprocessarEventosTempoAtendimento(input.unidadeId);
      return { success: true, id };
    }),

    atualizar: adminProcedure.input(z.object({
      id: z.number(),
      unidadeId: z.number().int().positive(),
      nomeCompleto: z.string().min(1).optional(),
      nomeAbreviado: z.string().min(1).optional(),
      celular: z.string().nullable().optional(),
      whatsappParticipanteId: z.string().trim().max(100).nullable().optional(),
      cpf: z.string().nullable().optional(),
      vinculo: z.enum(["fixo", "freelancer"]).optional(),
      nivel: z.enum(["diamante", "ouro", "prata", "bronze"]).optional(),
      ativo: z.boolean().optional(),
    })).mutation(async ({ input: { id, unidadeId, ...dados } }) => {
      await db.atualizarTerapeuta(unidadeId, id, dados);
      await db.reprocessarEventosTempoAtendimento(unidadeId);
      return { success: true };
    }),
  }),

  terapeutasFidelizacao: router({
    listar: protectedProcedure.input(z.object({
      unidadeId: z.number().int().positive(),
      dataInicio: z.string().regex(DATA_ISO_REGEX, "Data inicial inválida"),
      dataFim: z.string().regex(DATA_ISO_REGEX, "Data final inválida"),
    }).refine((input) => input.dataInicio <= input.dataFim, {
      message: "A data inicial não pode ser posterior à data final",
      path: ["dataFim"],
    })).query(async ({ input, ctx }) => {
      if (!(await usuarioPodeOperarNaUnidade(ctx.user, input.unidadeId))) throw new Error("Sem acesso a esta unidade");
      return db.listarFidelizacaoTerapeutas(input.unidadeId, input.dataInicio, input.dataFim);
    }),

    evolucao: protectedProcedure.input(z.object({
      unidadeId: z.number().int().positive(),
      terapeutaId: z.number().int().positive(),
      dataInicio: z.string().regex(DATA_ISO_REGEX, "Data inicial inválida"),
      dataFim: z.string().regex(DATA_ISO_REGEX, "Data final inválida"),
      granularidade: z.enum(["semana", "mes"]),
    }).refine((input) => input.dataInicio <= input.dataFim, {
      message: "A data inicial não pode ser posterior à data final",
      path: ["dataFim"],
    })).query(async ({ input, ctx }) => {
      if (!(await usuarioPodeOperarNaUnidade(ctx.user, input.unidadeId))) throw new Error("Sem acesso a esta unidade");
      return db.listarEvolucaoFidelizacaoTerapeuta(input.unidadeId, input.terapeutaId, input.dataInicio, input.dataFim, input.granularidade);
    }),
  }),

  terapeutasLiberacoes: router({
    listar: protectedProcedure.input(z.object({ unidadeId: z.number().int().positive() })).query(async ({ input, ctx }) => {
      if (!(await usuarioPodeOperarNaUnidade(ctx.user, input.unidadeId))) throw new Error("Sem acesso a esta unidade");
      const [dados, unidade] = await Promise.all([
        db.listarTerapeutasComLiberacoes(input.unidadeId),
        db.getUnidadeById(input.unidadeId),
      ]);
      if (!unidade) throw new Error("Unidade não encontrada");
      return dados;
    }),

    salvar: protectedProcedure.input(z.object({
      unidadeId: z.number().int().positive(),
      terapeutaId: z.number().int().positive(),
      servicoCodigo: z.number().int().positive(),
      servicoNome: z.string().trim().min(1).max(250),
      liberada: z.boolean(),
    })).mutation(async ({ input, ctx }) => {
      if (!(await usuarioPodeOperarNaUnidade(ctx.user, input.unidadeId))) throw new Error("Sem acesso a esta unidade");
      await db.salvarLiberacaoTerapeuta(input);
      return { success: true } as const;
    }),
  }),

  terapeutasPreferenciais: router({
    listar: protectedProcedure.input(z.object({
      unidadeId: z.number().int().positive(),
      dataInicio: z.string().regex(DATA_ISO_REGEX, "Data inicial inválida"),
      dataFim: z.string().regex(DATA_ISO_REGEX, "Data final inválida"),
    }).refine((input) => input.dataInicio <= input.dataFim, {
      message: "A data inicial não pode ser posterior à data final",
      path: ["dataFim"],
    })).query(async ({ input, ctx }) => {
      if (!(await usuarioPodeOperarNaUnidade(ctx.user, input.unidadeId))) throw new Error("Sem acesso a esta unidade");
      return db.listarPreferenciaisTerapeutas(input.unidadeId, input.dataInicio, input.dataFim);
    }),
  }),

  terapeutasFechamento: router({
    listar: protectedProcedure.input(z.object({
      unidadeId: z.number().int().positive(),
      dataInicio: z.string().regex(DATA_ISO_REGEX, "Data inicial inválida"),
      dataFim: z.string().regex(DATA_ISO_REGEX, "Data final inválida"),
    }).refine((input) => input.dataInicio <= input.dataFim, {
      message: "A data inicial não pode ser posterior à data final",
      path: ["dataFim"],
    })).query(async ({ input, ctx }) => {
      if (!(await usuarioPodeOperarNaUnidade(ctx.user, input.unidadeId))) throw new Error("Sem acesso a esta unidade");
      return db.listarFechamentoAgendaTerapeutas(input.unidadeId, input.dataInicio, input.dataFim);
    }),
  }),
  terapeutasTempos: router({
    listar: protectedProcedure.input(z.object({
      unidadeId: z.number().int().positive(),
      dataInicio: z.string().regex(DATA_ISO_REGEX, "Data inicial inválida"),
      dataFim: z.string().regex(DATA_ISO_REGEX, "Data final inválida"),
    }).refine((input) => input.dataInicio <= input.dataFim, {
      message: "A data inicial não pode ser posterior à data final",
      path: ["dataFim"],
    })).query(async ({ input, ctx }) => {
      if (!(await usuarioPodeOperarNaUnidade(ctx.user, input.unidadeId))) throw new Error("Sem acesso a esta unidade");
      return db.listarRelatorioTempoAtendimento(input.unidadeId, input.dataInicio, input.dataFim);
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

  // ===== Banco de Dados (runner de migrações + pesquisa somente leitura) =====
  bancoDeDados: router({
    migracoesListar: adminProcedure.query(async () => {
      return listarMigracoes();
    }),

    migracoesAplicar: adminProcedure.input(z.object({ nomeArquivo: z.string() })).mutation(async ({ input, ctx }) => {
      return aplicarMigracao(input.nomeArquivo, { id: ctx.user.id, name: ctx.user.name });
    }),

    migracoesMarcarAplicada: adminProcedure.input(z.object({ nomeArquivo: z.string() })).mutation(async ({ input, ctx }) => {
      await marcarMigracaoAplicada(input.nomeArquivo, { id: ctx.user.id, name: ctx.user.name });
      return { success: true };
    }),

    // Mutation (não query) de propósito: só mutation passa pelo auditMiddleware,
    // e toda consulta livre aqui precisa ficar no log de auditoria.
    consultaSql: adminProcedure.input(z.object({ sql: z.string().min(1) })).mutation(async ({ input }) => {
      return executarConsultaSql(input.sql);
    }),
  }),
});

export type AppRouter = typeof appRouter;
