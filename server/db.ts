import crypto from "node:crypto";
import { eq, asc, desc, and, or, gt, gte, lte, isNull, isNotNull, like, ne, inArray, notInArray, lt, sql, getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, unidades, leads, metas, laminas, syncLogs, copilotConversas, configuracoes, inboxConversas, inboxMensagens, interExtratos, contas, dreCategorias, dreDescricoes, dreRegras, adquirenteVendas, comandaDiaria, comandaItens, auditLog, webhookDebugLog, clientes, clienteTelefones, belleAtendimentos, belleRegistrosFinanceiros, bellePlanosClientes, bellePlanosServicos, lidMapping, atendentes, atendenteSessoes, terapeutas, permissoesModulo, permissoesSubsecao, permissoesUnidade, scripts, scriptsUso, lancamentoSplits, lancamentosManuaisDre, transacoesEntreUnidades, fluxos, fluxoNos, fluxoExecucoes, fluxoNoOpcaoCliques, buddhaMktTemplates, disparos, disparoDestinatarios, type Unidade, type InsertUnidade, type Lead, type InsertLead, type InsertMeta, type Lamina, type InsertLamina, type SyncLog, type InsertSyncLog, type CopilotConversa, type InsertCopilotConversa, type Configuracao, type InsertInboxConversa, type InsertInboxMensagem, type InsertInterExtrato, type InsertConta, type InsertAdquirenteVenda, type InsertCliente, type InsertClienteTelefone, type InsertBelleAtendimento, type InsertBelleRegistroFinanceiro, type InsertBellePlanoCliente, type InsertBellePlanoServico, type InsertLidMapping, type InsertComandaItem, type InsertScript, type InsertFluxo, type InsertFluxoNo, type InsertFluxoExecucao, type FluxoNoConfig, type FluxoGatilhoConfig, type InsertBuddhaMktTemplate, type InsertDisparo, type InsertDisparoDestinatario } from "../drizzle/schema";
import type { LinhaClienteImportada } from "./clientesXlsxParser";
import type { LinhaAtendimentoBelleImportada } from "./atendimentosBelleXlsxParser";
import type { LinhaRegistroFinanceiroBelleImportada } from "./registrosFinanceirosBelleXlsxParser";
import type { RelatorioPlanosBelleImportado, VinculoPlanoBelleImportado } from "./planosBelleXlsParser";
import { normalizarTelefone, variantesTelefone, telefoneCanonico, telefonesCorrespondem } from "@shared/telefone";
import { SECAO_OFFSET, type LinhaComandaItemImportada } from "./comandaVirtualXlsxParser";
import { ENV } from './_core/env';
import { gerarTextoConciliacao, type ItemConciliacao } from "@shared/conciliacao";
import { DRE_CATEGORIAS_SEED, DRE_DESCRICOES_SEED, DRE_REGRAS_SEED, sugerirDescricaoNome, CHAVE_RECEITA_PIX, CHAVE_RECEITA_ESPECIE, CHAVE_RECEITA_CARTAO_DEBITO, CHAVE_RECEITA_CARTAO_CREDITO, CHAVE_TRANSACAO_ENTRE_UNIDADES, CHAVE_TRANSFERENCIA_MESMO_CNPJ, CHAVE_RECEITA_VOUCHER_SITE, CHAVE_RECEITA_GYMPASS_TOTALPASS, mesAnterior, mesSeguinte, type RegraMatch, type DreSecao } from "./dreCategorizacao";
import { storageGetSignedUrl, storageExists } from "./storage";
import { chamadosParametros, clientesPreferenciasTerapeuta, atendimentosOperacional, atendimentoTempoEventos, terapeutasLiberacoes, conciliacaoCorrespondenciasManuais, type InsertChamadoParametro } from "../drizzle/schema";
import { cobrancasLink, cobrancasLinkModelos, confirmacaoPagamentosConsultas, type InsertCobrancaLink, type InsertCobrancaLinkModelo } from "../drizzle/schema";
import { resumoMensalUnidade, type InsertResumoMensalUnidade, type ResumoMensalUnidade } from "../drizzle/schema";
import { etiquetas, clienteEtiquetas, type Etiqueta } from "../drizzle/schema";
import { camposPersonalizados, clienteCamposValores, type CampoPersonalizado } from "../drizzle/schema";
import { listaEspera } from "../drizzle/schema";
import { funisReativacao, reativacaoStatus, funisReativacaoOcultos, reativacaoContatos, type FunilReativacao } from "../drizzle/schema";
import { deduplicarProximosAtendimentos } from "./proximosAtendimentos";
import { calcularFidelizacao, calcularPreferenciaisPorAtendimento, calcularFechamentoAgenda, calcularEvolucaoFidelizacao, type GranularidadeEvolucao } from "./terapeutasRelatorios";
import { calcularRelatorioTempoAtendimento, escolherAtendimentoPorEvento, identificarEventoTempoAtendimento, nomesCorrespondem, identificarTerapeuta, nomesClienteCorrespondem, type EventoTempoAtendimento, type LinhaTempoAtendimento } from "./tempoAtendimento";

let _db: ReturnType<typeof drizzle> | null = null;

export type ModoAutomacaoAgentes = "ativa" | "bloqueada_temporariamente" | "bloqueada_permanentemente";
const DUAS_HORAS_MS = 2 * 60 * 60 * 1000;

/** Resolve o bloqueio por data durante a leitura e o webhook, sem tarefa agendada. */
export function obterModoEfetivoAutomacaoAgentes(conversa: {
  automacaoAgentes?: ModoAutomacaoAgentes | null;
  automacaoAgentesBloqueadaAte?: Date | string | null;
}, agora = new Date()): ModoAutomacaoAgentes {
  if (conversa.automacaoAgentes === "bloqueada_permanentemente") return "bloqueada_permanentemente";
  if (conversa.automacaoAgentes === "bloqueada_temporariamente" && conversa.automacaoAgentesBloqueadaAte) {
    const bloqueadaAte = new Date(conversa.automacaoAgentesBloqueadaAte);
    if (!Number.isNaN(bloqueadaAte.getTime()) && bloqueadaAte.getTime() > agora.getTime()) return "bloqueada_temporariamente";
  }
  return "ativa";
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Debug TEMPORÁRIO (2026-08-15) — grava direto no banco em vez de
 * log de arquivo, que se mostrou não confiável (dev vs produção) pra
 * investigar o payload real que a Z-API manda em contato @lid novo.
 * Nunca lança erro — debug não pode derrubar o webhook.
 */
export async function registrarWebhookDebug(origem: string, payloadBruto: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(webhookDebugLog).values({ origem, payloadBruto });
  } catch (error) {
    console.error("[registrarWebhookDebug] Falha ao gravar:", error);
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

// Prefixo de openId pra conta convidada por e-mail (2026-08-10) — ainda
// não logou de verdade, então não tem um openId real do Google/Manus
// ainda. `openId` continua único (constraint da coluna), então usa um
// UUID aleatório com esse prefixo em vez de um valor fixo.
const PREFIXO_OPENID_CONVITE = "pending:";

/**
 * Cria uma conta "convidada" — sem a pessoa ter logado ainda. Existe
 * pra deixar admin configurar permissões ANTES do primeiro acesso
 * (pedido do usuário, 2026-08-10). Vira uma conta "de verdade" sozinha
 * assim que essa pessoa loga pelo Google com esse e-mail — ver
 * reivindicarOuCriarUsuarioGoogle abaixo, que casa pelo e-mail e
 * atualiza o openId da MESMA linha (preserva id e permissões já
 * configuradas, não cria linha duplicada).
 */
export async function criarConvite(email: string, name: string | null): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const existente = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existente[0]) throw new Error("Já existe uma conta com esse e-mail");

  const openId = `${PREFIXO_OPENID_CONVITE}${crypto.randomUUID()}`;
  const result = await db.insert(users).values({ openId, email, name, role: "user" }).$returningId();
  return result[0]?.id;
}

/**
 * Chamado pelo callback do login Google (server/_core/oauth.ts) ANTES
 * do upsert de sempre. Se existe uma conta convidada (openId com
 * prefixo "pending:") com esse e-mail, reivindica ela — atualiza o
 * openId pra o real do Google na MESMA linha, preservando id/role/
 * permissões já configuradas — e retorna `true`. `false` significa
 * "sem convite pendente, segue o fluxo normal (upsertUser)".
 */
export async function reivindicarConvitePorEmail(email: string, openIdReal: string, name: string | null): Promise<boolean> {
  const db = await getDb();
  if (!db || !email) return false;

  const pendente = await db.select({ id: users.id }).from(users)
    .where(and(eq(users.email, email), like(users.openId, `${PREFIXO_OPENID_CONVITE}%`)))
    .limit(1);
  if (!pendente[0]) return false;

  await db.update(users).set({
    openId: openIdReal,
    name: name || null,
    loginMethod: "google",
    lastSignedIn: new Date(),
  }).where(eq(users.id, pendente[0].id));
  return true;
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Acha o role já atribuído a esse e-mail em qualquer login anterior —
 * usado pelo login direto com Google (server/_core/oauth.ts) pra herdar
 * admin de quem já era admin pelo portal do Manus. Os dois métodos de
 * login geram um `openId` diferente pra mesma pessoa (um vem do Manus,
 * outro é "google:<sub>"), então a promoção automática por
 * ENV.ownerOpenId (ver upsertUser acima) não bate pro login novo —
 * sem isso, a mesma pessoa vira "user" comum ao entrar pelo Google.
 */
export async function getRoleByEmail(email: string): Promise<"user" | "admin" | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ role: users.role }).from(users)
    .where(and(eq(users.email, email), eq(users.role, "admin")))
    .limit(1);
  return rows[0]?.role ?? null;
}

// ===== Unidades =====

export async function getUnidades() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(unidades);
}

/**
 * Mesma lista de getUnidades, mas já filtrada pelas unidades que essa
 * conta pode ver (ver getUnidadesPermitidasUsuario, controle de acesso
 * por unidade). Admin nunca é afetado — mesma regra do controle por
 * módulo. É o ÚNICO ponto de filtro: UnidadeSelector, Dashboard,
 * Configurações etc. todos herdam a lista já filtrada porque todos
 * consomem unidades.list (que chama esta função), não getUnidades
 * direto.
 */
export async function getUnidadesParaUsuario(userId: number, role: "user" | "admin") {
  const todas = await getUnidades();
  if (role === "admin") return todas;
  const { restrito, unidadeIds } = await getUnidadesPermitidasUsuario(userId);
  if (!restrito || unidadeIds.length === 0) return todas;
  const permitidas = new Set(unidadeIds);
  return todas.filter((u) => permitidas.has(u.id));
}

const CAMPOS_CREDENCIAIS_UNIDADE = [
  "belleToken", "zapiInstanceId", "zapiToken", "zapiClientToken",
  "interClientId", "interClientSecret", "interCertificado", "interChavePrivada",
  "mpAccessToken", "mpWebhookUrl", "mpWebhookSecret", "sicrediClientId", "sicrediClientSecret", "sicrediCertificado", "sicrediChavePrivada",
] as const;

/** Remove segredos antes de retornar unidades a procedimentos acessíveis a usuários não administradores. */
export function unidadeSemCredenciais<T extends Record<string, unknown>>(unidade: T): Omit<T, (typeof CAMPOS_CREDENCIAIS_UNIDADE)[number]> {
  const publica: Record<string, unknown> = { ...unidade };
  for (const campo of CAMPOS_CREDENCIAIS_UNIDADE) delete publica[campo];
  return publica as Omit<T, (typeof CAMPOS_CREDENCIAIS_UNIDADE)[number]>;
}

export async function getUnidadeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(unidades).where(eq(unidades.id, id)).limit(1);
  return result[0];
}

export async function getUnidadeBySlug(slug: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(unidades).where(eq(unidades.slug, slug)).limit(1);
  return result[0];
}

/**
 * Acha a unidade FÍSICA real (canal="zapi", exclui a unidade sintética
 * Buddha Mkt) a partir do flag "rbs"/"ssu" usado no import de planilha
 * (upsertClientesImportados) — esse flag não é o slug real da unidade,
 * é só o rótulo da planilha. Mesma convenção de substring já usada em
 * criarClienteManual pra decidir RBS vs SSU pelo slug de verdade.
 */
export async function getUnidadeFisicaPorFlag(flag: "rbs" | "ssu"): Promise<Unidade | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const todas = await db.select().from(unidades).where(eq(unidades.canal, "zapi"));
  return todas.find((u) => {
    const ehRbs = u.slug.includes("ribeirao") || u.slug.includes("rbs");
    return flag === "rbs" ? ehRbs : !ehRbs;
  });
}

/**
 * Correção retroativa (2026-08-15): conversas presas em @lid
 * (isLidPendente="true") cujo lid JÁ está resolvido em lid_mapping —
 * seja porque "Resolver LIDs" rodou depois que a conversa ficou presa,
 * seja porque o import da planilha acabou de resolver um cliente novo
 * — mas ninguém mandou mensagem nova depois pra disparar a promoção
 * automática que já existe em upsertInboxConversa. Promove na hora,
 * sem esperar.
 */
export async function promoverConversasPendentesPorLidMapping(unidadeId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const pendentes = await db.select({ id: inboxConversas.id, chatLid: inboxConversas.chatLid })
    .from(inboxConversas)
    .where(and(eq(inboxConversas.unidadeId, unidadeId), eq(inboxConversas.isLidPendente, "true")));
  if (pendentes.length === 0) return 0;

  let promovidas = 0;
  for (const conversa of pendentes) {
    if (!conversa.chatLid) continue;
    const mapeamento = await db.select({ telefoneCanonico: lidMapping.telefoneCanonico })
      .from(lidMapping)
      .where(and(eq(lidMapping.unidadeId, unidadeId), eq(lidMapping.lid, conversa.chatLid)))
      .limit(1);
    const telefone = mapeamento[0]?.telefoneCanonico;
    if (!telefone) continue;
    const clienteId = await buscarClienteIdPorTelefone(telefone);
    await db.update(inboxConversas).set({
      telefone,
      isLidPendente: "false",
      ...(clienteId ? { clienteId } : {}),
    }).where(eq(inboxConversas.id, conversa.id));
    promovidas++;
  }
  return promovidas;
}

export async function updateUnidade(id: number, dados: Partial<InsertUnidade>) {
  const db = await getDb();
  if (!db) return;
  await db.update(unidades).set(dados).where(eq(unidades.id, id));
}

// ===== Leads =====

export async function createLead(lead: InsertLead) {
  const db = await getDb();
  if (!db) return;
  await db.insert(leads).values(lead);
}

export async function getLeads(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(leads).where(eq(leads.unidadeId, unidadeId)).orderBy(desc(leads.createdAt));
}

export async function updateLeadStatus(id: number, status: string, belleCodigo?: number, erroBelle?: string) {
  const db = await getDb();
  if (!db) return;
  const updateData: Record<string, unknown> = { statusEnvioBelle: status as any };
  if (belleCodigo !== undefined) updateData.belleCodigo = belleCodigo;
  if (erroBelle !== undefined) updateData.erroBelle = erroBelle;
  await db.update(leads).set(updateData).where(eq(leads.id, id));
}

// ===== Metas =====

export async function getMetas(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(metas).where(eq(metas.unidadeId, unidadeId));
}

export async function upsertMeta(meta: InsertMeta) {
  const db = await getDb();
  if (!db) return;
  await db.insert(metas).values(meta).onDuplicateKeyUpdate({
    set: {
      valorFaturamento: meta.valorFaturamento,
      valorRecebimento: meta.valorRecebimento,
      numAgendamentos: meta.numAgendamentos,
      numNovosClientes: meta.numNovosClientes,
    },
  });
}

// ===== Lâminas =====

export async function getLaminas(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(laminas).where(eq(laminas.unidadeId, unidadeId)).orderBy(desc(laminas.createdAt));
}

export async function createLamina(lamina: InsertLamina) {
  const db = await getDb();
  if (!db) return;
  await db.insert(laminas).values(lamina);
}

export async function updateLamina(id: number, dados: Partial<InsertLamina>) {
  const db = await getDb();
  if (!db) return;
  await db.update(laminas).set(dados).where(eq(laminas.id, id));
}

// ===== Sync Logs =====

export async function createSyncLog(log: InsertSyncLog) {
  const db = await getDb();
  if (!db) return;
  await db.insert(syncLogs).values(log);
}

export async function getSyncLogs(unidadeId: number, limit: number = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(syncLogs).where(eq(syncLogs.unidadeId, unidadeId)).orderBy(desc(syncLogs.createdAt)).limit(limit);
}

const TIPOS_IMPORTACAO_DADOS = [
  "importacao_clientes",
  "importacao_planos",
  "importacao_vinculos_planos",
  "importacao_atendimentos",
] as const;

export async function getStatusImportacoesDados(unidadeId: number) {
  const db = await getDb();
  const vazio = { clientes: null, planos: null, vinculos: null, atendimentos: null };
  if (!db) return vazio;

  const logs = await db.select({ tipo: syncLogs.tipo, status: syncLogs.status, registrosProcessados: syncLogs.registrosProcessados, createdAt: syncLogs.createdAt, detalhes: syncLogs.detalhes })
    .from(syncLogs)
    .where(and(eq(syncLogs.unidadeId, unidadeId), inArray(syncLogs.tipo, [...TIPOS_IMPORTACAO_DADOS])))
    .orderBy(desc(syncLogs.createdAt));

  const maisRecente = (tipo: string) => logs.find((log) => log.tipo === tipo) ?? null;
  const clientePorUnidade = unidadeId === 1 ? eq(clientes.clienteSsu, true) : eq(clientes.clienteRbs, true);
  const [clientesImportados] = await db.select({ data: sql<Date | null>`max(${clientes.updatedAt})` }).from(clientes).where(clientePorUnidade);
  const [planosImportados] = await db.select({ data: sql<Date | null>`max(${bellePlanosClientes.importadoEm})` }).from(bellePlanosClientes).where(eq(bellePlanosClientes.unidadeId, unidadeId));
  const [vinculosImportados] = await db.select({ data: sql<Date | null>`max(${bellePlanosClientes.vinculadoEm})` }).from(bellePlanosClientes).where(eq(bellePlanosClientes.unidadeId, unidadeId));
  const [atendimentosImportados] = await db.select({ data: sql<Date | null>`max(${belleAtendimentos.importadoEm})` }).from(belleAtendimentos).where(eq(belleAtendimentos.unidadeId, unidadeId));
  const [periodoPlanos] = await db.select({ inicio: sql<string | null>`min(${bellePlanosClientes.dataVenda})`, fim: sql<string | null>`max(${bellePlanosClientes.dataVenda})` }).from(bellePlanosClientes).where(eq(bellePlanosClientes.unidadeId, unidadeId));
  const [periodoAtendimentos] = await db.select({ inicio: sql<string | null>`min(${belleAtendimentos.dataAtendimento})`, fim: sql<string | null>`max(${belleAtendimentos.dataAtendimento})` }).from(belleAtendimentos).where(eq(belleAtendimentos.unidadeId, unidadeId));
  const vinculoClientes = maisRecente("importacao_vinculos_planos") ?? (vinculosImportados?.data ? { status: "sucesso" as const, registrosProcessados: 0, createdAt: vinculosImportados.data, detalhes: "Vínculos de planos existentes antes do painel de importações" } : null);

  return {
    clientes: maisRecente("importacao_clientes") ?? (clientesImportados?.data ? { status: "sucesso" as const, registrosProcessados: 0, createdAt: clientesImportados.data, detalhes: "Base local existente antes do painel de importações" } : null),
    planos: (maisRecente("importacao_planos") ?? (planosImportados?.data ? { status: "sucesso" as const, registrosProcessados: 0, createdAt: planosImportados.data, detalhes: "Espelho de planos existente antes do painel de importações" } : null)) && { ...(maisRecente("importacao_planos") ?? { status: "sucesso" as const, registrosProcessados: 0, createdAt: planosImportados!.data, detalhes: "Espelho de planos existente antes do painel de importações" }), periodo: periodoPlanos },
    vinculos: vinculoClientes && { ...vinculoClientes, periodo: periodoPlanos },
    atendimentos: (maisRecente("importacao_atendimentos") ?? (atendimentosImportados?.data ? { status: "sucesso" as const, registrosProcessados: 0, createdAt: atendimentosImportados.data, detalhes: "Espelho de atendimentos existente antes do painel de importações" } : null)) && { ...(maisRecente("importacao_atendimentos") ?? { status: "sucesso" as const, registrosProcessados: 0, createdAt: atendimentosImportados!.data, detalhes: "Espelho de atendimentos existente antes do painel de importações" }), periodo: periodoAtendimentos },
  };
}

// ===== Copilot Conversas =====

export async function createCopilotConversa(conversa: InsertCopilotConversa) {
  const db = await getDb();
  if (!db) return;
  await db.insert(copilotConversas).values(conversa);
}

export async function getCopilotConversas(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(copilotConversas).where(eq(copilotConversas.unidadeId, unidadeId)).orderBy(desc(copilotConversas.updatedAt));
}

export async function updateCopilotConversa(id: number, dados: Partial<InsertCopilotConversa>) {
  const db = await getDb();
  if (!db) return;
  await db.update(copilotConversas).set(dados).where(eq(copilotConversas.id, id));
}

// ===== Configurações =====

export async function getConfig(chave: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(configuracoes).where(eq(configuracoes.chave, chave)).limit(1);
  return result[0];
}

export async function setConfig(chave: string, valor: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(configuracoes).values({ chave, valor }).onDuplicateKeyUpdate({
    set: { valor },
  });
}

/**
 * Kill switch de mensageria: pausa TODO envio (WhatsApp, todas as
 * unidades/canais) a partir de um único toggle. Padrão ausente = ativo,
 * pra não exigir seed manual antes do primeiro uso.
 */
export async function mensageriaEstaAtiva(): Promise<boolean> {
  const config = await getConfig("mensageria_ativa");
  return config?.valor !== "false";
}

// ===== Inbox (Mensagens) =====

/**
 * Troca fotoUrl (caminho relativo /manus-storage/{key}) por uma URL
 * absoluta assinada do S3, mutando as linhas in-place. O domínio próprio
 * (buddhaspa-4g2wufs4.manus.space) não implementa de forma confiável o
 * redirecionamento 307 de /manus-storage/* — servir o caminho relativo
 * direto quebra a imagem. URL assinada vai direto pro S3, contornando
 * esse proxy. O valor salvo no banco continua sendo o caminho
 * permanente; a resolução é refeita a cada leitura (mesma estratégia do
 * mobai-crm).
 */
async function resolverFotosUrlAssinadas(rows: Array<{ id: number; fotoUrl?: string | null }>): Promise<void> {
  const comFoto = rows.filter((r) => r.fotoUrl && r.fotoUrl.startsWith("/manus-storage/"));
  if (comFoto.length === 0) return;
  const db = await getDb();
  await Promise.all(
    comFoto.map(async (row) => {
      const key = row.fotoUrl!.replace("/manus-storage/", "");
      try {
        // storageGetSignedUrl sozinho NUNCA falha por chave inexistente —
        // é só uma assinatura criptográfica local, sem bater no R2. Sem
        // checar existência de verdade primeiro, uma referência órfã
        // "assina com sucesso" pra sempre e nunca dispara o self-heal (foi
        // exatamente o que travou 274 fotos depois da troca de backend
        // Forge → R2, corrigido manualmente em 2026-08-25 — ver
        // registro_recuperacao_fotos_2026-08-25.md).
        const existe = await storageExists(key);
        if (!existe) throw new Error("objeto não encontrado no storage atual");
        row.fotoUrl = await storageGetSignedUrl(key);
      } catch (e) {
        console.error("[Inbox] Falha ao assinar fotoUrl:", e);
        // Chave não existe mais no storage atual. Sem limpar aqui, a
        // tentativa de assinar repete pra sempre a cada leitura. Zera pra
        // que o próprio webhook (ver hasFoto acima) rebusque uma foto nova
        // da Z-API na próxima mensagem dessa conversa.
        row.fotoUrl = null;
        if (db) {
          db.update(inboxConversas).set({ fotoUrl: null }).where(eq(inboxConversas.id, row.id)).catch(() => {});
        }
      }
    })
  );
}

/**
 * Checagem rápida (sem side-effects) se a conversa desse telefone já tem
 * fotoUrl salva — usado no webhook pra não rechamar a Z-API a cada
 * mensagem recebida, só quando a foto ainda estiver faltando. Só conta
 * como "tem foto" quando é um link do nosso próprio storage — link
 * direto do WhatsApp é temporário e expira.
 */
export async function inboxConversaTemFoto(telefone: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ fotoUrl: inboxConversas.fotoUrl }).from(inboxConversas)
    .where(eq(inboxConversas.telefone, telefone)).limit(1);
  const foto = rows[0]?.fotoUrl;
  return !!foto && foto.startsWith("/manus-storage/");
}

/**
 * Conversas Z-API da unidade sem foto salva — usado pelo botão admin de
 * "recuperar avatares" (ver server/routers.ts, inbox.conversas.recuperarFotos)
 * pra rebuscar de uma vez as fotos perdidas na troca de storage pro R2, sem
 * precisar esperar cada contato mandar mensagem de novo.
 *
 * ORDER BY id garante que cada lote avança pra próximas conversas em vez
 * de reconsultar a mesma fatia a cada chamada (a ordem de um SELECT sem
 * ORDER BY não é garantida pelo MySQL/TiDB) — sem isso, contatos que
 * nunca recebem fotoUrl (ver marcarConversaSemFotoWhatsapp) podiam
 * ocupar o topo de todo lote pra sempre, travando o processo nos mesmos
 * poucos contatos.
 */
export async function listConversasZapiSemFoto(unidadeId: number): Promise<Array<{ id: number; telefone: string; isGrupo: string | null }>> {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: inboxConversas.id, telefone: inboxConversas.telefone, isGrupo: inboxConversas.isGrupo })
    .from(inboxConversas)
    .where(and(
      eq(inboxConversas.unidadeId, unidadeId),
      eq(inboxConversas.canal, "zapi"),
      isNull(inboxConversas.fotoUrl),
    ))
    .orderBy(asc(inboxConversas.id));
}

export async function atualizarFotoConversa(id: number, fotoUrl: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxConversas).set({ fotoUrl }).where(eq(inboxConversas.id, id));
}

/**
 * Marca que a Z-API foi consultada e o contato não tem foto de perfil
 * definida no WhatsApp agora — string vazia (não NULL), pra sair do
 * filtro isNull(fotoUrl) de listConversasZapiSemFoto e não ser
 * reconsultada em todo lote seguinte. Diferente de uma falha de
 * download (mantida NULL, pra tentar de novo depois — pode ser link
 * expirado, transitório).
 */
export async function marcarConversaSemFotoWhatsapp(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxConversas).set({ fotoUrl: "" }).where(eq(inboxConversas.id, id));
}

/**
 * LEFT JOIN com clientes (mesmo espírito do mobai-crm): o Inbox não
 * deve mostrar só o que o WhatsApp manda como nome — quando a conversa
 * já está vinculada a um cliente Belle (clienteId), o nome do cadastro
 * tem prioridade. O vínculo em si é feito em buscarClienteIdPorTelefone,
 * chamado no webhook (mensagem nova) e em getInboxConversaById (ao abrir
 * uma conversa antiga que ainda não tinha sido linkada).
 */
export async function listInboxConversas(filtros: { unidadeId?: number; canal?: "zapi" | "buddha_mkt" }) {
  const db = await getDb();
  if (!db) return [];
  const condicoes = [];
  if (filtros.unidadeId !== undefined) condicoes.push(eq(inboxConversas.unidadeId, filtros.unidadeId));
  if (filtros.canal !== undefined) condicoes.push(eq(inboxConversas.canal, filtros.canal));
  const query = db.select({ ...getTableColumns(inboxConversas), clienteNome: clientes.nome })
    .from(inboxConversas)
    .leftJoin(clientes, eq(inboxConversas.clienteId, clientes.id))
    .orderBy(desc(inboxConversas.ultimaMensagemEm));
  const rows = condicoes.length === 0 ? await query : await query.where(and(...condicoes));
  await resolverFotosUrlAssinadas(rows);
  return rows;
}

export type StatusPlanoRelacionamento = "ativo" | "expirado" | "finalizado";

export interface PlanoRelacionamentoEntrada {
  planoBelleId?: number;
  validade: string | null;
  dataVenda?: string | null;
  tipo?: string | null;
  campanha?: string | null;
  vendedorNome?: string | null;
  importadoEm: Date | string | null;
  servicos: Array<{
    servicoNome?: string;
    sessoes?: number;
    restantes: number;
    agendados?: number;
  }>;
}

/**
 * Resume somente o necessário para a recepção: não transforma o painel em
 * prontuário e torna explícita a diferença entre plano ativo, expirado e
 * finalizado. A validade é ISO (YYYY-MM-DD), logo pode ser comparada como
 * texto sem ambiguidade de timezone.
 */
export function classificarPlanosRelacionamento(
  planos: PlanoRelacionamentoEntrada[],
  hojeBrt: string,
) {
  if (planos.length === 0) return null;

  const planosComSaldo = planos.map((plano) => ({
    ...plano,
    sessoesRestantes: plano.servicos.reduce((total, servico) => total + Math.max(0, servico.restantes ?? 0), 0),
  }));
  const planosVigentes = planosComSaldo.filter((plano) => !plano.validade || plano.validade >= hojeBrt);
  const planosAtivos = planosVigentes.filter((plano) => plano.sessoesRestantes > 0);
  const status: StatusPlanoRelacionamento = planosAtivos.length > 0
    ? "ativo"
    : planosVigentes.length > 0
      ? "finalizado"
      : "expirado";
  const referencia = status === "ativo" ? planosAtivos : status === "finalizado" ? planosVigentes : planosComSaldo;
  const validade = referencia.map((plano) => plano.validade).filter((data): data is string => Boolean(data)).sort().pop() ?? null;
  const atualizadoEm = planos.map((plano) => plano.importadoEm).filter((data): data is Date | string => Boolean(data))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;
  const detalhes = planosComSaldo.map((plano) => {
    const statusPlano: StatusPlanoRelacionamento = !plano.validade || plano.validade >= hojeBrt
      ? plano.sessoesRestantes > 0 ? "ativo" : "finalizado"
      : "expirado";
    return {
      planoBelleId: plano.planoBelleId ?? null,
      status: statusPlano,
      validade: plano.validade,
      dataVenda: plano.dataVenda ?? null,
      tipo: plano.tipo ?? null,
      campanha: plano.campanha ?? null,
      vendedorNome: plano.vendedorNome ?? null,
      servicos: plano.servicos.map((servico) => {
        const sessoes = Math.max(0, servico.sessoes ?? 0);
        const restantes = Math.max(0, servico.restantes ?? 0);
        const agendados = Math.max(0, servico.agendados ?? 0);
        return {
          nome: servico.servicoNome ?? "Serviço não identificado",
          sessoes,
          restantes,
          agendados,
          // O Belle fornece total, saldo e agendadas; a utilização é derivada
          // sem contar as sessões que já estão reservadas para o cliente.
          utilizadas: Math.max(0, sessoes - restantes - agendados),
        };
      }),
    };
  });

  return {
    status,
    sessoesDisponiveis: status === "ativo" ? planosAtivos.reduce((total, plano) => total + plano.sessoesRestantes, 0) : 0,
    validade,
    atualizadoEm,
    detalhes,
  };
}

// Status que o relatório de atendimentos do Belle usa pra agendamento
// ainda não realizado — diferente de "Atendido" (já aconteceu) e de
// "Desmarcado"/"Cancelado" (não vai acontecer). Confirmado com dados
// reais 2026-08-26: o relatório só traz agendamento futuro quando
// exportado com o período pedido incluindo datas à frente (senão vem
// só histórico, mesmo tendo agenda real no Belle).
// Status sintético (não vem do Belle) pra agendamento detectado na própria
// conversa — ver registrarAgendamentoInferidoBelle abaixo.
const STATUS_AGENDADO_POR_IA = "Agendado (IA)";
const STATUS_ATENDIMENTO_AGENDADO = ["Marcado", "Pré-Agendado", "Confirmado", STATUS_AGENDADO_POR_IA];

// Terapeuta curinga usado em pré-chamado (ver 2026-08-30-seed-terapeuta-curinga.sql)
// — não é uma pessoa real, então fica fora dos relatórios de terapeutas.
const NOME_TERAPEUTA_CURINGA = "Pendente de sorteio";

/**
 * Registra um agendamento visto na própria conversa (confirmação fixa do
 * Belle, ver shared/belleTemplates.ts extrairAgendamentoConfirmacaoBelle)
 * antes da próxima planilha trazer o dado oficial — cobre o caso de
 * agendamento feito no mesmo dia, que a planilha (atualizada
 * periodicamente) nunca pega a tempo. atendimentoBelleId negativo
 * (derivado da própria mensagem) garante que nunca colide com um ID real
 * do Belle (sempre positivo) e que reprocessar a mesma mensagem só
 * atualiza a mesma linha, não duplica. Some sozinho quando a planilha real
 * trouxer dado desse cliente (ver upsertAtendimentosBelleImportados).
 */
export async function registrarAgendamentoInferidoBelle(params: {
  unidadeId: number;
  mensagemId: number;
  clienteId: number | null;
  clienteNome: string;
  telefone: string | null;
  servicoNome?: string;
  dataAtendimento: string;
  horario: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const valores: InsertBelleAtendimento = {
    unidadeId: params.unidadeId,
    atendimentoBelleId: -params.mensagemId,
    clienteId: params.clienteId,
    clienteNome: params.clienteNome,
    telefone: params.telefone,
    dataAtendimento: params.dataAtendimento,
    horario: params.horario,
    servicoNome: params.servicoNome,
    status: STATUS_AGENDADO_POR_IA,
    temPreferencia: false,
    importadoEm: new Date(),
  };
  await db.insert(belleAtendimentos).values(valores).onDuplicateKeyUpdate({
    set: {
      clienteId: sql`VALUES(clienteId)`,
      clienteNome: sql`VALUES(clienteNome)`,
      telefone: sql`VALUES(telefone)`,
      dataAtendimento: sql`VALUES(dataAtendimento)`,
      horario: sql`VALUES(horario)`,
      servicoNome: sql`VALUES(servicoNome)`,
      importadoEm: sql`VALUES(importadoEm)`,
    },
  });
}

/**
 * Cancela/edita manualmente uma linha de belle_atendimentos mostrada como
 * "próximo atendimento" no Inbox — vale tanto pra linha real do Belle
 * (efeito só local: some daqui até a próxima planilha trazer o status
 * atualizado de verdade) quanto pra "Agendado (IA)" (aqui sim é
 * definitivo, já que nada mais vai sobrescrever essa linha sozinho).
 */
export async function cancelarAtendimentoBelle(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(belleAtendimentos).set({ status: "Cancelado" }).where(eq(belleAtendimentos.id, id));
}

export async function editarAtendimentoBelle(id: number, dados: {
  dataAtendimento?: string;
  horario?: string | null;
  servicoNome?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(belleAtendimentos).set(dados).where(eq(belleAtendimentos.id, id));
}

/**
 * Inclusão operacional feita pela recepção. Não altera a agenda do Belle: a
 * linha fica identificada como CRM até a próxima importação trazer o registro
 * oficial, quando a deduplicação mantém o dado do Belle como prioritário.
 */
export async function criarProximoAtendimentoInbox(params: {
  unidadeId: number;
  clienteId: number;
  clienteNome: string;
  telefone: string | null;
  dataAtendimento: string;
  horario: string | null;
  servicoNome: string | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const resultado = await db.insert(belleAtendimentos).values({
    unidadeId: params.unidadeId,
    // IDs negativos nunca conflitam com IDs reais do Belle. Em milissegundos,
    // também não colidem com os IDs negativos derivados das mensagens.
    atendimentoBelleId: -Date.now(),
    clienteId: params.clienteId,
    clienteNome: params.clienteNome,
    telefone: params.telefone,
    dataAtendimento: params.dataAtendimento,
    horario: params.horario,
    servicoNome: params.servicoNome,
    status: STATUS_AGENDADO_POR_IA,
    temPreferencia: false,
    importadoEm: new Date(),
  });
  return Number(resultado[0].insertId);
}

/**
 * Lista os atendimentos ainda previstos para o dia corrente, pela unidade.
 * É uma visão operacional local: não consulta o Belle a cada abertura e não
 * altera agenda, status ou o vínculo do cliente. A data segue BRT, como os
 * demais resumos do Inbox.
 */
export async function listarProximosAtendimentosHoje(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  const hojeBrt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const registros = await db.select({
    id: belleAtendimentos.id,
    clienteId: belleAtendimentos.clienteId,
    clienteNome: belleAtendimentos.clienteNome,
    telefone: belleAtendimentos.telefone,
    dataAtendimento: belleAtendimentos.dataAtendimento,
    horario: belleAtendimentos.horario,
    servicoNome: belleAtendimentos.servicoNome,
    profissionalNome: belleAtendimentos.profissionalNome,
    status: belleAtendimentos.status,
    terapeutaOrganizado: atendimentosOperacional.terapeutaNome,
    salaOrganizada: atendimentosOperacional.sala,
    preferencialOrganizado: atendimentosOperacional.preferencial,
  }).from(belleAtendimentos)
    .leftJoin(atendimentosOperacional, and(
      eq(atendimentosOperacional.unidadeId, belleAtendimentos.unidadeId),
      eq(atendimentosOperacional.atendimentoBelleId, belleAtendimentos.id),
    ))
    .where(and(
      eq(belleAtendimentos.unidadeId, unidadeId),
      eq(belleAtendimentos.dataAtendimento, hojeBrt),
      inArray(belleAtendimentos.status, STATUS_ATENDIMENTO_AGENDADO),
      isNull(atendimentosOperacional.removidoEm),
    ))
    .orderBy(asc(belleAtendimentos.horario), asc(belleAtendimentos.clienteNome));

  // A confirmação enviada pelo Inbox cria temporariamente uma linha
  // “Agendado (IA)”. Quando o mesmo atendimento chega pelo relatório Belle,
  // ele deve prevalecer na visão operacional, inclusive se o vínculo de
  // cliente ainda estiver pendente. O cadastro original continua intacto.
  return deduplicarProximosAtendimentos(registros, STATUS_AGENDADO_POR_IA);
}

/**
 * Relatório de agenda — todos os atendimentos (passados e futuros,
 * qualquer status: Atendido/Marcado/Desmarcado/Cancelado/Agendado IA/
 * etc.) de um período. Diferente de listarProximosAtendimentosHoje (só
 * hoje, só status "agendado", com organização de terapeuta/sala/chamado),
 * essa é uma visão de leitura simples pra relatório, sem ação operacional.
 * Lê belle_atendimentos direto, sem depender da API ao vivo do Belle —
 * que nunca chegou a ter token configurado nesse projeto.
 */
export async function listarAgendaPeriodo(unidadeId: number, dataInicio: string, dataFim: string) {
  const db = await getDb();
  if (!db) return [];
  const registros = await db.select({
    id: belleAtendimentos.id,
    clienteNome: belleAtendimentos.clienteNome,
    dataAtendimento: belleAtendimentos.dataAtendimento,
    horario: belleAtendimentos.horario,
    servicoNome: belleAtendimentos.servicoNome,
    profissionalNome: belleAtendimentos.profissionalNome,
    status: belleAtendimentos.status,
  }).from(belleAtendimentos)
    .where(and(
      eq(belleAtendimentos.unidadeId, unidadeId),
      gte(belleAtendimentos.dataAtendimento, dataInicio),
      lte(belleAtendimentos.dataAtendimento, dataFim),
    ))
    .orderBy(asc(belleAtendimentos.dataAtendimento), asc(belleAtendimentos.horario), asc(belleAtendimentos.clienteNome));
  // "Agendado (IA)" só é ruído aqui quando o mesmo atendimento também já
  // chegou pela planilha real — deduplicarProximosAtendimentos cuida disso
  // igual nas outras telas; casos que só existem como IA (planilha ainda
  // não trouxe) continuam aparecendo normalmente.
  return deduplicarProximosAtendimentos(registros, STATUS_AGENDADO_POR_IA);
}

export async function salvarOrganizacaoProximoAtendimento(params: {
  unidadeId: number; atendimentoBelleId: number; terapeutaNome?: string | null; sala?: string | null; preferencial?: boolean;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existente = await db.select({ id: atendimentosOperacional.id }).from(atendimentosOperacional)
    .where(and(eq(atendimentosOperacional.unidadeId, params.unidadeId), eq(atendimentosOperacional.atendimentoBelleId, params.atendimentoBelleId)))
    .limit(1);
  const dados = {
    ...(params.terapeutaNome !== undefined ? { terapeutaNome: params.terapeutaNome || null } : {}),
    ...(params.sala !== undefined ? { sala: params.sala || null } : {}),
    ...(params.preferencial !== undefined ? { preferencial: params.preferencial } : {}),
  };
  if (existente[0]) {
    await db.update(atendimentosOperacional).set(dados).where(eq(atendimentosOperacional.id, existente[0].id));
  } else {
    await db.insert(atendimentosOperacional).values({ unidadeId: params.unidadeId, atendimentoBelleId: params.atendimentoBelleId, terapeutaNome: null, sala: null, preferencial: false, ...dados });
  }
}

export async function registrarChamadoAtendimento(unidadeId: number, atendimentoBelleId: number, terapeutaNome?: string | null, ocorridoEm = new Date()): Promise<void> {
  const database = await getDb();
  if (!database) return;
  const nome = terapeutaNome?.trim() || null;
  const terapeutasDaUnidade = nome ? await database.select({ id: terapeutas.id, nomeCompleto: terapeutas.nomeCompleto, nomeAbreviado: terapeutas.nomeAbreviado }).from(terapeutas).where(eq(terapeutas.unidadeId, unidadeId)) : [];
  const nomeNormalizado = nome?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const terapeutaCadastrado = nomeNormalizado ? terapeutasDaUnidade.filter((item) => [item.nomeAbreviado, item.nomeCompleto]
    .some((valor) => valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR") === nomeNormalizado)) : [];
  const terapeutaId = terapeutaCadastrado.length === 1 ? terapeutaCadastrado[0].id : null;
  const existente = await database.select({ id: atendimentosOperacional.id, chamadoEm: atendimentosOperacional.chamadoEm, terapeutaNome: atendimentosOperacional.terapeutaNome, terapeutaId: atendimentosOperacional.terapeutaId })
    .from(atendimentosOperacional)
    .where(and(eq(atendimentosOperacional.unidadeId, unidadeId), eq(atendimentosOperacional.atendimentoBelleId, atendimentoBelleId)))
    .limit(1);
  if (existente[0]) {
    const atualizacao: { chamadoEm?: Date; terapeutaNome?: string; terapeutaId?: number } = {};
    if (!existente[0].chamadoEm) atualizacao.chamadoEm = ocorridoEm;
    if (!existente[0].terapeutaNome && nome) atualizacao.terapeutaNome = nome;
    if (!existente[0].terapeutaId && terapeutaId) atualizacao.terapeutaId = terapeutaId;
    if (Object.keys(atualizacao).length > 0) {
      await database.update(atendimentosOperacional).set(atualizacao).where(eq(atendimentosOperacional.id, existente[0].id));
    }
    return;
  }
  await database.insert(atendimentosOperacional).values({ unidadeId, atendimentoBelleId, terapeutaId, terapeutaNome: nome, preferencial: false, chamadoEm: ocorridoEm });
}

export async function registrarMarcoTempoAtendimento(params: {
  unidadeId: number;
  atendimentoBelleId: number;
  terapeutaId?: number | null;
  evento: EventoTempoAtendimento;
  ocorridoEm?: Date;
}): Promise<void> {
  const database = await getDb();
  if (!database) return;
  const existente = await database.select({
    id: atendimentosOperacional.id,
    terapeutaId: atendimentosOperacional.terapeutaId,
    inicioEm: atendimentosOperacional.inicioEm,
    fimEm: atendimentosOperacional.fimEm,
  }).from(atendimentosOperacional)
    .where(and(eq(atendimentosOperacional.unidadeId, params.unidadeId), eq(atendimentosOperacional.atendimentoBelleId, params.atendimentoBelleId)))
    .limit(1);
  const ocorridoEm = params.ocorridoEm ?? new Date();
  const campo = params.evento === "inicio" ? "inicioEm" : "fimEm";
  const jaRegistrado = params.evento === "inicio" ? existente[0]?.inicioEm : existente[0]?.fimEm;
  if (jaRegistrado) return;
  if (existente[0]) {
    const atualizacao = params.evento === "inicio" ? { inicioEm: ocorridoEm } : { fimEm: ocorridoEm };
    if (!existente[0].terapeutaId && params.terapeutaId) {
      await database.update(atendimentosOperacional).set({ ...atualizacao, terapeutaId: params.terapeutaId }).where(eq(atendimentosOperacional.id, existente[0].id));
    } else {
      await database.update(atendimentosOperacional).set(atualizacao).where(eq(atendimentosOperacional.id, existente[0].id));
    }
    return;
  }
  await database.insert(atendimentosOperacional).values({
    unidadeId: params.unidadeId,
    atendimentoBelleId: params.atendimentoBelleId,
    terapeutaId: params.terapeutaId ?? null,
    preferencial: false,
    ...(campo === "inicioEm" ? { inicioEm: ocorridoEm } : { fimEm: ocorridoEm }),
  });
}

type ResultadoAssociacaoTempo = {
  evento: EventoTempoAtendimento;
  status: "associado" | "pendente" | "ambigua";
  atendimentoBelleId: number | null;
};

async function associarEventoTempoAtendimento(eventoId: number): Promise<ResultadoAssociacaoTempo | null> {
  const database = await getDb();
  if (!database) return null;
  const eventos = await database.select().from(atendimentoTempoEventos).where(eq(atendimentoTempoEventos.id, eventoId)).limit(1);
  const evento = eventos[0];
  if (!evento) return null;
  if (evento.status === "associado" && evento.atendimentoBelleId) {
    return { evento: evento.evento, status: "associado", atendimentoBelleId: evento.atendimentoBelleId };
  }

  const identidade = await resolverIdentidadeParticipante({
    unidadeId: evento.unidadeId,
    telefone: evento.participanteTelefone,
    participanteId: evento.participanteLid,
    nomeWhatsapp: evento.participanteNome,
  });
  if (identidade.tipo !== "terapeuta") {
    const motivo = identidade.tipo === "cliente" ? "Participante identificado como cliente" : "Terapeuta ainda não identificado no cadastro";
    await database.update(atendimentoTempoEventos).set({ status: "pendente", motivo, processadoEm: new Date() }).where(eq(atendimentoTempoEventos.id, evento.id));
    return { evento: evento.evento, status: "pendente", atendimentoBelleId: null };
  }

  const referenciaEvento = evento.ocorridoEm;
  const limiteInferior = new Date(referenciaEvento.getTime() - 24 * 60 * 60 * 1000);
  const limiteSuperior = new Date(referenciaEvento.getTime() + 5 * 60 * 1000);
  const candidatos = await database.select({
    atendimentoBelleId: belleAtendimentos.id,
    terapeutaId: atendimentosOperacional.terapeutaId,
    terapeutaNomeOrganizado: atendimentosOperacional.terapeutaNome,
    profissionalNome: belleAtendimentos.profissionalNome,
    clienteNome: belleAtendimentos.clienteNome,
    servicoNome: belleAtendimentos.servicoNome,
    sala: atendimentosOperacional.sala,
    chamadoEm: atendimentosOperacional.chamadoEm,
    inicioEm: atendimentosOperacional.inicioEm,
    fimEm: atendimentosOperacional.fimEm,
  }).from(atendimentosOperacional)
    .innerJoin(belleAtendimentos, and(
      eq(belleAtendimentos.unidadeId, atendimentosOperacional.unidadeId),
      eq(belleAtendimentos.id, atendimentosOperacional.atendimentoBelleId),
    ))
    .where(and(
      eq(atendimentosOperacional.unidadeId, evento.unidadeId),
      gte(atendimentosOperacional.chamadoEm, limiteInferior),
      lte(atendimentosOperacional.chamadoEm, limiteSuperior),
      isNotNull(atendimentosOperacional.chamadoEm),
      evento.evento === "inicio" ? isNull(atendimentosOperacional.inicioEm) : isNotNull(atendimentosOperacional.inicioEm),
      evento.evento === "fim" ? isNull(atendimentosOperacional.fimEm) : undefined,
    ))
    .orderBy(evento.evento === "inicio" ? asc(atendimentosOperacional.chamadoEm) : asc(atendimentosOperacional.inicioEm))
    .limit(100);
  const candidatosDoTerapeuta = candidatos.filter((linha) => (
    (linha.terapeutaId && identidade.terapeutaId && linha.terapeutaId === identidade.terapeutaId)
    || (!linha.terapeutaId && nomesCorrespondem(identidade.nome, linha.terapeutaNomeOrganizado || linha.profissionalNome))
  ));
  const candidato = escolherAtendimentoPorEvento(
    identidade.nome || evento.participanteNome,
    evento.conteudo,
    candidatosDoTerapeuta.map((linha) => ({
      atendimentoBelleId: linha.atendimentoBelleId,
      terapeutaId: linha.terapeutaId,
      terapeutaNome: linha.terapeutaNomeOrganizado || linha.profissionalNome,
      clienteNome: linha.clienteNome,
      servicoNome: linha.servicoNome,
      sala: linha.sala,
    })),
  );
  if (!candidato) {
    const motivo = candidatosDoTerapeuta.length > 1 ? "Mais de um atendimento possível sem identificador único" : "Nenhum atendimento chamado pendente encontrado";
    const status = candidatosDoTerapeuta.length > 1 ? "ambigua" : "pendente";
    await database.update(atendimentoTempoEventos).set({ status, motivo, processadoEm: new Date() }).where(eq(atendimentoTempoEventos.id, evento.id));
    return { evento: evento.evento, status, atendimentoBelleId: null };
  }

  await registrarMarcoTempoAtendimento({
    unidadeId: evento.unidadeId,
    atendimentoBelleId: candidato.atendimentoBelleId,
    terapeutaId: identidade.terapeutaId,
    evento: evento.evento,
    ocorridoEm: evento.ocorridoEm,
  });
  await database.update(atendimentoTempoEventos).set({
    status: "associado",
    atendimentoBelleId: candidato.atendimentoBelleId,
    motivo: null,
    processadoEm: new Date(),
  }).where(eq(atendimentoTempoEventos.id, evento.id));
  return { evento: evento.evento, status: "associado", atendimentoBelleId: candidato.atendimentoBelleId };
}

export async function registrarEventoTempoAtendimento(params: {
  unidadeId: number;
  conversaId?: number | null;
  mensagemId?: number | null;
  zapiMessageId?: string | null;
  participanteTelefone?: string | null;
  participanteLid?: string | null;
  participanteNome?: string | null;
  conteudo: string | null | undefined;
  ocorridoEm?: Date;
}): Promise<ResultadoAssociacaoTempo | null> {
  const evento = identificarEventoTempoAtendimento(params.conteudo);
  if (!evento) return null;
  const database = await getDb();
  if (!database) return null;
  const identificadorExistente = params.zapiMessageId
    ? eq(atendimentoTempoEventos.zapiMessageId, params.zapiMessageId)
    : params.mensagemId
      ? eq(atendimentoTempoEventos.mensagemId, params.mensagemId)
      : null;
  if (identificadorExistente) {
    const existente = await database.select({ id: atendimentoTempoEventos.id }).from(atendimentoTempoEventos)
      .where(identificadorExistente).limit(1);
    if (existente[0]) return associarEventoTempoAtendimento(existente[0].id);
  }
  const inserido = await database.insert(atendimentoTempoEventos).values({
    unidadeId: params.unidadeId,
    conversaId: params.conversaId ?? null,
    mensagemId: params.mensagemId ?? null,
    zapiMessageId: params.zapiMessageId ?? null,
    evento,
    participanteTelefone: params.participanteTelefone ?? null,
    participanteLid: params.participanteLid ?? null,
    participanteNome: params.participanteNome?.trim() || null,
    conteudo: params.conteudo ?? null,
    ocorridoEm: params.ocorridoEm ?? new Date(),
  }).$returningId();
  const eventoId = inserido[0]?.id;
  return eventoId ? associarEventoTempoAtendimento(eventoId) : null;
}

export async function reprocessarEventosTempoAtendimento(unidadeId: number, limite = 200) {
  const database = await getDb();
  if (!database) return { processados: 0, associados: 0 };
  const eventos = await database.select({ id: atendimentoTempoEventos.id }).from(atendimentoTempoEventos)
    .where(and(eq(atendimentoTempoEventos.unidadeId, unidadeId), inArray(atendimentoTempoEventos.status, ["pendente", "ambigua"])))
    .orderBy(asc(atendimentoTempoEventos.createdAt)).limit(limite);
  let associados = 0;
  for (const evento of eventos) {
    const resultado = await associarEventoTempoAtendimento(evento.id);
    if (resultado?.status === "associado") associados++;
  }
  return { processados: eventos.length, associados };
}

export async function listarRelatorioTempoAtendimento(unidadeId: number, dataInicio: string, dataFim: string) {
  const database = await getDb();
  if (!database) return calcularRelatorioTempoAtendimento([], dataInicio, dataFim);
  const registros = await database.select({
    atendimentoId: belleAtendimentos.id,
    dataAtendimento: belleAtendimentos.dataAtendimento,
    horario: belleAtendimentos.horario,
    clienteNome: belleAtendimentos.clienteNome,
    profissionalNome: belleAtendimentos.profissionalNome,
    terapeutaOrganizado: atendimentosOperacional.terapeutaNome,
    servicoNome: belleAtendimentos.servicoNome,
    duracaoBelleMinutos: belleAtendimentos.duracaoMinutos,
    chamadoEm: atendimentosOperacional.chamadoEm,
    inicioEm: atendimentosOperacional.inicioEm,
    fimEm: atendimentosOperacional.fimEm,
  }).from(belleAtendimentos)
    .innerJoin(atendimentosOperacional, and(
      eq(atendimentosOperacional.unidadeId, belleAtendimentos.unidadeId),
      eq(atendimentosOperacional.atendimentoBelleId, belleAtendimentos.id),
    ))
    .where(and(
      eq(belleAtendimentos.unidadeId, unidadeId),
      gte(belleAtendimentos.dataAtendimento, dataInicio),
      lte(belleAtendimentos.dataAtendimento, dataFim),
      isNotNull(atendimentosOperacional.chamadoEm),
    ))
    .orderBy(desc(atendimentosOperacional.chamadoEm));

  const linhas: LinhaTempoAtendimento[] = registros
    .map((registro) => ({
      atendimentoId: registro.atendimentoId,
      dataAtendimento: registro.dataAtendimento,
      horario: registro.horario,
      clienteNome: registro.clienteNome,
      terapeutaNome: registro.terapeutaOrganizado || registro.profissionalNome || "Não identificado",
      servicoNome: registro.servicoNome,
      duracaoBelleMinutos: registro.duracaoBelleMinutos,
      chamadoEm: registro.chamadoEm,
      inicioEm: registro.inicioEm,
      fimEm: registro.fimEm,
    }))
    .filter((linha) => linha.terapeutaNome !== NOME_TERAPEUTA_CURINGA);
  return calcularRelatorioTempoAtendimento(linhas, dataInicio, dataFim);
}

export async function retirarProximoAtendimentoDaLista(unidadeId: number, atendimentoBelleId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existente = await db.select({ id: atendimentosOperacional.id }).from(atendimentosOperacional)
    .where(and(eq(atendimentosOperacional.unidadeId, unidadeId), eq(atendimentosOperacional.atendimentoBelleId, atendimentoBelleId)))
    .limit(1);
  const retirada = { removidoEm: new Date(), removidoPorUserId: userId };
  if (existente[0]) {
    await db.update(atendimentosOperacional).set(retirada).where(eq(atendimentosOperacional.id, existente[0].id));
  } else {
    await db.insert(atendimentosOperacional).values({ unidadeId, atendimentoBelleId, terapeutaNome: null, sala: null, preferencial: false, ...retirada });
  }
}

export async function obterPreenchimentoComanda(unidadeId: number, atendimentoBelleId: number) {
  const db = await getDb();
  if (!db) return null;
  const registros = await db.select({ aba: atendimentosOperacional.comandaAba, linha: atendimentosOperacional.comandaLinha, preenchidaEm: atendimentosOperacional.comandaPreenchidaEm })
    .from(atendimentosOperacional).where(and(eq(atendimentosOperacional.unidadeId, unidadeId), eq(atendimentosOperacional.atendimentoBelleId, atendimentoBelleId))).limit(1);
  return registros[0]?.preenchidaEm && registros[0].aba && registros[0].linha ? { aba: registros[0].aba, linha: registros[0].linha } : null;
}

export async function registrarPreenchimentoComanda(unidadeId: number, atendimentoBelleId: number, aba: string, linha: number) {
  const db = await getDb();
  if (!db) return;
  const existente = await db.select({ id: atendimentosOperacional.id }).from(atendimentosOperacional)
    .where(and(eq(atendimentosOperacional.unidadeId, unidadeId), eq(atendimentosOperacional.atendimentoBelleId, atendimentoBelleId))).limit(1);
  const dados = { comandaAba: aba, comandaLinha: linha, comandaPreenchidaEm: new Date() };
  if (existente[0]) await db.update(atendimentosOperacional).set(dados).where(eq(atendimentosOperacional.id, existente[0].id));
  else await db.insert(atendimentosOperacional).values({ unidadeId, atendimentoBelleId, preferencial: false, ...dados });
}

export async function listarBanhosImersaoHoje(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  const hojeBrt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return db.select({
    id: belleAtendimentos.id,
    clienteNome: belleAtendimentos.clienteNome,
    dataAtendimento: belleAtendimentos.dataAtendimento,
    horario: belleAtendimentos.horario,
    servicoNome: belleAtendimentos.servicoNome,
    terapeutaNome: atendimentosOperacional.terapeutaNome,
    sala: atendimentosOperacional.sala,
  }).from(belleAtendimentos)
    .leftJoin(atendimentosOperacional, and(
      eq(atendimentosOperacional.unidadeId, belleAtendimentos.unidadeId),
      eq(atendimentosOperacional.atendimentoBelleId, belleAtendimentos.id),
    ))
    .where(and(
      eq(belleAtendimentos.unidadeId, unidadeId),
      eq(belleAtendimentos.dataAtendimento, hojeBrt),
      inArray(belleAtendimentos.status, STATUS_ATENDIMENTO_AGENDADO),
      like(belleAtendimentos.servicoNome, "%Banho de Imers%"),
      isNull(atendimentosOperacional.removidoEm),
    ))
    .orderBy(asc(belleAtendimentos.horario));
}

async function obterResumoRelacionamentoInbox(unidadeId: number, clienteId: number) {
  const db = await getDb();
  if (!db) return { plano: null, ultimoAtendimento: null, proximoAtendimento: null };
  const hojeBrt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [planos, clienteLocal, ultimoAtendimentoVinculado, proximoAtendimentoVinculado] = await Promise.all([
    listarPlanosBellePorCliente(unidadeId, clienteId),
    db.select({ nome: clientes.nome, ultimoAtendimento: clientes.ultimoAtendimento }).from(clientes)
      .where(eq(clientes.id, clienteId))
      .limit(1),
    db.select({
      dataAtendimento: belleAtendimentos.dataAtendimento,
      horario: belleAtendimentos.horario,
      servicoNome: belleAtendimentos.servicoNome,
      profissionalNome: belleAtendimentos.profissionalNome,
    }).from(belleAtendimentos)
      .where(and(
        eq(belleAtendimentos.unidadeId, unidadeId),
        eq(belleAtendimentos.clienteId, clienteId),
        eq(belleAtendimentos.status, "Atendido"),
      ))
      .orderBy(desc(belleAtendimentos.dataAtendimento), desc(belleAtendimentos.horario))
      .limit(1),
    db.select({
      id: belleAtendimentos.id,
      dataAtendimento: belleAtendimentos.dataAtendimento,
      horario: belleAtendimentos.horario,
      servicoNome: belleAtendimentos.servicoNome,
      profissionalNome: belleAtendimentos.profissionalNome,
      status: belleAtendimentos.status,
    }).from(belleAtendimentos)
      .where(and(
        eq(belleAtendimentos.unidadeId, unidadeId),
        eq(belleAtendimentos.clienteId, clienteId),
        inArray(belleAtendimentos.status, STATUS_ATENDIMENTO_AGENDADO),
        gte(belleAtendimentos.dataAtendimento, hojeBrt),
      ))
      .orderBy(asc(belleAtendimentos.dataAtendimento), asc(belleAtendimentos.horario))
      .limit(1),
  ]);
  const cliente = clienteLocal[0];
  // Relatórios importados antes do vínculo por ID podem conter o atendimento
  // correto, mas sem clienteId. Usa o nome exato apenas como fallback dentro
  // da mesma unidade; o vínculo direto continua tendo prioridade.
  const ultimoAtendimentoPorNome = !ultimoAtendimentoVinculado[0] && cliente?.nome
    ? await db.select({
      dataAtendimento: belleAtendimentos.dataAtendimento,
      horario: belleAtendimentos.horario,
      servicoNome: belleAtendimentos.servicoNome,
      profissionalNome: belleAtendimentos.profissionalNome,
    }).from(belleAtendimentos)
      .where(and(
        eq(belleAtendimentos.unidadeId, unidadeId),
        eq(belleAtendimentos.clienteNome, cliente.nome),
        eq(belleAtendimentos.status, "Atendido"),
      ))
      .orderBy(desc(belleAtendimentos.dataAtendimento), desc(belleAtendimentos.horario))
      .limit(1)
    : [];
  const proximoAtendimentoPorNome = !proximoAtendimentoVinculado[0] && cliente?.nome
    ? await db.select({
      id: belleAtendimentos.id,
      dataAtendimento: belleAtendimentos.dataAtendimento,
      horario: belleAtendimentos.horario,
      servicoNome: belleAtendimentos.servicoNome,
      profissionalNome: belleAtendimentos.profissionalNome,
      status: belleAtendimentos.status,
    }).from(belleAtendimentos)
      .where(and(
        eq(belleAtendimentos.unidadeId, unidadeId),
        eq(belleAtendimentos.clienteNome, cliente.nome),
        inArray(belleAtendimentos.status, STATUS_ATENDIMENTO_AGENDADO),
        gte(belleAtendimentos.dataAtendimento, hojeBrt),
      ))
      .orderBy(asc(belleAtendimentos.dataAtendimento), asc(belleAtendimentos.horario))
      .limit(1)
    : [];
  const ultimoAtendimento = ultimoAtendimentoVinculado[0]
    ?? ultimoAtendimentoPorNome[0]
    ?? (cliente?.ultimoAtendimento
      ? { dataAtendimento: cliente.ultimoAtendimento, horario: null, servicoNome: null, profissionalNome: null }
      : null);
  const proximoAtendimento = proximoAtendimentoVinculado[0] ?? proximoAtendimentoPorNome[0] ?? null;
  return {
    plano: classificarPlanosRelacionamento(planos, hojeBrt),
    ultimoAtendimento,
    proximoAtendimento,
  };
}

/**
 * Conversas presas em @lid (isLidPendente="true") — nunca chegou uma
 * mensagem, em nenhuma direção, que revelasse o telefone real pro
 * mesmo lid (nem via resolveLid, nem via lid_mapping). Base da tela
 * "Tratamento de erros → LIDs não resolvidos" (2026-08-15), pra
 * identificação manual quando a automática não dá conta (ex.: cliente
 * lançado direto no Belle no balcão, nunca importado pro CRM).
 */
export async function listConversasLidPendente() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: inboxConversas.id,
    unidadeId: inboxConversas.unidadeId,
    unidadeNome: unidades.nome,
    nomeContato: inboxConversas.nomeContato,
    telefone: inboxConversas.telefone,
    chatLid: inboxConversas.chatLid,
    ultimaMensagemTexto: inboxConversas.ultimaMensagemTexto,
    ultimaMensagemEm: inboxConversas.ultimaMensagemEm,
    createdAt: inboxConversas.createdAt,
  }).from(inboxConversas)
    .leftJoin(unidades, eq(inboxConversas.unidadeId, unidades.id))
    .where(eq(inboxConversas.isLidPendente, "true"))
    .orderBy(desc(inboxConversas.ultimaMensagemEm));
}

export async function getInboxConversaById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(inboxConversas).where(eq(inboxConversas.id, id)).limit(1);
  const conversa = result[0];
  if (!conversa) return undefined;
  await resolverFotosUrlAssinadas([conversa]);

  // Linka com Clientes agora, se ainda não tinha (conversa criada antes
  // desse recurso, ou o match não bateu na hora da mensagem original).
  // 2+ candidatos (ex.: mãe e filha cadastradas com o mesmo celular no
  // Belle) não são um bug a "adivinhar" — não tem como saber quem
  // está mandando mensagem só pelo número. Em vez de ficar
  // permanentemente sem cliente vinculado, devolve os candidatos pro
  // painel do Inbox oferecer "vincular a X" com 1 clique.
  let candidatosCliente: ClienteCandidato[] = [];
  if (!conversa.clienteId && conversa.telefone) {
    const candidatos = candidatosConfiaveis(await buscarClientesPorTelefone(conversa.telefone, conversa.unidadeId ?? undefined));
    if (candidatos.length === 1) {
      const clienteId = candidatos[0].id;
      await db.update(inboxConversas).set({ clienteId }).where(and(eq(inboxConversas.id, id), isNull(inboxConversas.clienteId)));
      conversa.clienteId = clienteId;
    } else if (candidatos.length > 1) {
      candidatosCliente = candidatos;
    }
  }

  const clienteRows = conversa.clienteId
    ? await db.select({
        nome: clientes.nome,
        qtdServicosFinalizados: clientes.qtdServicosFinalizados,
        ultimoAtendimento: clientes.ultimoAtendimento,
      }).from(clientes).where(eq(clientes.id, conversa.clienteId)).limit(1)
    : [];
  const resumoRelacionamento = conversa.clienteId && typeof conversa.unidadeId === "number"
    ? await obterResumoRelacionamentoInbox(conversa.unidadeId, conversa.clienteId)
    : { plano: null, ultimoAtendimento: null, proximoAtendimento: null };
  return {
    ...conversa,
    automacaoAgentesEfetiva: obterModoEfetivoAutomacaoAgentes(conversa),
    clienteNome: clienteRows[0]?.nome,
    clienteQtdServicos: clienteRows[0]?.qtdServicosFinalizados,
    clienteUltimoAtendimento: clienteRows[0]?.ultimoAtendimento,
    resumoRelacionamento,
    candidatosCliente,
  };
}

/** Atualiza o modo de automação; a suspensão temporária expira em duas horas. */
export async function definirAutomacaoAgentesInboxConversa(id: number, modo: ModoAutomacaoAgentes) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const bloqueadaAte = modo === "bloqueada_temporariamente" ? new Date(Date.now() + DUAS_HORAS_MS) : null;
  const contextoAPartirDe = modo === "bloqueada_permanentemente" ? new Date() : null;
  await db.update(inboxConversas).set({
    automacaoAgentes: modo,
    automacaoAgentesBloqueadaAte: bloqueadaAte,
    ...(contextoAPartirDe ? { automacaoAgentesContextoAPartirDe: contextoAPartirDe } : {}),
  }).where(eq(inboxConversas.id, id));
  return { modo, bloqueadaAte, contextoAPartirDe };
}

/** "Vincular a este cliente" no painel do Inbox — resolve o caso de telefone compartilhado entre clientes distintos (ex.: mãe/filha) sem criar um cadastro duplicado nem adivinhar sozinho. */
export async function vincularClienteAConversa(conversaId: number, clienteId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const clienteRows = await db.select({ nome: clientes.nome }).from(clientes).where(eq(clientes.id, clienteId)).limit(1);
  await db.update(inboxConversas)
    .set({ clienteId, ...(clienteRows[0]?.nome ? { nomeContato: clienteRows[0].nome } : {}) })
    .where(eq(inboxConversas.id, conversaId));
}

export async function marcarInboxConversaLida(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxConversas).set({ naoLidas: 0 }).where(eq(inboxConversas.id, id));
}

/** Registra o primeiro consultor que abriu a conversa, sem substituir um responsável existente. */
export async function atribuirConsultorResponsavelInbox(conversaId: number, atendenteId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxConversas)
    .set({ atendenteResponsavelId: atendenteId })
    .where(and(eq(inboxConversas.id, conversaId), isNull(inboxConversas.atendenteResponsavelId)));
}

export async function atualizarNomeContatoInbox(id: number, nome: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxConversas).set({ nomeContato: nome }).where(eq(inboxConversas.id, id));
}

export async function alterarStatusInboxConversa(id: number, status: "aberta" | "encerrada") {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxConversas).set({ status }).where(eq(inboxConversas.id, id));
}

export async function excluirInboxConversa(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(inboxMensagens).where(eq(inboxMensagens.conversaId, id));
  await db.delete(inboxConversas).where(eq(inboxConversas.id, id));
}

export async function definirEtiquetasInbox(id: number, etiquetas: string[]) {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxConversas).set({ etiquetas: JSON.stringify(etiquetas) }).where(eq(inboxConversas.id, id));
}

/**
 * Acha o cliente (Belle) cujo celular/celular2/telefone bate com um
 * telefone de WhatsApp — mesma ideia do mobai-crm (Inbox deve puxar o
 * nome de Clientes, não ficar só com o que o WhatsApp manda). Só linka
 * em match exato e único: se mais de 1 cliente bater no mesmo número
 * (duplicata de cadastro, por ex.), não escolhe nenhum — certeza, não
 * achismo. `clientes` não tem unidadeId (cadastro é global, com flags
 * clienteSsu/clienteRbs). Quando a conversa identifica uma unidade,
 * considera apenas o cadastro ativo nessa unidade.
 */
export interface ClienteCandidato {
  id: number;
  nome: string;
}

type ClienteCandidatoComUnidade = ClienteCandidato & {
  clienteSsu: boolean;
  clienteRbs: boolean;
};

/** Mantém somente candidatos cadastrados na unidade da conversa atual. */
export function filtrarCandidatosPorUnidade(candidatos: ClienteCandidatoComUnidade[], unidadeId?: number): ClienteCandidatoComUnidade[] {
  if (unidadeId === 1) return candidatos.filter((candidato) => candidato.clienteSsu);
  if (unidadeId === 2) return candidatos.filter((candidato) => candidato.clienteRbs);
  return candidatos;
}

/**
 * Todos os clientes cujo telefone bate com o do WhatsApp, considerando
 * as variantes com/sem DDI e com/sem o 9 do celular (ver
 * variantesTelefone em shared/telefone.ts — cadastro antigo do Belle
 * às vezes não tem o 9, o WhatsApp sempre manda com). Base pra
 * vincular automaticamente (1 match só) e pra perguntar antes de
 * duplicar (2+ matches, ou 1 match com nome diferente do que a
 * recepção está tentando cadastrar).
 */
export type IdentidadeParticipanteGrupo = {
  tipo: "terapeuta" | "cliente" | "desconhecido";
  nome: string | null;
  terapeutaId: number | null;
  clienteId: number | null;
  telefone: string | null;
  participanteId: string | null;
};

/** Resolve participante de grupo pela identidade cadastrada, sem aceitar empate. */
export async function resolverIdentidadeParticipante(params: {
  unidadeId: number;
  telefone?: string | null;
  participanteId?: string | null;
  nomeWhatsapp?: string | null;
}): Promise<IdentidadeParticipanteGrupo> {
  const participanteId = params.participanteId?.trim() || (params.telefone?.trim().includes("@lid") ? params.telefone.trim() : null);
  const telefoneInformado = params.telefone?.trim() && !params.telefone.trim().includes("@lid") ? params.telefone.trim() : null;
  const telefone = telefoneInformado || (participanteId?.includes("@lid") ? await buscarTelefonePorLid(params.unidadeId, participanteId) : undefined) || null;
  const database = await getDb();
  const desconhecido = (): IdentidadeParticipanteGrupo => ({
    tipo: "desconhecido",
    nome: params.nomeWhatsapp?.trim() || null,
    terapeutaId: null,
    clienteId: null,
    telefone,
    participanteId,
  });
  if (!database) return desconhecido();

  const terapeutasDaUnidade = await database.select({
    id: terapeutas.id,
    nomeCompleto: terapeutas.nomeCompleto,
    nomeAbreviado: terapeutas.nomeAbreviado,
    celular: terapeutas.celular,
    whatsappParticipanteId: terapeutas.whatsappParticipanteId,
  }).from(terapeutas).where(eq(terapeutas.unidadeId, params.unidadeId));
  const terapeutasPorId = participanteId
    ? terapeutasDaUnidade.filter((item) => item.whatsappParticipanteId?.trim() === participanteId)
    : [];
  const terapeutasPorTelefone = telefone
    ? terapeutasDaUnidade.filter((item) => telefonesCorrespondem(item.celular, telefone))
    : [];
  const terapeutasEncontrados = terapeutasPorId.length > 0 ? terapeutasPorId : terapeutasPorTelefone;
  if (terapeutasEncontrados.length === 1) {
    const terapeuta = terapeutasEncontrados[0];
    return {
      tipo: "terapeuta",
      nome: terapeuta.nomeAbreviado || terapeuta.nomeCompleto,
      terapeutaId: terapeuta.id,
      clienteId: null,
      telefone,
      participanteId,
    };
  }
  if (terapeutasEncontrados.length > 1) return desconhecido();

  if (terapeutasEncontrados.length === 0 && params.nomeWhatsapp?.trim()) {
    const nome = params.nomeWhatsapp.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    const porNome = terapeutasDaUnidade.filter((item) => [item.nomeAbreviado, item.nomeCompleto]
      .some((valor) => valor.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR") === nome));
    if (porNome.length === 1) {
      const terapeuta = porNome[0];
      return {
        tipo: "terapeuta",
        nome: terapeuta.nomeAbreviado || terapeuta.nomeCompleto,
        terapeutaId: terapeuta.id,
        clienteId: null,
        telefone,
        participanteId,
      };
    }
  }

  if (telefone) {
    const clientesEncontrados = await buscarClientesPorTelefone(telefone, params.unidadeId);
    if (clientesEncontrados.length === 1) {
      return {
        tipo: "cliente",
        nome: clientesEncontrados[0].nome,
        terapeutaId: null,
        clienteId: clientesEncontrados[0].id,
        telefone,
        participanteId,
      };
    }
  }
  return desconhecido();
}

export async function buscarClientesPorTelefone(telefoneWhatsapp: string, unidadeId?: number): Promise<ClienteCandidato[]> {
  const db = await getDb();
  if (!db) return [];
  const variantes = variantesTelefone(telefoneWhatsapp).filter((v) => v.length >= 8);
  if (variantes.length === 0) return [];
  const normalizar = (coluna: any) => sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${coluna}, '+', ''), '-', ''), ' ', ''), '(', ''), ')', ''), '.', '')`;
  const colunas = [clientes.celular, clientes.celular2, clientes.telefone];
  const condicoes = colunas.flatMap((coluna) => variantes.map((v) => sql`${normalizar(coluna)} = ${v}`));
  const resultado = await db.select({
    id: clientes.id,
    nome: clientes.nome,
    clienteSsu: clientes.clienteSsu,
    clienteRbs: clientes.clienteRbs,
  }).from(clientes).where(or(...condicoes));
  const vistos = new Map<number, ClienteCandidatoComUnidade>();
  for (const r of resultado) {
    const existente = vistos.get(r.id);
    if (existente) {
      existente.clienteSsu ||= r.clienteSsu;
      existente.clienteRbs ||= r.clienteRbs;
    } else {
      vistos.set(r.id, { id: r.id, nome: r.nome, clienteSsu: r.clienteSsu, clienteRbs: r.clienteRbs });
    }
  }
  return filtrarCandidatosPorUnidade(Array.from(vistos.values()), unidadeId).map(({ id, nome }) => ({ id, nome }));
}

export async function buscarClienteIdPorTelefone(telefoneWhatsapp: string): Promise<number | undefined> {
  const candidatos = await buscarClientesPorTelefone(telefoneWhatsapp);
  return candidatos.length === 1 ? candidatos[0].id : undefined;
}

/**
 * Acima desse limite o número quase certamente não é de uso pessoal —
 * é o fixo da recepção, usado como valor de preenchimento quando o
 * cliente não quis informar o celular (confirmado com o usuário
 * 2026-08-15: reindex achou números com 19 e 93 clientes distintos,
 * ambos eram exatamente isso). Listar dezenas de "vincular a X" não
 * ajuda ninguém — acima do limite trata como se não houvesse match
 * confiável, igual a 0 candidatos.
 */
const LIMITE_CANDIDATOS_TELEFONE_COMPARTILHADO = 10;

function candidatosConfiaveis(candidatos: ClienteCandidato[]): ClienteCandidato[] {
  return candidatos.length <= LIMITE_CANDIDATOS_TELEFONE_COMPARTILHADO ? candidatos : [];
}

/**
 * Linhas do índice cliente_telefones (drizzle/schema.ts) pra um cliente,
 * a partir dos 3 campos de telefone do cadastro — dedup por número
 * canônico (celular/celular2/telefone iguais viram 1 linha só, mantém
 * a origem do primeiro campo preenchido).
 */
function telefonesParaIndexar(
  clienteId: number,
  dados: { celular?: string | null; celular2?: string | null; telefone?: string | null },
): InsertClienteTelefone[] {
  const vistos = new Set<string>();
  const linhas: InsertClienteTelefone[] = [];
  const campos: Array<["celular" | "celular2" | "telefone", string | null | undefined]> = [
    ["celular", dados.celular],
    ["celular2", dados.celular2],
    ["telefone", dados.telefone],
  ];
  for (const [origem, valor] of campos) {
    const canonico = telefoneCanonico(valor);
    if (!canonico || vistos.has(canonico)) continue;
    vistos.add(canonico);
    linhas.push({ clienteId, numeroCanonico: canonico, origem });
  }
  return linhas;
}

/**
 * Sincroniza o índice cliente_telefones pra 1 cliente (create/update
 * fora do import em massa — ex.: lead criado pelo Inbox). Sempre
 * substitui tudo (delete + insert) — volume por cliente é no máximo 3
 * linhas, sem custo de performance real.
 */
export async function syncClienteTelefones(
  clienteId: number,
  dados: { celular?: string | null; celular2?: string | null; telefone?: string | null },
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const linhas = telefonesParaIndexar(clienteId, dados);
  await db.delete(clienteTelefones).where(eq(clienteTelefones.clienteId, clienteId));
  if (linhas.length > 0) await db.insert(clienteTelefones).values(linhas);
}

/**
 * Telefones canônicos únicos de todos os clientes de uma unidade
 * (clienteSsu/clienteRbs conforme o slug) — base pra resolução em lote
 * de lid via zapiApi.phoneExistsBatch (orquestrado em routers.ts, não
 * aqui — este arquivo fica só com acesso a dado).
 */
export async function listTelefonesCanonicosDaUnidade(unidadeSlug: string): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const ehRbs = unidadeSlug.includes("ribeirao") || unidadeSlug.includes("rbs");
  const clientesDaUnidade = await db.select({ id: clientes.id }).from(clientes)
    .where(ehRbs ? eq(clientes.clienteRbs, true) : eq(clientes.clienteSsu, true));
  const clienteIds = clientesDaUnidade.map((c) => c.id);
  if (clienteIds.length === 0) return [];
  const telefonesRows = await db.select({ numeroCanonico: clienteTelefones.numeroCanonico })
    .from(clienteTelefones)
    .where(inArray(clienteTelefones.clienteId, clienteIds));
  return Array.from(new Set(telefonesRows.map((r) => r.numeroCanonico)));
}

/** Upsert em lote pro mapeamento telefone→lid (ver drizzle/schema.ts:lidMapping). */
export async function upsertLidMapping(linhas: InsertLidMapping[]): Promise<void> {
  if (linhas.length === 0) return;
  const db = await getDb();
  if (!db) return;
  for (let i = 0; i < linhas.length; i += 500) {
    await db.insert(lidMapping).values(linhas.slice(i, i + 500))
      .onDuplicateKeyUpdate({ set: { lid: sql`VALUES(lid)`, resolvedAt: sql`VALUES(resolvedAt)` } });
  }
}

/**
 * Lookup reverso lid→telefone, usado no webhook Z-API quando o
 * telefone chega mascarado como @lid e o mapeamento proativo (botão
 * admin "Resolver LIDs") já tiver resolvido esse contato antes.
 */
/**
 * Atualiza o tick de entrega (estilo WhatsApp) das mensagens enviadas,
 * casando por zapiMessageId — chamado pelo webhook Z-API ao receber um
 * MessageStatusCallback (RECEIVED→"entregue", READ→"lida"). "Nunca
 * regride": se a mensagem já está "lida", um RECEIVED atrasado (fora de
 * ordem) não pode voltar pra "entregue".
 */
export async function atualizarStatusEntregaMensagens(zapiMessageIds: string[], novoStatus: "entregue" | "lida"): Promise<void> {
  if (zapiMessageIds.length === 0) return;
  const db = await getDb();
  if (!db) return;
  const condicoes = [inArray(inboxMensagens.zapiMessageId, zapiMessageIds)];
  if (novoStatus === "entregue") {
    condicoes.push(ne(inboxMensagens.statusEntrega, "lida"));
  }
  await db.update(inboxMensagens).set({ statusEntrega: novoStatus }).where(and(...condicoes));
}

export async function buscarTelefonePorLid(unidadeId: number, lid: string): Promise<string | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select({ telefoneCanonico: lidMapping.telefoneCanonico }).from(lidMapping)
    .where(and(eq(lidMapping.unidadeId, unidadeId), eq(lidMapping.lid, lid))).limit(1);
  return rows[0]?.telefoneCanonico;
}

/**
 * Busca a conversa por (telefone, canal) — se não achar, cria. Usada pelo
 * webhook de entrada e ao iniciar uma conversa manualmente.
 */
export async function upsertInboxConversa(params: {
  unidadeId: number | null;
  canal: "zapi" | "buddha_mkt";
  telefone: string;
  chatLid?: string;
  isLidPendente?: boolean;
  isGrupo?: boolean;
  nomeContato?: string;
  fotoUrl?: string;
  ultimaMensagemTexto: string;
  incrementarNaoLidas?: boolean;
  clienteId?: number;
}) {
  const db = await getDb();
  if (!db) return undefined;

  // Busca primeiro pelo chatLid (se veio) — evita criar uma segunda
  // conversa quando essa pessoa já tem uma conversa presa num @lid não
  // resolvido de uma mensagem anterior (resolveLid pode falhar de forma
  // intermitente). Só cai pro lookup por telefone se não achar por lid.
  let existente = params.chatLid
    ? await db.select().from(inboxConversas)
        .where(and(eq(inboxConversas.chatLid, params.chatLid), eq(inboxConversas.canal, params.canal)))
        .limit(1)
    : [];
  if (!existente[0]) {
    existente = await db.select().from(inboxConversas)
      .where(and(eq(inboxConversas.telefone, params.telefone), eq(inboxConversas.canal, params.canal)))
      .limit(1);
  }
  // Terceira tentativa, pelo telefone NORMALIZADO — a Z-API às vezes
  // manda o mesmo contato com grafias diferentes de telefone (com/sem
  // "55" do país, por exemplo quando um @lid é resolvido numa mensagem
  // posterior), e o match exato acima cria uma segunda conversa pra
  // quem já tinha uma (caso real 2026-09-02: "16981372000" depois
  // "5516981372000", mesmo cliente, telefoneNormalizado idêntico).
  if (!existente[0]) {
    const canonico = telefoneCanonico(params.telefone);
    if (canonico) {
      existente = await db.select().from(inboxConversas)
        .where(and(eq(inboxConversas.telefoneNormalizado, canonico), eq(inboxConversas.canal, params.canal)))
        .limit(1);
    }
  }

  const agora = new Date();

  if (existente[0]) {
    const naoLidas = params.incrementarNaoLidas ? existente[0].naoLidas + 1 : existente[0].naoLidas;
    // Nunca regride: uma vez que o @lid foi resolvido pro número real
    // (isLidPendente vira "false"), uma falha pontual de resolução numa
    // mensagem posterior não pode voltar a marcar como pendente nem
    // trocar o telefone de volta pro lid bruto.
    const jaResolvido = existente[0].isLidPendente === "false";
    const devePromoverTelefone = params.isLidPendente === false && params.telefone !== existente[0].telefone;
    // Só considera "já tem foto" quando é um link do nosso storage — link
    // externo do WhatsApp (pps.whatsapp.net) expira e passa a responder
    // 403, então uma conversa presa com esse link antigo deve poder
    // receber a foto nova (já baixada e armazenada) na próxima mensagem.
    const hasFoto = !!existente[0].fotoUrl && existente[0].fotoUrl.startsWith("/manus-storage/");
    // isGrupo não entra no update de propósito — uma conversa não muda
    // de tipo depois de criada, só é decidido na primeira mensagem.
    await db.update(inboxConversas).set({
      telefone: devePromoverTelefone ? params.telefone : existente[0].telefone,
      nomeContato: params.nomeContato ?? existente[0].nomeContato,
      fotoUrl: (params.fotoUrl && !hasFoto) ? params.fotoUrl : existente[0].fotoUrl,
      chatLid: params.chatLid ?? existente[0].chatLid,
      clienteId: existente[0].clienteId ?? params.clienteId,
      isLidPendente: jaResolvido
        ? "false"
        : (params.isLidPendente !== undefined ? (params.isLidPendente ? "true" : "false") : existente[0].isLidPendente),
      ultimaMensagemEm: agora,
      ultimaMensagemTexto: params.ultimaMensagemTexto,
      naoLidas,
      status: "aberta",
    }).where(eq(inboxConversas.id, existente[0].id));
    return existente[0].id;
  }

  const insertValues: InsertInboxConversa = {
    unidadeId: params.unidadeId,
    canal: params.canal,
    telefone: params.telefone,
    telefoneNormalizado: telefoneCanonico(params.telefone),
    chatLid: params.chatLid,
    isLidPendente: params.isLidPendente ? "true" : "false",
    isGrupo: params.isGrupo ? "true" : "false",
    nomeContato: params.nomeContato,
    fotoUrl: params.fotoUrl,
    clienteId: params.clienteId,
    ultimaMensagemEm: agora,
    ultimaMensagemTexto: params.ultimaMensagemTexto,
    naoLidas: params.incrementarNaoLidas ? 1 : 0,
  };
  const result = await db.insert(inboxConversas).values(insertValues).$returningId();
  return result[0]?.id;
}

// ===== Chamados de terapeuta =====
export async function listChamadosParametros(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(chamadosParametros)
    .where(and(eq(chamadosParametros.unidadeId, unidadeId), eq(chamadosParametros.ativo, true)))
    .orderBy(asc(chamadosParametros.tipo), asc(chamadosParametros.ordem), asc(chamadosParametros.nome));
}

export async function listChamadosParametrosAdmin(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(chamadosParametros)
    .where(eq(chamadosParametros.unidadeId, unidadeId))
    .orderBy(asc(chamadosParametros.tipo), asc(chamadosParametros.ordem), asc(chamadosParametros.nome));
}

export async function listTerapeutasAtivos(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: terapeutas.id, nomeCompleto: terapeutas.nomeCompleto, nomeAbreviado: terapeutas.nomeAbreviado, nivel: terapeutas.nivel })
    .from(terapeutas)
    .where(and(eq(terapeutas.unidadeId, unidadeId), eq(terapeutas.ativo, true)))
    .orderBy(asc(terapeutas.nomeAbreviado));
}

/** Um cliente pode ter mais de um terapeuta preferido na mesma unidade — ver schema.ts. */
export async function listClientePreferenciasTerapeuta(clienteId: number, unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clientesPreferenciasTerapeuta)
    .where(and(eq(clientesPreferenciasTerapeuta.clienteId, clienteId), eq(clientesPreferenciasTerapeuta.unidadeId, unidadeId)))
    .orderBy(clientesPreferenciasTerapeuta.terapeutaNome);
}

export async function adicionarClientePreferenciaTerapeuta(dados: {
  clienteId: number; unidadeId: number; terapeutaId: number; terapeutaNome: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.insert(clientesPreferenciasTerapeuta).values({
    clienteId: dados.clienteId,
    unidadeId: dados.unidadeId,
    terapeutaId: dados.terapeutaId,
    terapeutaNome: dados.terapeutaNome.trim(),
  }).onDuplicateKeyUpdate({ set: {
    terapeutaNome: dados.terapeutaNome.trim(),
    updatedAt: new Date(),
  } });
}

export async function removerClientePreferenciaTerapeuta(clienteId: number, unidadeId: number, terapeutaId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(clientesPreferenciasTerapeuta).where(and(
    eq(clientesPreferenciasTerapeuta.clienteId, clienteId),
    eq(clientesPreferenciasTerapeuta.unidadeId, unidadeId),
    eq(clientesPreferenciasTerapeuta.terapeutaId, terapeutaId),
  ));
}

export async function criarChamadoParametro(dados: InsertChamadoParametro) {
  const db = await getDb();
  if (!db) return null;
  const resultado = await db.insert(chamadosParametros).values(dados).$returningId();
  return resultado[0]?.id ?? null;
}

export async function atualizarChamadoParametro(id: number, dados: Partial<Pick<InsertChamadoParametro, "nome" | "descricao" | "ordem" | "ativo">>) {
  const db = await getDb();
  if (!db) return;
  await db.update(chamadosParametros).set(dados).where(eq(chamadosParametros.id, id));
}

/**
 * Localiza ou cria uma conversa Z-API para um cliente da base local.
 * A busca normaliza DDI e formatação para evitar duplicatas quando o
 * cadastro usa telefone formatado e o WhatsApp usa apenas dígitos.
 */
async function abrirOuCriarInboxPorTelefone(database: any, params: { telefoneOrigem: string | null | undefined; unidadeId: number; clienteId: number | null; nomeContato: string }) {
  const telefone = normalizarTelefone(params.telefoneOrigem);
  if (telefone.length < 8) throw new Error("Telefone inválido ou ausente para abrir o Inbox");

  // Mesmas variantes usadas em buscarClientesPorTelefone — sem isso,
  // cadastro em formato antigo (10 dígitos, sem o "9") não batia com o
  // WhatsApp (11 dígitos, com "9") e ficava sempre criando conversa nova.
  const variantes = variantesTelefone(telefone).filter((v) => v.length >= 8);
  const normalizar = (coluna: any) => sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${coluna}, '+', ''), '-', ''), ' ', ''), '(', ''), ')', ''), '.', '')`;
  const telefoneCondicao = or(...variantes.map((v) => sql`${normalizar(inboxConversas.telefone)} = ${v}`));
  const existente = await database.select({ id: inboxConversas.id }).from(inboxConversas)
    .where(and(
      eq(inboxConversas.canal, "zapi"),
      or(eq(inboxConversas.unidadeId, params.unidadeId), isNull(inboxConversas.unidadeId)),
      telefoneCondicao,
    ))
    .orderBy(desc(inboxConversas.ultimaMensagemEm))
    .limit(1);

  if (existente[0]) {
    if (params.clienteId) {
      await database.update(inboxConversas).set({
        clienteId: params.clienteId,
        nomeContato: params.nomeContato,
      }).where(eq(inboxConversas.id, existente[0].id));
    }
    return existente[0].id;
  }

  const insertValues: InsertInboxConversa = {
    unidadeId: params.unidadeId,
    canal: "zapi",
    telefone,
    telefoneNormalizado: telefoneCanonico(telefone),
    chatLid: null,
    isLidPendente: "false",
    nomeContato: params.nomeContato,
    clienteId: params.clienteId,
    ultimaMensagemEm: new Date(),
    ultimaMensagemTexto: "",
    naoLidas: 0,
  };
  const result = await database.insert(inboxConversas).values(insertValues).$returningId();
  return result[0]?.id;
}

export async function abrirInboxPorCliente(params: { clienteId: number; unidadeId: number }, databaseOverride?: any) {
  const database = databaseOverride ?? await getDb();
  if (!database) return undefined;

  const clienteRows = await database.select({
    id: clientes.id,
    nome: clientes.nome,
    celular: clientes.celular,
    celular2: clientes.celular2,
    telefone: clientes.telefone,
  }).from(clientes).where(eq(clientes.id, params.clienteId)).limit(1);
  const cliente = clienteRows[0];
  if (!cliente) throw new Error("Cliente não encontrado");

  const telefoneOrigem = cliente.celular ?? cliente.celular2 ?? cliente.telefone;
  return abrirOuCriarInboxPorTelefone(database, {
    telefoneOrigem,
    unidadeId: params.unidadeId,
    clienteId: cliente.id,
    nomeContato: cliente.nome,
  });
}

/**
 * Mesma lógica de abrirInboxPorCliente, mas a partir de um telefone já em
 * mãos (ex.: belle_atendimentos.telefone em Próximos Atendimentos) —
 * usado quando ainda não há (ou não é necessário) um clienteId vinculado.
 */
export async function abrirInboxPorTelefone(params: { telefone: string | null | undefined; unidadeId: number; clienteId?: number | null; nomeContato: string }) {
  const database = await getDb();
  if (!database) return undefined;
  return abrirOuCriarInboxPorTelefone(database, {
    telefoneOrigem: params.telefone,
    unidadeId: params.unidadeId,
    clienteId: params.clienteId ?? null,
    nomeContato: params.nomeContato,
  });
}

/**
 * Junta uma conversa "@lid" (número real desconhecido) a uma conversa já
 * identificada pelo telefone real — move as mensagens e apaga a duplicata.
 * Uso manual, quando o número aparece depois por outro canal/atendimento.
 */
export async function unificarInboxConversas(idLid: number, idReal: number) {
  const db = await getDb();
  if (!db) return;
  // Salva o chatLid da conversa que vai ser apagada na que sobra — sem
  // isso, a próxima mensagem da mesma pessoa (se a resolução automática
  // falhar de novo) não acha a conversa real pelo lookup de chatLid e
  // cria uma duplicata nova, obrigando a unificar de novo pra sempre.
  const lidConversa = await db.select({ chatLid: inboxConversas.chatLid }).from(inboxConversas)
    .where(eq(inboxConversas.id, idLid)).limit(1);
  if (lidConversa[0]?.chatLid) {
    await db.update(inboxConversas).set({ chatLid: lidConversa[0].chatLid })
      .where(and(eq(inboxConversas.id, idReal), isNull(inboxConversas.chatLid)));
  }
  await db.update(inboxMensagens).set({ conversaId: idReal }).where(eq(inboxMensagens.conversaId, idLid));
  await db.delete(inboxConversas).where(eq(inboxConversas.id, idLid));
}

/**
 * `clientes.belleId` é NOT NULL UNIQUE — é a chave de sincronização com
 * o Belle Software, então nunca dá pra inserir um cliente sem um valor.
 * Clientes criados manualmente pelo Inbox (recepção/consultor) recebem
 * um belleId sintético NEGATIVO — o Belle nunca usa números negativos,
 * então nunca colide com um id real, e fica fácil identificar depois
 * "este cliente ainda não veio do Belle" (belleId < 0) se precisar.
 */
function gerarBelleIdSintetico(): number {
  return -(Date.now() * 1000 + Math.floor(Math.random() * 1000));
}

async function criarClienteManual(nome: string, telefoneDigitos: string, unidadeId?: number): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  let clienteSsu = false;
  let clienteRbs = false;
  if (unidadeId) {
    const unidade = await getUnidadeById(unidadeId);
    const ehRbs = unidade?.slug.includes("ribeirao") || unidade?.slug.includes("rbs");
    if (ehRbs) clienteRbs = true;
    else if (unidade) clienteSsu = true;
  }
  const insertValues: InsertCliente = {
    belleId: gerarBelleIdSintetico(),
    nome,
    celular: telefoneDigitos,
    tipoCliente: "lead",
    clienteSsu,
    clienteRbs,
  };
  const result = await db.insert(clientes).values(insertValues).$returningId();
  const clienteId = result[0]?.id;
  if (clienteId) await syncClienteTelefones(clienteId, { celular: telefoneDigitos });
  return clienteId;
}

/**
 * Compara dois nomes de forma tolerante (recepção às vezes digita
 * apelido/nome curto, o cadastro do Belle tem o nome completo) — só
 * pra decidir se um match de telefone é "claramente a mesma pessoa"
 * (vincula direto, sem perguntar) ou "duvidoso" (pergunta antes de
 * criar um 2º cliente com o mesmo celular).
 */
function provavelmenteMesmaPessoa(nomeA: string, nomeB: string): boolean {
  const a = nomeA.trim().toLowerCase();
  const b = nomeB.trim().toLowerCase();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

export type ResultadoCriarCliente =
  | { status: "ok"; clienteId: number }
  | { status: "conflito"; candidatos: ClienteCandidato[] };

/**
 * Botão "+" ao lado de Atualizar no Inbox — recepção cria cliente +
 * conversa sem precisar de mensagem prévia (ex.: cliente chegou no
 * balcão e pediu pra mandar a tabela de preços). Se já existir cliente
 * ou conversa pra esse telefone, reaproveita em vez de duplicar — e,
 * se a conversa já existir com mensagens, NÃO mexe em
 * ultimaMensagemTexto/ultimaMensagemEm (só linka clienteId/nome), pra
 * não apagar o histórico de preview por engano.
 *
 * `forcarDuplicata`: quando true, ignora o achado de telefone já
 * cadastrado e cria mesmo assim — só usado depois que a recepção
 * confirma explicitamente na tela ("tem certeza que quer usar o mesmo
 * número pra dois clientes distintos?").
 */
export async function iniciarConversaComCliente(params: {
  unidadeId: number;
  nome: string;
  telefone: string;
  forcarDuplicata?: boolean;
}): Promise<{ status: "ok"; conversaId: number; clienteId: number } | { status: "conflito"; candidatos: ClienteCandidato[] }> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const digitos = params.telefone.replace(/\D/g, "");
  const telefoneNormalizado = digitos.startsWith("55") ? digitos : `55${digitos}`;

  let clienteId: number | undefined;
  let clienteCriadoAgora = false;
  if (!params.forcarDuplicata) {
    const candidatos = candidatosConfiaveis(await buscarClientesPorTelefone(telefoneNormalizado, params.unidadeId));
    if (candidatos.length === 1 && provavelmenteMesmaPessoa(candidatos[0].nome, params.nome)) {
      clienteId = candidatos[0].id;
    } else if (candidatos.length > 0) {
      return { status: "conflito", candidatos };
    }
  }
  if (!clienteId) {
    clienteId = await criarClienteManual(params.nome, telefoneNormalizado, params.unidadeId);
    clienteCriadoAgora = true;
  }
  if (!clienteId) throw new Error("Falha ao criar cliente");

  const existente = await db.select({
    id: inboxConversas.id,
    clienteId: inboxConversas.clienteId,
    nomeContato: inboxConversas.nomeContato,
  }).from(inboxConversas)
    .where(and(eq(inboxConversas.telefone, telefoneNormalizado), eq(inboxConversas.canal, "zapi")))
    .limit(1);

  if (existente[0]) {
    await db.update(inboxConversas).set({
      clienteId: existente[0].clienteId ?? clienteId,
      nomeContato: existente[0].nomeContato ?? params.nome,
    }).where(eq(inboxConversas.id, existente[0].id));
    if (clienteCriadoAgora) dispararGatilhoClienteNovo(params.unidadeId, existente[0].id, clienteId);
    return { status: "ok", conversaId: existente[0].id, clienteId };
  }

  const result = await db.insert(inboxConversas).values({
    unidadeId: params.unidadeId,
    canal: "zapi",
    telefone: telefoneNormalizado,
    telefoneNormalizado: telefoneCanonico(telefoneNormalizado),
    nomeContato: params.nome,
    clienteId,
    isLidPendente: "false",
    ultimaMensagemEm: new Date(),
    ultimaMensagemTexto: "",
    naoLidas: 0,
  }).$returningId();
  const conversaId = result[0]?.id;
  if (!conversaId) throw new Error("Falha ao criar conversa");
  if (clienteCriadoAgora) dispararGatilhoClienteNovo(params.unidadeId, conversaId, clienteId);
  return { status: "ok", conversaId, clienteId };
}

/**
 * Best-effort, nunca bloqueia o fluxo de criação de cliente que
 * disparou — ver server/fluxosGatilhos.ts. Import dinâmico evita ciclo
 * (fluxosGatilhos.ts também importa de db.ts).
 */
function dispararGatilhoClienteNovo(unidadeId: number, conversaId: number, clienteId: number): void {
  import("./fluxosGatilhos")
    .then(({ dispararGatilhosFluxo }) => dispararGatilhosFluxo(unidadeId, "cliente_novo", { conversaId, clienteId }))
    .catch((e) => console.error("[Fluxos] Erro ao disparar gatilho cliente_novo:", e));
}

/**
 * Card "Criar cliente no CRM" no painel direito — conversa já ativa,
 * mas o telefone não bate com nenhum cliente Belle. O consultor edita
 * o nome (que pode vir como apelido/emoji do perfil do WhatsApp) e
 * confirma. Se a conversa já tiver clienteId (corrida rara com o
 * webhook linkando entre o carregamento da tela e o clique), só
 * atualiza o nome em vez de criar um segundo cliente.
 *
 * Antes de criar, checa se esse telefone já pertence a algum cliente
 * (considerando as variantes de 9-dígito) — match único com nome
 * parecido vincula direto; qualquer outro caso (0 significa cliente
 * novo de verdade, 2+ ou nome muito diferente) só cria de fato com
 * `forcarDuplicata: true`, depois que a recepção confirma na tela.
 */
export async function criarClienteRapidoDeConversa(
  conversaId: number,
  nome: string,
  forcarDuplicata: boolean = false,
): Promise<ResultadoCriarCliente> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const rows = await db.select({
    id: inboxConversas.id,
    telefone: inboxConversas.telefone,
    clienteId: inboxConversas.clienteId,
    unidadeId: inboxConversas.unidadeId,
  }).from(inboxConversas).where(eq(inboxConversas.id, conversaId)).limit(1);
  const conversa = rows[0];
  if (!conversa) throw new Error("Conversa não encontrada");

  if (conversa.clienteId) {
    await db.update(clientes).set({ nome }).where(eq(clientes.id, conversa.clienteId));
    await db.update(inboxConversas).set({ nomeContato: nome }).where(eq(inboxConversas.id, conversaId));
    return { status: "ok", clienteId: conversa.clienteId };
  }

  let clienteId: number | undefined;
  let clienteCriadoAgora = false;
  if (!forcarDuplicata) {
    const candidatos = candidatosConfiaveis(await buscarClientesPorTelefone(conversa.telefone, conversa.unidadeId ?? undefined));
    if (candidatos.length === 1 && provavelmenteMesmaPessoa(candidatos[0].nome, nome)) {
      clienteId = candidatos[0].id;
    } else if (candidatos.length > 0) {
      return { status: "conflito", candidatos };
    }
  }
  if (!clienteId) {
    clienteId = await criarClienteManual(nome, conversa.telefone.replace(/\D/g, ""), conversa.unidadeId ?? undefined);
    clienteCriadoAgora = true;
  }
  if (!clienteId) throw new Error("Falha ao criar cliente");
  await db.update(inboxConversas).set({ clienteId, nomeContato: nome }).where(eq(inboxConversas.id, conversaId));
  if (clienteCriadoAgora && conversa.unidadeId) dispararGatilhoClienteNovo(conversa.unidadeId, conversaId, clienteId);
  return { status: "ok", clienteId };
}

/**
 * Join com atendentes só pra resolver o nome de quem realmente enviou
 * (enviadaPorAtendenteId) — enviadaPorUserId continua sendo a conta
 * Google/Manus compartilhada, não é isso que a UI mostra no balão.
 */
export type MembroGrupoResolvido = {
  telefone: string;
  telefoneMencao: string | null;
  participanteId: string | null;
  nome: string | null;
  tipo: "terapeuta" | "cliente" | "desconhecido";
  identidadeCadastrada: boolean;
  isAdmin: boolean;
};

export async function resolverMembrosGrupo(
  unidadeId: number,
  participantes: Array<{ phone: string; isAdmin: boolean; isSuperAdmin: boolean; name?: string; short?: string; participanteId?: string }>,
  nomesConhecidos: Map<string, string>,
): Promise<MembroGrupoResolvido[]> {
  return Promise.all(participantes.map(async (participante) => {
    const identidade = await resolverIdentidadeParticipante({
      unidadeId,
      telefone: participante.phone,
      participanteId: participante.participanteId,
      nomeWhatsapp: participante.name || participante.short || nomesConhecidos.get(participante.phone) || null,
    });
    return {
      telefone: participante.phone,
      telefoneMencao: identidade.telefone,
      participanteId: identidade.participanteId || participante.participanteId || null,
      nome: identidade.nome || participante.name || participante.short || nomesConhecidos.get(participante.phone) || null,
      tipo: identidade.tipo,
      identidadeCadastrada: identidade.tipo !== "desconhecido",
      isAdmin: participante.isAdmin || participante.isSuperAdmin,
    };
  }));
}

export async function listInboxMensagens(conversaId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  const mensagens = await db.select({
    id: inboxMensagens.id,
    conversaId: inboxMensagens.conversaId,
    direcao: inboxMensagens.direcao,
    tipo: inboxMensagens.tipo,
    conteudo: inboxMensagens.conteudo,
    metadados: inboxMensagens.metadados,
    transcricao: inboxMensagens.transcricao,
    enviadaPorUserId: inboxMensagens.enviadaPorUserId,
    enviadaPorAtendenteId: inboxMensagens.enviadaPorAtendenteId,
    enviadaPorAtendenteNome: atendentes.nome,
    participanteTelefone: inboxMensagens.participanteTelefone,
    participanteLid: inboxMensagens.participanteLid,
    participanteNome: inboxMensagens.participanteNome,
    lida: inboxMensagens.lida,
    statusEntrega: inboxMensagens.statusEntrega,
    reacaoEmoji: inboxMensagens.reacaoEmoji,
    zapiMessageId: inboxMensagens.zapiMessageId,
    createdAt: inboxMensagens.createdAt,
  })
    .from(inboxMensagens)
    .leftJoin(atendentes, eq(inboxMensagens.enviadaPorAtendenteId, atendentes.id))
    .where(eq(inboxMensagens.conversaId, conversaId))
    .orderBy(desc(inboxMensagens.createdAt))
    .limit(limit);
  return mensagens.reverse();
}

/** Histórico do Inbox: abre leve com seis dias e busca páginas anteriores somente sob demanda. */
const COLUNAS_INBOX_MENSAGEM = {
  id: inboxMensagens.id,
  conversaId: inboxMensagens.conversaId,
  direcao: inboxMensagens.direcao,
  tipo: inboxMensagens.tipo,
  conteudo: inboxMensagens.conteudo,
  metadados: inboxMensagens.metadados,
  transcricao: inboxMensagens.transcricao,
  enviadaPorUserId: inboxMensagens.enviadaPorUserId,
  enviadaPorAtendenteId: inboxMensagens.enviadaPorAtendenteId,
  enviadaPorAtendenteNome: atendentes.nome,
  participanteTelefone: inboxMensagens.participanteTelefone,
  participanteLid: inboxMensagens.participanteLid,
  participanteNome: inboxMensagens.participanteNome,
  lida: inboxMensagens.lida,
  statusEntrega: inboxMensagens.statusEntrega,
  reacaoEmoji: inboxMensagens.reacaoEmoji,
  zapiMessageId: inboxMensagens.zapiMessageId,
  createdAt: inboxMensagens.createdAt,
};

/**
 * "O que chegou desde X" — complementa listInboxMensagensPaginada (que
 * é sempre "as N mais recentes", sem cursor pra frente). Sem isso, o
 * poll da tela reconsultava "top N" a cada 8s; numa conversa ativa, uma
 * mensagem podia sair dessa janela de N antes do "carregar mais
 * antigas" ter puxado ela pro lado antigo, sumindo da tela (2026-09-02
 * — inaceitável: mensagem nunca pode sumir). Busca aditiva (createdAt
 * > desde, ordem crescente) nunca solta uma mensagem já mostrada.
 */
export async function listInboxMensagensDesde(params: { conversaId: number; desde: Date }) {
  const db = await getDb();
  if (!db) return { mensagens: [] };
  const LIMITE_DEFENSIVO = 200;
  const linhas = await db.select(COLUNAS_INBOX_MENSAGEM)
    .from(inboxMensagens)
    .leftJoin(atendentes, eq(inboxMensagens.enviadaPorAtendenteId, atendentes.id))
    .where(and(eq(inboxMensagens.conversaId, params.conversaId), gt(inboxMensagens.createdAt, params.desde)))
    .orderBy(asc(inboxMensagens.createdAt))
    .limit(LIMITE_DEFENSIVO);
  return { mensagens: linhas };
}

export async function listInboxMensagensPaginada(params: { conversaId: number; limit?: number; antesDe?: Date | null }) {
  const db = await getDb();
  const limit = Math.min(Math.max(params.limit ?? 15, 1), 200);
  if (!db) return { mensagens: [], hasMore: false, cursorConsultado: params.antesDe?.toISOString() ?? null };
  const inicioRecente = new Date();
  inicioRecente.setDate(inicioRecente.getDate() - 6);
  const condicoes = [eq(inboxMensagens.conversaId, params.conversaId)];
  if (params.antesDe) condicoes.push(lt(inboxMensagens.createdAt, params.antesDe));
  else condicoes.push(gte(inboxMensagens.createdAt, inicioRecente));
  const linhas = await db.select(COLUNAS_INBOX_MENSAGEM)
    .from(inboxMensagens)
    .leftJoin(atendentes, eq(inboxMensagens.enviadaPorAtendenteId, atendentes.id))
    .where(and(...condicoes))
    .orderBy(desc(inboxMensagens.createdAt))
    .limit(limit + 1);
  let hasMore = linhas.length > limit;
  if (!params.antesDe && !hasMore) {
    const anterior = await db.select({ id: inboxMensagens.id }).from(inboxMensagens)
      .where(and(eq(inboxMensagens.conversaId, params.conversaId), lt(inboxMensagens.createdAt, inicioRecente)))
      .limit(1);
    hasMore = anterior.length > 0;
  }
  return {
    mensagens: linhas.slice(0, limit).reverse(),
    hasMore,
    cursorConsultado: params.antesDe?.toISOString() ?? null,
  };
}

/**
 * Nome mais recente visto por telefone dentro de um grupo, a partir do
 * próprio histórico de mensagens (participanteTelefone/participanteNome
 * — preenchidos a cada mensagem recebida de grupo). Usado como reforço
 * quando GET /group-metadata da Z-API não devolve "name" pro
 * participante (WhatsApp nem sempre expõe isso) — se essa pessoa já
 * mandou mensagem alguma vez, a gente já tem o nome de exibição dela.
 */
export async function listNomesConhecidosPorTelefone(conversaId: number): Promise<Map<string, string>> {
  const db = await getDb();
  const mapa = new Map<string, string>();
  if (!db) return mapa;
  const rows = await db.select({
    telefone: inboxMensagens.participanteTelefone,
    nome: inboxMensagens.participanteNome,
  })
    .from(inboxMensagens)
    .where(eq(inboxMensagens.conversaId, conversaId))
    .orderBy(desc(inboxMensagens.createdAt))
    .limit(500);
  for (const row of rows) {
    if (row.telefone && row.nome && !mapa.has(row.telefone)) {
      mapa.set(row.telefone, row.nome);
    }
  }
  return mapa;
}

export async function insertInboxMensagem(mensagem: InsertInboxMensagem) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(inboxMensagens).values(mensagem).$returningId();
  return result[0]?.id;
}

/**
 * Uma mensagem enviada pelo CRM já foi gravada na hora do envio (ver
 * inbox.mensagens.enviar) — quando o webhook da Z-API ecoa esse mesmo
 * envio de volta (fromMe: true), isso evita duplicar. Só serve pra
 * distinguir "já registrada pelo CRM" de "recepção respondeu direto
 * pelo app do WhatsApp Business" (aí sim precisa inserir).
 */
export async function existeMensagemComZapiMessageId(zapiMessageId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ id: inboxMensagens.id }).from(inboxMensagens)
    .where(eq(inboxMensagens.zapiMessageId, zapiMessageId)).limit(1);
  return rows.length > 0;
}

export async function updateInboxMensagemTranscricao(id: number, transcricao: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxMensagens).set({ transcricao }).where(eq(inboxMensagens.id, id));
}

export async function getInboxMensagemById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(inboxMensagens).where(eq(inboxMensagens.id, id)).limit(1);
  return rows[0];
}

/** "" ou undefined vira NULL (reação removida). */
export async function atualizarReacaoMensagem(id: number, emoji: string | null | undefined) {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxMensagens).set({ reacaoEmoji: emoji || null }).where(eq(inboxMensagens.id, id));
}

/**
 * Caminho do webhook (payload.reaction) — só temos o messageId da
 * Z-API, não o id interno da mensagem. Best-effort: se a mensagem
 * original não estiver no nosso banco (ex.: de antes dessa coluna
 * existir), simplesmente não atualiza nada.
 */
export async function atualizarReacaoMensagemPorZapiId(zapiMessageId: string, emoji: string | null | undefined) {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxMensagens).set({ reacaoEmoji: emoji || null }).where(eq(inboxMensagens.zapiMessageId, zapiMessageId));
}

// ===== Banco Inter =====

/**
 * Atualiza o token OAuth em cache para a unidade.
 */
export async function updateInterToken(
  unidadeId: number,
  accessToken: string,
  expiresAt: number,
) {
  const db = await getDb();
  if (!db) return;
  await db.update(unidades).set({
    interAccessToken: accessToken,
    interTokenExpiresAt: expiresAt,
  }).where(eq(unidades.id, unidadeId));
}

export async function updateSicrediToken(
  unidadeId: number,
  accessToken: string,
  expiresAt: number,
) {
  const db = await getDb();
  if (!db) return;
  await db.update(unidades).set({
    sicrediAccessToken: accessToken,
    sicrediTokenExpiresAt: expiresAt,
  }).where(eq(unidades.id, unidadeId));
}

/**
 * Insere transações do extrato Inter, ignorando duplicatas por idTransacao.
 * Retorna o número de registros efetivamente inseridos.
 */
export async function upsertInterExtratos(
  unidadeId: number,
  transacoes: InsertInterExtrato[],
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  if (transacoes.length === 0) return 0;

  let inseridos = 0;
  for (const t of transacoes) {
    // Evita duplicata por idTransacao quando disponível
    if (t.idTransacao) {
      const existente = await db
        .select({ id: interExtratos.id })
        .from(interExtratos)
        .where(
          and(
            eq(interExtratos.unidadeId, unidadeId),
            eq(interExtratos.idTransacao, t.idTransacao),
          ),
        )
        .limit(1);
      if (existente.length > 0) continue;
    }
    await db.insert(interExtratos).values({ ...t, unidadeId });
    inseridos++;
  }
  return inseridos;
}

/**
 * Insere ou atualiza lançamentos de Caixa Físico. Diferente de
 * `upsertInterExtratos` (insert-only, correto pra extrato bancário
 * imutável), o Caixa Físico é digitado à mão numa planilha e pode ser
 * corrigido depois — se já existir uma linha pro mesmo dia+tipo+título
 * com valor diferente, atualiza a linha (valor/título/descrição) em
 * vez de criar uma segunda. Categorização (dreDescricaoId/
 * categorizacaoStatus) só é atualizada junto se a linha ainda não
 * estiver "confirmada", pra não sobrescrever uma categoria que o
 * usuário já revisou.
 *
 * Casa por CHAVE NATURAL (dataEntrada+tipoOperacao+titulo), não por
 * `idTransacao` — bug real corrigido 2x em 2026-08-17: (1) o
 * idTransacao antes incluía o valor, então corrigir o valor na
 * planilha gerava uma chave nova e o sync antigo (insert-only)
 * duplicava o dia; (2) ao remover o valor da chave do idTransacao,
 * linhas já sincronizadas ANTES desse fix continuaram com o
 * idTransacao no formato antigo gravado no banco — casar pelo novo
 * formato não encontrava nada e duplicava TODO o histórico de novo.
 * Chave natural resolve os dois de vez, sem depender do formato do
 * idTransacao gravado. `idTransacao` é sempre regravado com o valor
 * atual, só pra manter o dado coerente com o que o código gera hoje.
 */
export async function upsertOuAtualizarCaixaFisico(
  unidadeId: number,
  transacoes: InsertInterExtrato[],
): Promise<{ inseridos: number; atualizados: number }> {
  const db = await getDb();
  if (!db) return { inseridos: 0, atualizados: 0 };
  if (transacoes.length === 0) return { inseridos: 0, atualizados: 0 };

  const existentes = await db.select({
    id: interExtratos.id,
    dataEntrada: interExtratos.dataEntrada,
    tipoOperacao: interExtratos.tipoOperacao,
    titulo: interExtratos.titulo,
    valor: interExtratos.valor,
    categorizacaoStatus: interExtratos.categorizacaoStatus,
  }).from(interExtratos).where(and(
    eq(interExtratos.unidadeId, unidadeId),
    eq(interExtratos.origem, "caixa_fisico"),
  ));
  const chaveNatural = (dataEntrada: string, tipoOperacao: string, titulo: string | null | undefined) =>
    `${dataEntrada}|${tipoOperacao}|${(titulo ?? "").trim()}`;
  const porChave = new Map(existentes.map((e) => [chaveNatural(e.dataEntrada, e.tipoOperacao, e.titulo), e]));

  let inseridos = 0;
  let atualizados = 0;
  for (const t of transacoes) {
    const existente = porChave.get(chaveNatural(t.dataEntrada, t.tipoOperacao, t.titulo));
    if (!existente) {
      await db.insert(interExtratos).values({ ...t, unidadeId });
      inseridos++;
      continue;
    }
    const mudouValor = Number(existente.valor) !== Number(t.valor);
    const patch: Partial<InsertInterExtrato> = { idTransacao: t.idTransacao };
    if (mudouValor) {
      patch.valor = t.valor;
      patch.titulo = t.titulo;
      patch.descricao = t.descricao;
      if (existente.categorizacaoStatus !== "confirmada") {
        patch.dreDescricaoId = t.dreDescricaoId;
        patch.categorizacaoStatus = t.categorizacaoStatus;
      }
    }
    await db.update(interExtratos).set(patch).where(eq(interExtratos.id, existente.id));
    if (mudouValor) atualizados++;
  }
  return { inseridos, atualizados };
}

/**
 * Atualiza só o `titulo` de uma linha já existente (por idTransacao) —
 * usado pra corrigir a descrição da liquidação Mercado Pago (ver
 * enriquecimento por SOURCE_ID em contas.sincronizarMercadoPago) sem
 * mexer em dreDescricaoId/categorizacaoStatus, que `upsertInterExtratos`
 * nunca toca em linha já existente (insert-only) e que não podem ser
 * recalculados a cada re-sync — apagaria categorização manual que o
 * usuário já tenha confirmado.
 */
/**
 * Backfill pontual: sincronizarCaixaFisico (server/routers.ts) não
 * chamava categorizarTransacaoAutomaticamente na inserção (diferente
 * do Sicredi/Inter, que já chamam) — linhas de Caixa Físico sincronizadas
 * antes desse fix (2026-08-17) ficaram com dreDescricaoId null,
 * invisíveis pra "Contas bancárias" da Comanda (detalheContasBancariasPorDia
 * filtra por dreDescricaoId). Roda a cada clique em "Sincronizar Caixa
 * Físico" (idempotente — só mexe em linha ainda sem categoria, nunca
 * sobrescreve confirmação manual já feita).
 */
export async function backfillCategorizacaoCaixaFisico(unidadeId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const especieId = await resolverDescricaoIdPorChave(CHAVE_RECEITA_ESPECIE);
  if (!especieId) return 0;
  const pendentes = await db.select({ id: interExtratos.id, valor: interExtratos.valor })
    .from(interExtratos)
    .where(and(
      eq(interExtratos.unidadeId, unidadeId),
      eq(interExtratos.origem, "caixa_fisico"),
      eq(interExtratos.tipoOperacao, "C"),
      isNull(interExtratos.dreDescricaoId),
    ));
  let atualizados = 0;
  for (const p of pendentes) {
    const status = Number(p.valor) === 0 ? "confirmada" : "sugerida";
    await db.update(interExtratos).set({ dreDescricaoId: especieId, categorizacaoStatus: status }).where(eq(interExtratos.id, p.id));
    atualizados++;
  }
  return atualizados;
}

export async function atualizarTituloInterExtrato(
  unidadeId: number,
  idTransacao: string,
  titulo: string,
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(interExtratos)
    .set({ titulo })
    .where(and(eq(interExtratos.unidadeId, unidadeId), eq(interExtratos.idTransacao, idTransacao)));
}

// ===== Adquirentes (vendas de maquininha) =====

/**
 * Grava vendas de adquirente — upsert de verdade: atualiza a linha se
 * já existir (não só ignora), pra que rodar "Sincronizar" de novo
 * corrija dados gravados com um mapeamento antigo (ex.: quando um bug
 * no cálculo de taxa/antecipação é corrigido depois de já ter
 * sincronizado). Dedup/match por adquirente+idTransacaoExterno+parcela
 * — necessário porque o Interpag repete o mesmo idTransacaoExterno em
 * cada parcela de uma venda parcelada (só o campo parcela muda).
 */
/**
 * Traduz o payment_type_id/payment_method_id bruto do Mercado Pago (em
 * inglês, ex.: "bank_transfer"/"pix", "credit_card", "account_money")
 * pro rótulo canônico em português usado na coluna Tipo e na
 * classificação de Descrição DRE. Bug real encontrado: Pix do Mercado
 * Pago vem com payment_type_id = "bank_transfer" — a palavra "pix" só
 * aparece no payment_method_id — checar só o primeiro deixava toda
 * venda Pix como Pendente. `account_money` (saldo interno Mercado
 * Pago, sem taxa) vira "saldo_mercado_pago"; por decisão do usuário
 * entra no mesmo balde de Pix na Comanda Recepção (mesmo comportamento
 * de caixa: instantâneo, sem taxa), mas mantém rótulo próprio na
 * coluna Tipo pra não esconder a origem real do dado. Tipo não
 * reconhecido (ex.: "ticket"/boleto) passa como veio, em minúsculo —
 * fica Pendente na Descrição, mas não some da tela.
 */
export function normalizarTipoAdquirente(
  paymentTypeId: string | null | undefined,
  paymentMethodId: string | null | undefined,
): string {
  const t = (paymentTypeId || "").toLowerCase();
  const m = (paymentMethodId || "").toLowerCase();
  if (t === "bank_transfer" || m === "pix") return "pix";
  if (t === "account_money" || m === "account_money") return "saldo_mercado_pago";
  if (t === "credit_card" || m.includes("credit")) return "cartao_credito";
  // prepaid_card (cartão pré-pago) debita na hora do saldo carregado,
  // sem parcelamento/linha de crédito — mesmo comportamento de
  // liquidação do débito comum, por isso entra no mesmo balde.
  if (t === "debit_card" || t === "prepaid_card" || m.includes("debit")) return "cartao_debito";
  return t || m || "desconhecido";
}

/**
 * Registra compra operacional de equipamento Point no extrato da conta MP,
 * sem transformá-la em receita da adquirente. O identificador externo torna
 * a gravação idempotente em sincronizações futuras.
 */
export async function registrarDespesaEquipamentoPoint(input: {
  unidadeId: number;
  contaId: number;
  pagamentoId: string;
  data: string;
  descricaoEquipamento: string;
  valorTabela: number;
  valorPago: number;
  desconto: number;
}) {
  const db = await getDb();
  if (!db) return false;

  const idTransacao = `mp_equipamento:${input.pagamentoId}`;
  const existente = await db.select({ id: interExtratos.id }).from(interExtratos)
    .where(and(eq(interExtratos.unidadeId, input.unidadeId), eq(interExtratos.idTransacao, idTransacao)))
    .limit(1);
  if (existente[0]) return false;

  await db.insert(interExtratos).values({
    unidadeId: input.unidadeId,
    contaId: input.contaId,
    idTransacao,
    dataEntrada: input.data,
    dataTransacao: input.data,
    tipoTransacao: "compra_equipamento_point",
    tipoOperacao: "D",
    valor: input.valorPago.toFixed(2),
    titulo: "Compra de equipamento Point Smart 2",
    descricao: `${input.descricaoEquipamento}. Preço de tabela: R$ ${input.valorTabela.toFixed(2)}; desconto Mercado Pago: R$ ${input.desconto.toFixed(2)}; valor efetivamente pago: R$ ${input.valorPago.toFixed(2)}.`,
    detalhe: JSON.stringify({ pagamentoMercadoPagoId: input.pagamentoId, valorTabela: input.valorTabela, desconto: input.desconto, valorPago: input.valorPago }),
    nomeDestino: "Mercado Pago Instituição",
    origem: "mercadopago",
    categorizacaoStatus: "pendente",
  });
  return true;
}

const LABEL_TIPO_ADQUIRENTE: Record<string, string> = {
  pix: "Pix",
  cartao_credito: "Crédito",
  cartao_debito: "Débito",
  saldo_mercado_pago: "Saldo Mercado Pago",
};

/**
 * Rótulo amigável de um tipo já normalizado (normalizarTipoAdquirente)
 * — usado pra enriquecer a Descrição da liquidação na Conta Mercado
 * Pago (que só sabe "payment" genérico) com o tipo de venda real,
 * quando dá pra cruzar via SOURCE_ID/idTransacaoExterno.
 */
export function labelTipoAdquirente(tipoNormalizado: string): string {
  return LABEL_TIPO_ADQUIRENTE[tipoNormalizado] ?? tipoNormalizado;
}

/**
 * Classifica o tipo (já normalizado pra Mercado Pago via
 * normalizarTipoAdquirente, ou texto livre do CSV Interpag/Granito —
 * em português, ex.: "155 - DÉBITO COBRANÇA REFERENTE..." — confirmado
 * num CSV real) numa das Descrições de receita "de máquina". Pix
 * direto no banco (não pela maquininha) é tratado à parte, via regra
 * de texto "Pix recebido" em inter_extratos.
 *
 * Bug real encontrado: "débito"/"crédito" (com acento) não batem no
 * substring em inglês "debit"/"credit" — normaliza removendo acentos
 * antes de comparar, daí "débito" → "debito" bate em "debit" e
 * "crédito" → "credito" bate em "credit", cobrindo os dois idiomas com
 * a mesma checagem.
 */
function chaveDescricaoAdquirente(tipo: string | null | undefined): string | null {
  const t = (tipo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Interpag exporta o Tipo do Pix como "Pagamento Instantaneo" (o nome
  // oficial do Pix no mercado adquirente/bancario), nunca a palavra
  // "pix" - confirmado num CSV real (2026-08-17). Sem isso, essas
  // linhas nao batiam nem no filtro de exclusao (upsertAdquirenteVendas,
  // Pix de maquininha nao deve entrar aqui) nem na Descricao, ficando
  // "Pendente" a toa em vez de simplesmente nao aparecer.
  if (t.includes("pix") || t.includes("instantaneo") || t.includes("saldo_mercado_pago")) return CHAVE_RECEITA_PIX;
  if (t.includes("debit")) return CHAVE_RECEITA_CARTAO_DEBITO;
  if (t.includes("credit")) return CHAVE_RECEITA_CARTAO_CREDITO;
  return null;
}

export async function upsertAdquirenteVendas(
  unidadeId: number,
  vendasBrutas: InsertAdquirenteVenda[],
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  // Pix via maquininha da Interpag/Granito não entra aqui — o depósito
  // já chega certinho (valor cheio, sem desconto de taxa) no extrato
  // bancário, então contar ele de novo pelo lado do adquirente só
  // duplicaria a mesma entrada de Pix. Diferente do Mercado Pago, cujo
  // Pix precisa vir daqui porque a liquidação dele no banco é excluída
  // do DRE (já contada via adquirente_vendas) — sem discriminar "Pix
  // maquina" vs "Pix direto na conta", não há motivo pra ter os dois
  // casos hoje.
  const vendas = vendasBrutas.filter(
    (v) => !(v.adquirente === "interpag" && chaveDescricaoAdquirente(v.tipo) === CHAVE_RECEITA_PIX),
  );
  if (vendas.length === 0) return 0;

  // Resolve os ids das Descrições de receita uma vez (não numa query
  // por linha) — mesmo espírito de listRegrasParaMatch/listCnpjsPorUnidade.
  const chavesNecessarias = Array.from(new Set(
    vendas.map((v) => chaveDescricaoAdquirente(v.tipo)).filter((c): c is string => c !== null),
  ));
  const idPorChaveDescricao = new Map<string, number>();
  for (const chave of chavesNecessarias) {
    const id = await resolverDescricaoIdPorChave(chave);
    if (id) idPorChaveDescricao.set(chave, id);
  }

  let inseridos = 0;
  for (const v of vendas) {
    const chaveDescricao = chaveDescricaoAdquirente(v.tipo);
    const dreDescricaoId = chaveDescricao ? idPorChaveDescricao.get(chaveDescricao) : undefined;
    const linha = { ...v, dreDescricaoId };

    if (v.idTransacaoExterno) {
      const existente = await db
        .select({ id: adquirenteVendas.id })
        .from(adquirenteVendas)
        .where(
          and(
            eq(adquirenteVendas.unidadeId, unidadeId),
            eq(adquirenteVendas.adquirente, v.adquirente),
            eq(adquirenteVendas.idTransacaoExterno, v.idTransacaoExterno),
            v.parcela ? eq(adquirenteVendas.parcela, v.parcela) : isNull(adquirenteVendas.parcela),
          ),
        )
        .limit(1);
      if (existente.length > 0) {
        // Origem é dado prospectivo: uma linha que já existia antes da
        // instrumentação não pode ser reclassificada retrospectivamente.
        // Atualizações de valores/status preservam o NULL (ou o valor já
        // persistido) na origem original.
        const { origemPagamento: _origemPagamento, ...linhaParaAtualizar } = linha;
        await db.update(adquirenteVendas).set(linhaParaAtualizar).where(eq(adquirenteVendas.id, existente[0].id));
        continue;
      }
    }
    await db.insert(adquirenteVendas).values({ ...linha, unidadeId });
    inseridos++;
  }
  return inseridos;
}

/**
 * Reclassifica vendas de adquirente que ficaram sem Descrição — achado
 * 2026-09-10 investigando por que a Conciliação PDV Fase 1 (Comanda x
 * Caixa) e a Receita Bruta do DRE não batiam com o real: 192 vendas
 * (jun-ago/2026, ~R$69 mil) nunca tinham `dreDescricaoId`, porque
 * `chaveDescricaoAdquirente` só passou a reconhecer alguns `tipo`
 * (ex.: "Pagamento Instantâneo") depois que essas linhas já tinham sido
 * importadas — diferente de inter_extratos, adquirente_vendas não tem
 * nenhum reprocessamento automático (`upsertAdquirenteVendas` só
 * reclassifica no upsert de uma sincronização/importação nova da MESMA
 * linha, não existe um "reprocessar pendentes" aqui).
 *
 * Só reclassifica venda de verdade, não qualquer coisa que bata o
 * padrão de texto:
 * - valor precisa ser positivo (venda de cliente nunca é negativa);
 * - `tipo` não pode ser uma linha de tarifa/ajuste do Interpag (formato
 *   "NNN - <descrição>", ex.: "155 - DÉBITO COBRANÇA REFERENTE A
 *   UTILIZAÇÃO DO CHIP DE TELEFONIA" — bateria em "debit" e viraria
 *   "Receita Cartão de Débito" errado, mas é uma tarifa, não uma venda;
 *   confirmado real no CSV do Interpag, ver comentário em
 *   drizzle/schema.ts);
 * - Pix da Interpag/Granito nunca entra aqui — mesma exclusão que
 *   upsertAdquirenteVendas já aplica em toda venda NOVA (o depósito já
 *   chega certinho no extrato bancário, contar os dois duplicaria a
 *   venda). Bug real encontrado nesta 1ª versão desta função
 *   (2026-09-10): 20 vendas Pix da Interpag (jul-ago/2026, R$6.337)
 *   eram justamente linhas antigas que SÓ existiam sem classificação
 *   por serem anteriores a essa exclusão existir — reclassificá-las
 *   reativou a duplicidade que a exclusão foi criada pra evitar.
 */
export async function reprocessarAdquirenteVendasSemClassificacao(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const semClassificacao = await db.select({
    id: adquirenteVendas.id,
    tipo: adquirenteVendas.tipo,
    valorBruto: adquirenteVendas.valorBruto,
    adquirente: adquirenteVendas.adquirente,
  }).from(adquirenteVendas).where(isNull(adquirenteVendas.dreDescricaoId));
  if (semClassificacao.length === 0) return 0;

  const idsPorChave = new Map<string, number[]>();
  for (const v of semClassificacao) {
    if (/^\d+\s*-/.test((v.tipo ?? "").trim())) continue; // linha de tarifa/ajuste do Interpag, nunca é venda
    if (parseFloat(v.valorBruto ?? "0") <= 0) continue; // venda de cliente é sempre positiva
    const chave = chaveDescricaoAdquirente(v.tipo);
    if (!chave) continue;
    if (v.adquirente === "interpag" && chave === CHAVE_RECEITA_PIX) continue; // já conta pelo extrato bancário
    if (!idsPorChave.has(chave)) idsPorChave.set(chave, []);
    idsPorChave.get(chave)!.push(v.id);
  }
  if (idsPorChave.size === 0) return 0;

  let atualizados = 0;
  for (const [chave, ids] of idsPorChave) {
    const dreDescricaoId = await resolverDescricaoIdPorChave(chave);
    if (!dreDescricaoId) continue;
    await db.update(adquirenteVendas).set({ dreDescricaoId }).where(inArray(adquirenteVendas.id, ids));
    atualizados += ids.length;
  }
  return atualizados;
}

export async function listAdquirenteVendas(
  unidadeId: number,
  dataInicio: string,
  dataFim: string,
  adquirente?: "mercadopago" | "interpag",
) {
  const db = await getDb();
  if (!db) return [];
  const condicoes = [
    eq(adquirenteVendas.unidadeId, unidadeId),
    gte(adquirenteVendas.dataHora, `${dataInicio} 00:00:00`),
    lte(adquirenteVendas.dataHora, `${dataFim} 23:59:59`),
  ];
  if (adquirente) condicoes.push(eq(adquirenteVendas.adquirente, adquirente));
  return db
    .select()
    .from(adquirenteVendas)
    .where(and(...condicoes))
    .orderBy(desc(adquirenteVendas.dataHora));
}

/**
 * Lista transações do extrato Inter para uma unidade e período. Sem
 * `contaId`, traz todas as contas da unidade somadas (comportamento
 * padrão); com `contaId`, filtra só aquela conta.
 */
/**
 * `tiposConta` filtra pelas contas cujo `tipo` esteja nesse conjunto
 * (ex.: ["conta_corrente", "caixa_fisico"] pra a visão por grupo da
 * tela de Contas, no lugar do antigo "Consolidado" que misturava
 * tudo). Ignorado se `contaId` for passado — uma conta específica já
 * é mais preciso que filtrar por tipo dela.
 */
export async function listInterExtratos(
  unidadeId: number,
  dataInicio: string,
  dataFim: string,
  contaId?: number,
  tiposConta?: string[],
) {
  const db = await getDb();
  if (!db) return [];
  const condicoes = [
    eq(interExtratos.unidadeId, unidadeId),
    gte(interExtratos.dataEntrada, dataInicio),
    lte(interExtratos.dataEntrada, dataFim),
  ];
  if (contaId !== undefined) {
    condicoes.push(eq(interExtratos.contaId, contaId));
  } else if (tiposConta && tiposConta.length > 0) {
    const contasDoGrupo = await db.select({ id: contas.id }).from(contas)
      .where(and(eq(contas.unidadeId, unidadeId), inArray(contas.tipo, tiposConta as (typeof contas.tipo.enumValues)[number][])));
    if (contasDoGrupo.length === 0) return [];
    condicoes.push(inArray(interExtratos.contaId, contasDoGrupo.map((c) => c.id)));
  }
  return db
    .select()
    .from(interExtratos)
    .where(and(...condicoes))
    .orderBy(desc(interExtratos.dataEntrada));
}

// ===== Comanda Recepção (conciliação semanal de caixa) =====

/**
 * "Comanda virtual" (comanda_itens, preenchida pela recepção em tempo
 * real, uma aba por dia) tem prioridade sobre "Consolidado comanda"
 * (comanda_diaria, planilha mensal — sincronização descontinuada em
 * 2026-09-03) quando o dia já tem algum item. Dias sem nenhum item
 * (histórico anterior a 2026-08-09, quando a Comanda virtual começou)
 * continuam vindo do Consolidado, que só existe como fallback histórico
 * congelado agora — nada mais escreve em comanda_diaria.
 */
export async function listComandaDiaria(unidadeId: number, dataInicio: string, dataFim: string) {
  const db = await getDb();
  if (!db) return [];
  const [diaria, itens] = await Promise.all([
    db.select().from(comandaDiaria).where(and(
      eq(comandaDiaria.unidadeId, unidadeId),
      gte(comandaDiaria.data, dataInicio),
      lte(comandaDiaria.data, dataFim),
    )),
    listComandaItensDetalhe(unidadeId, dataInicio, dataFim),
  ]);

  const porDiaItens = new Map<string, { dinheiro: number; cartaoDebito: number; cartaoCredito: number; pix: number }>();
  for (const item of itens) {
    const acc = porDiaItens.get(item.data) ?? { dinheiro: 0, cartaoDebito: 0, cartaoCredito: 0, pix: 0 };
    if (item.forma === "dinheiro") acc.dinheiro += item.valor;
    else if (item.forma === "pix") acc.pix += item.valor;
    else if (item.forma === "debito") acc.cartaoDebito += item.valor;
    else if (item.forma === "credito") acc.cartaoCredito += item.valor;
    porDiaItens.set(item.data, acc);
  }

  const porDiaConsolidado = new Map(diaria.map((d) => [d.data, d]));
  const datas = new Set<string>([...Array.from(porDiaConsolidado.keys()), ...Array.from(porDiaItens.keys())]);

  return Array.from(datas).map((data) => {
    const agregadoItens = porDiaItens.get(data);
    if (agregadoItens) return { data, ...agregadoItens };
    const consolidado = porDiaConsolidado.get(data)!;
    return {
      data,
      dinheiro: Number(consolidado.dinheiro),
      cartaoDebito: Number(consolidado.cartaoDebito),
      cartaoCredito: Number(consolidado.cartaoCredito),
      pix: Number(consolidado.pix),
    };
  });
}

// Conta lançamentos (um por venda) na Comanda Virtual do período — usado
// pelo Dashboard (totalVendasMes) como fonte local, no lugar da API do
// Belle (que nunca teve token configurado nesse projeto).
export async function contarVendasComandaPeriodo(unidadeId: number, dataInicio: string, dataFim: string) {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db.select({ id: comandaItens.id }).from(comandaItens).where(and(
    eq(comandaItens.unidadeId, unidadeId),
    gte(comandaItens.data, dataInicio),
    lte(comandaItens.data, dataFim),
  ));
  return rows.length;
}

export interface DivergenciaTerapeuta {
  comandaItemId: number;
  data: string;
  cliente: string;
  terapia: string | null;
  terapeutaComanda: string;
  terapeutaBelle: string | null;
  situacao: "divergente" | "sem_correspondencia_belle";
}

/**
 * Cruza Comanda x Belle por cliente+data pra achar atendimentos onde o
 * terapeuta registrado em cada sistema não bate — sinal de que a
 * recepção selecionou o profissional errado ao fechar no Belle, o que
 * bagunça o cálculo de repartição por terapeuta. Casamento por nome
 * (nomesCorrespondem, mesma lógica usada em tempoAtendimento.ts pra
 * eventos de terapeuta) porque a Comanda não guarda o clienteId do
 * Belle — só o nome que a recepção digitou à mão na planilha.
 * "sem_correspondencia_belle" é reportado separado de "divergente":
 * o primeiro pode ser só o nome não ter batido (erro de digitação),
 * não necessariamente um problema de terapeuta.
 */
export async function listarDivergenciasTerapeutas(unidadeId: number, dataInicio: string, dataFim: string): Promise<DivergenciaTerapeuta[]> {
  const db = await getDb();
  if (!db) return [];

  const [itensComanda, atendimentosBelle, roster] = await Promise.all([
    db.select({
      id: comandaItens.id,
      data: comandaItens.data,
      cliente: comandaItens.cliente,
      terapiaProduto: comandaItens.terapiaProduto,
      terapeuta: comandaItens.terapeuta,
    }).from(comandaItens).where(and(
      eq(comandaItens.unidadeId, unidadeId),
      gte(comandaItens.data, dataInicio),
      lte(comandaItens.data, dataFim),
      isNotNull(comandaItens.terapeuta),
    )),
    db.select({
      id: belleAtendimentos.id,
      dataAtendimento: belleAtendimentos.dataAtendimento,
      clienteNome: belleAtendimentos.clienteNome,
      servicoNome: belleAtendimentos.servicoNome,
      profissionalNome: belleAtendimentos.profissionalNome,
    }).from(belleAtendimentos).where(and(
      eq(belleAtendimentos.unidadeId, unidadeId),
      gte(belleAtendimentos.dataAtendimento, dataInicio),
      lte(belleAtendimentos.dataAtendimento, dataFim),
      // Exclui só quem realmente não aconteceu (Desmarcado/Cancelado) —
      // bug real relatado 2026-09-08: um desses contava como
      // "correspondência" e gerava "Terapeuta diverge" indevido contra
      // um profissional que nem chegou a atender.
      //
      // NÃO restringe a "Atendido": tentei isso primeiro e quebrou muito
      // mais casos do que corrigiu (mesmo relato, poucos minutos depois)
      // — nesta unidade boa parte dos atendimentos que a Comanda já
      // registrou como cobrados continua com status "Marcado" ou
      // "Agendado (IA)" no Belle (a recepção não atualiza o status lá
      // depois de atender), então exigir "Atendido" derrubava
      // correspondências legítimas pra "Cliente não encontrado no Belle".
      notInArray(belleAtendimentos.status, ["Desmarcado", "Cancelado"]),
    )),
    db.select({ id: terapeutas.id, nomeCompleto: terapeutas.nomeCompleto, nomeAbreviado: terapeutas.nomeAbreviado })
      .from(terapeutas).where(eq(terapeutas.unidadeId, unidadeId)),
  ]);

  const belleporData = new Map<string, typeof atendimentosBelle>();
  const belleporId = new Map<number, (typeof atendimentosBelle)[number]>();
  for (const atendimento of atendimentosBelle) {
    const lista = belleporData.get(atendimento.dataAtendimento) ?? [];
    lista.push(atendimento);
    belleporData.set(atendimento.dataAtendimento, lista);
    belleporId.set(atendimento.id, atendimento);
  }

  // Correção manual (tela Conciliação PDV Fase 3, "Corrigir manualmente")
  // pra quando o casamento automático por nome não acha o atendimento
  // certo ou acha o errado — ver definirCorrespondenciaManualComanda.
  const correspondenciasManuais = itensComanda.length > 0
    ? await db.select({ comandaItemId: conciliacaoCorrespondenciasManuais.comandaItemId, belleAtendimentoId: conciliacaoCorrespondenciasManuais.belleAtendimentoId })
        .from(conciliacaoCorrespondenciasManuais)
        .where(inArray(conciliacaoCorrespondenciasManuais.comandaItemId, itensComanda.map((item) => item.id)))
    : [];
  const correspondenciaPorComandaItem = new Map(correspondenciasManuais.map((c) => [c.comandaItemId, c.belleAtendimentoId]));

  const divergencias: DivergenciaTerapeuta[] = [];
  for (const item of itensComanda) {
    const cliente = item.cliente?.trim();
    const terapeuta = item.terapeuta?.trim();
    if (!cliente || !terapeuta) continue;

    // Resolve contra o cadastro (não texto livre vs texto livre) —
    // pega apelido com erro de digitação e prefixo de cargo do Belle.
    // Some (null) quando o texto não é uma pessoa: linha de Produto/
    // Voucher na Comanda não tem terapeuta de verdade pra comparar.
    const terapeutaComandaId = identificarTerapeuta(terapeuta, roster);
    if (terapeutaComandaId === null) continue;

    // Item já corrigido manualmente: belleAtendimentoId nulo = recepção
    // confirmou que não tem correspondência mesmo, some da lista sem
    // recalcular. Um id que não existe mais (linha removida) cai pro
    // casamento automático normal, como se não tivesse correção.
    const correcaoManual = correspondenciaPorComandaItem.get(item.id);
    let atendimento: (typeof atendimentosBelle)[number] | undefined;
    if (correcaoManual !== undefined) {
      if (correcaoManual === null) continue;
      atendimento = belleporId.get(correcaoManual);
    }

    if (!atendimento) {
      const candidatos = (belleporData.get(item.data) ?? []).filter((b) => nomesClienteCorrespondem(b.clienteNome, cliente));
      if (candidatos.length === 0) {
        divergencias.push({ comandaItemId: item.id, data: item.data, cliente, terapia: item.terapiaProduto, terapeutaComanda: terapeuta, terapeutaBelle: null, situacao: "sem_correspondencia_belle" });
        continue;
      }
      // Cliente com mais de um atendimento no mesmo dia: desempata pela
      // terapia quando bate; senão prefere um candidato com terapeuta
      // humano reconhecido (ex.: ignora a sala "Banho II" de um banho de
      // imersão sem terapeuta dedicado, que o Belle lista como se fosse
      // o profissional do atendimento).
      atendimento = candidatos.find((b) => nomesCorrespondem(b.servicoNome, item.terapiaProduto))
        ?? candidatos.find((b) => identificarTerapeuta(b.profissionalNome, roster) !== null)
        ?? candidatos[0];
    }

    const terapeutaBelleId = identificarTerapeuta(atendimento.profissionalNome, roster);
    // Belle não registrou um terapeuta humano pra esse atendimento
    // (só a sala/recurso) — não dá pra comparar, não é divergência.
    if (terapeutaBelleId === null) continue;
    if (terapeutaBelleId !== terapeutaComandaId) {
      divergencias.push({ comandaItemId: item.id, data: item.data, cliente, terapia: item.terapiaProduto, terapeutaComanda: terapeuta, terapeutaBelle: atendimento.profissionalNome, situacao: "divergente" });
    }
  }

  return divergencias.sort((a, b) => a.data.localeCompare(b.data) || a.cliente.localeCompare(b.cliente));
}

export interface BelleAtendimentoDoDia {
  id: number;
  clienteNome: string;
  servicoNome: string | null;
  profissionalNome: string | null;
  status: string;
}

/** Candidatos pra escolha manual na Fase 3 — mesmo dia, mesmo filtro de status do casamento automático. */
export async function listarBelleAtendimentosDoDia(unidadeId: number, data: string): Promise<BelleAtendimentoDoDia[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: belleAtendimentos.id,
    clienteNome: belleAtendimentos.clienteNome,
    servicoNome: belleAtendimentos.servicoNome,
    profissionalNome: belleAtendimentos.profissionalNome,
    status: belleAtendimentos.status,
  }).from(belleAtendimentos).where(and(
    eq(belleAtendimentos.unidadeId, unidadeId),
    eq(belleAtendimentos.dataAtendimento, data),
    notInArray(belleAtendimentos.status, ["Desmarcado", "Cancelado"]),
  )).orderBy(asc(belleAtendimentos.clienteNome));
}

/**
 * Grava a correspondência escolhida à mão pra um item da Comanda na
 * Fase 3 (Terapeutas). belleAtendimentoId null = recepção confirmou
 * que não tem correspondência mesmo (some da lista sem forçar escolha).
 */
export async function definirCorrespondenciaManualComanda(comandaItemId: number, belleAtendimentoId: number | null, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.insert(conciliacaoCorrespondenciasManuais)
    .values({ comandaItemId, belleAtendimentoId, criadoPorUserId: userId })
    .onDuplicateKeyUpdate({ set: { belleAtendimentoId, criadoPorUserId: userId } });
}

export interface ResumoContasBancariasDia {
  data: string;
  dinheiro: number;
  cartaoDebito: number;
  cartaoCredito: number;
  pix: number;
}

export interface ItemContaBancaria {
  data: string;
  forma: "dinheiro" | "debito" | "credito" | "pix";
  horario: string; // "HH:mm" — vazio quando a fonte não tem horário (ex: extrato Inter, Caixa Físico)
  descricao: string;
  valor: number;
}

const CHAVE_DESCRICAO_POR_FORMA: Record<ItemContaBancaria["forma"], string> = {
  dinheiro: CHAVE_RECEITA_ESPECIE,
  debito: CHAVE_RECEITA_CARTAO_DEBITO,
  credito: CHAVE_RECEITA_CARTAO_CREDITO,
  pix: CHAVE_RECEITA_PIX,
};

/**
 * Lado "Contas bancárias" da conciliação, item a item — sempre calculado
 * ao vivo a partir do que já está categorizado (sem tabela própria):
 * filtra adquirente_vendas e inter_extratos pelas 4 Descrições de
 * "Receitas de Vendas" (dreDescricaoId), em vez de adivinhar por texto/
 * tipo como antes. É isso que corrige o bug de contaminação (liquidação
 * do Mercado Pago sendo contada como Pix): essas linhas agora são
 * categorizadas como "Excluído do DRE" (ver
 * categorizarTransacaoAutomaticamente), então nem aparecem aqui. Caixa
 * Físico entra pelo mesmo caminho (categorizado como "Receita em
 * Espécie"), sem precisar de caso especial. Débito/Crédito vêm só de
 * adquirente_vendas (valor bruto da venda, fonte confiável — bate com o
 * resumo de Adquirentes); o depósito correspondente no extrato bancário
 * não entra aqui, senão duplicaria a mesma venda (valor líquido, já sem
 * taxa, chegando pelo outro caminho). Agrupado pelo dia da venda
 * (dataHora/dataEntrada), não pela data de liquidação — o objetivo é
 * comparar "o que a recepção lançou hoje" com "o que realmente
 * aconteceu hoje". Serve tanto pro resumo (agregado) quanto pro tooltip
 * de auditoria (lançamento a lançamento).
 */
export async function detalheContasBancariasPorDia(
  unidadeId: number,
  dataInicio: string,
  dataFim: string,
): Promise<ItemContaBancaria[]> {
  const itens: ItemContaBancaria[] = [];
  const db = await getDb();
  if (!db) return itens;

  const formaPorDescricaoId = new Map<number, ItemContaBancaria["forma"]>();
  for (const [forma, chave] of Object.entries(CHAVE_DESCRICAO_POR_FORMA) as [ItemContaBancaria["forma"], string][]) {
    const id = await resolverDescricaoIdPorChave(chave);
    if (id) formaPorDescricaoId.set(id, forma);
  }
  const idsReceita = Array.from(formaPorDescricaoId.keys());
  if (idsReceita.length === 0) return itens;

  const vendas = await db.select().from(adquirenteVendas).where(and(
    eq(adquirenteVendas.unidadeId, unidadeId),
    gte(adquirenteVendas.dataHora, `${dataInicio} 00:00:00`),
    lte(adquirenteVendas.dataHora, `${dataFim} 23:59:59`),
    inArray(adquirenteVendas.dreDescricaoId, idsReceita),
  ));
  for (const v of vendas) {
    const forma = v.dreDescricaoId ? formaPorDescricaoId.get(v.dreDescricaoId) : undefined;
    if (!forma) continue;
    const [data, hora] = v.dataHora.split(" ");
    const adquirenteLabel = v.adquirente === "mercadopago" ? "Mercado Pago" : "Granito";
    itens.push({
      data,
      forma,
      horario: (hora || "").slice(0, 5),
      descricao: `${adquirenteLabel} · ${v.bandeira || v.tipo || "-"}${v.parcela ? ` (${v.parcela})` : ""}`,
      valor: Number(v.valorBruto ?? 0),
    });
  }

  // Débito/Crédito entram só pela venda da maquininha (acima) — o valor
  // bruto de lá já é a fonte confiável (bate com o resumo de Adquirentes).
  // O depósito correspondente no extrato bancário (líquido, já descontada
  // taxa) é o mesmo dinheiro chegando por outro caminho: somar os dois
  // duplicaria a venda. Dinheiro/Pix não têm linha em adquirente_vendas
  // (Caixa Físico e Pix direto na conta), então continuam vindo só do
  // extrato.
  const idsReceitaExtrato = Array.from(formaPorDescricaoId.entries())
    .filter(([, forma]) => forma === "dinheiro" || forma === "pix")
    .map(([id]) => id);

  const extratos = idsReceitaExtrato.length === 0 ? [] : await db.select().from(interExtratos).where(and(
    eq(interExtratos.unidadeId, unidadeId),
    eq(interExtratos.tipoOperacao, "C"),
    gte(interExtratos.dataEntrada, dataInicio),
    lte(interExtratos.dataEntrada, dataFim),
    inArray(interExtratos.dreDescricaoId, idsReceitaExtrato),
  ));
  for (const e of extratos) {
    const forma = e.dreDescricaoId ? formaPorDescricaoId.get(e.dreDescricaoId) : undefined;
    if (!forma) continue;
    itens.push({
      data: e.dataEntrada,
      forma,
      horario: "",
      descricao: `${e.titulo || e.tipoTransacao || "Recebimento"}${e.nomeOrigem ? ` — ${e.nomeOrigem}` : ""}`,
      valor: Number(e.valor),
    });
  }

  return itens;
}

export async function resumoContasBancariasPorDia(
  unidadeId: number,
  dataInicio: string,
  dataFim: string,
): Promise<Map<string, ResumoContasBancariasDia>> {
  const itens = await detalheContasBancariasPorDia(unidadeId, dataInicio, dataFim);
  const porDia = new Map<string, ResumoContasBancariasDia>();
  const linha = (data: string) => {
    let l = porDia.get(data);
    if (!l) {
      l = { data, dinheiro: 0, cartaoDebito: 0, cartaoCredito: 0, pix: 0 };
      porDia.set(data, l);
    }
    return l;
  };
  for (const item of itens) {
    const l = linha(item.data);
    if (item.forma === "dinheiro") l.dinheiro += item.valor;
    else if (item.forma === "debito") l.cartaoDebito += item.valor;
    else if (item.forma === "credito") l.cartaoCredito += item.valor;
    else l.pix += item.valor;
  }
  return porDia;
}

// Mapeia o texto livre de "Forma Pagto." do Belle pros 4 baldes usados
// em toda a conciliação — funde as 2 variantes de Pix (Máquina/Conta
// Corrente) num só. "Boleto Bancário" não tem balde correspondente na
// Comanda (não é recebido no caixa físico) — fica de fora da
// conciliação por dia, não conta como diferença.
function baldeFormaPagamentoBelle(formaPagamento: string): "dinheiro" | "debito" | "credito" | "pix" | null {
  const normalizado = formaPagamento.trim().toLowerCase();
  if (normalizado === "dinheiro") return "dinheiro";
  if (normalizado === "cartão de débito") return "debito";
  if (normalizado === "cartão de crédito") return "credito";
  if (normalizado.startsWith("pix")) return "pix";
  return null;
}

/**
 * Import manual (.xlsx) do relatório "Registros Financeiros" do Belle.
 *
 * "Zera o período e sobe de novo": apaga tudo que já existia pra essa
 * unidade dentro do intervalo de Vcto do arquivo, antes de inserir —
 * o arquivo é sempre a fonte da verdade daquele período, nunca um
 * merge. Upsert por código sozinho (tentado antes) não resolve porque
 * (a) o relatório do Belle às vezes vem parcial e reimportar não limpa
 * o que ficou de fora, e (b) se um dia a base errada for importada pra
 * unidade errada por engano, reimportar a base certa depois nunca
 * substitui o lixo, só soma em cima (caso real, 2026-09-01: base do
 * Ribeirão Shopping subiu pro Santa Úrsula por engano).
 */
export async function upsertRegistrosFinanceirosBelle(
  unidadeId: number,
  linhas: LinhaRegistroFinanceiroBelleImportada[],
): Promise<{ processados: number; removidos: number; periodoInicio: string; periodoFim: string }> {
  const db = await getDb();
  if (!db || linhas.length === 0) return { processados: 0, removidos: 0, periodoInicio: "", periodoFim: "" };

  const unicosPorCodigo = new Map<number, LinhaRegistroFinanceiroBelleImportada>();
  for (const linha of linhas) unicosPorCodigo.set(linha.codigo, linha);
  const registros = Array.from(unicosPorCodigo.values());

  const datas = registros.map((r) => r.dataVencimento).sort();
  const periodoInicio = datas[0];
  const periodoFim = datas[datas.length - 1];

  const condicaoPeriodo = and(
    eq(belleRegistrosFinanceiros.unidadeId, unidadeId),
    gte(belleRegistrosFinanceiros.dataVencimento, periodoInicio),
    lte(belleRegistrosFinanceiros.dataVencimento, periodoFim),
  );
  const existentesNoPeriodo = await db.select({ id: belleRegistrosFinanceiros.id }).from(belleRegistrosFinanceiros).where(condicaoPeriodo);
  await db.delete(belleRegistrosFinanceiros).where(condicaoPeriodo);

  const valores: InsertBelleRegistroFinanceiro[] = registros.map((linha) => ({
    unidadeId,
    codigo: linha.codigo,
    dataVencimento: linha.dataVencimento,
    clienteNome: linha.clienteNome,
    valor: linha.valor.toString(),
    pendenteConfirmacao: linha.pendenteConfirmacao,
    formaPagamento: linha.formaPagamento,
    atendimentoBelleId: linha.atendimentoBelleId,
    observacao: linha.observacao,
  }));

  // onDuplicateKeyUpdate só como rede de segurança — o mesmo código
  // reaparecer fora do período que acabou de ser apagado seria
  // inesperado, mas não deve derrubar o import se acontecer.
  await db.insert(belleRegistrosFinanceiros).values(valores).onDuplicateKeyUpdate({
    set: {
      dataVencimento: sql`VALUES(dataVencimento)`,
      clienteNome: sql`VALUES(clienteNome)`,
      valor: sql`VALUES(valor)`,
      pendenteConfirmacao: sql`VALUES(pendenteConfirmacao)`,
      formaPagamento: sql`VALUES(formaPagamento)`,
      atendimentoBelleId: sql`VALUES(atendimentoBelleId)`,
      observacao: sql`VALUES(observacao)`,
    },
  });

  return { processados: registros.length, removidos: existentesNoPeriodo.length, periodoInicio, periodoFim };
}

export interface ItemRegistroFinanceiroBelle {
  data: string;
  forma: "dinheiro" | "debito" | "credito" | "pix";
  horario: string;
  descricao: string;
  valor: number;
  pendenteConfirmacao: boolean;
}

/**
 * Item a item do relatório financeiro do Belle no período — alimenta o
 * hover de auditoria da linha "Belle" na Conciliação PDV Fase 2, mesmo
 * padrão de detalheContasBancariasPorDia pro lado de Contas bancárias.
 * dataVencimento (não a data do atendimento) é a data de agrupamento —
 * pagamento não tem relação fixa com quando o serviço é prestado
 * (adiantado, pendente, plano/voucher sem atendimento).
 */
export async function detalheBelleRegistrosPorDia(
  unidadeId: number,
  dataInicio: string,
  dataFim: string,
): Promise<ItemRegistroFinanceiroBelle[]> {
  const db = await getDb();
  if (!db) return [];

  const registros = await db.select().from(belleRegistrosFinanceiros).where(and(
    eq(belleRegistrosFinanceiros.unidadeId, unidadeId),
    gte(belleRegistrosFinanceiros.dataVencimento, dataInicio),
    lte(belleRegistrosFinanceiros.dataVencimento, dataFim),
  ));

  const itens: ItemRegistroFinanceiroBelle[] = [];
  for (const r of registros) {
    const forma = baldeFormaPagamentoBelle(r.formaPagamento);
    if (!forma) continue;
    itens.push({
      data: r.dataVencimento,
      forma,
      horario: "",
      descricao: `${r.clienteNome ?? "Cliente não identificado"}${r.observacao ? ` — ${r.observacao}` : ""}`,
      valor: Number(r.valor),
      pendenteConfirmacao: r.pendenteConfirmacao,
    });
  }
  return itens;
}

export async function resumoBelleRegistrosPorDia(
  unidadeId: number,
  dataInicio: string,
  dataFim: string,
): Promise<Map<string, ResumoContasBancariasDia>> {
  const itens = await detalheBelleRegistrosPorDia(unidadeId, dataInicio, dataFim);
  const porDia = new Map<string, ResumoContasBancariasDia>();
  const linha = (data: string) => {
    let l = porDia.get(data);
    if (!l) {
      l = { data, dinheiro: 0, cartaoDebito: 0, cartaoCredito: 0, pix: 0 };
      porDia.set(data, l);
    }
    return l;
  };
  for (const item of itens) {
    const l = linha(item.data);
    if (item.forma === "dinheiro") l.dinheiro += item.valor;
    else if (item.forma === "debito") l.cartaoDebito += item.valor;
    else if (item.forma === "credito") l.cartaoCredito += item.valor;
    else l.pix += item.valor;
  }
  return porDia;
}

export interface PendenciasContasBancariasDia {
  data: string;
  dinheiro: boolean;
  cartaoDebito: boolean;
  cartaoCredito: boolean;
  pix: boolean;
}

/**
 * Quais dia+forma têm alguma parcela do Belle ainda pendente de
 * confirmação (Recebido zerado, somada pelo Valor contratado) —
 * alimenta o aviso na tela mesmo quando a diferença do dia zera, pra
 * não passar a impressão de que já está tudo confirmado.
 */
export async function pendenciasBelleRegistrosPorDia(
  unidadeId: number,
  dataInicio: string,
  dataFim: string,
): Promise<Map<string, PendenciasContasBancariasDia>> {
  const itens = await detalheBelleRegistrosPorDia(unidadeId, dataInicio, dataFim);
  const porDia = new Map<string, PendenciasContasBancariasDia>();
  for (const item of itens) {
    if (!item.pendenteConfirmacao) continue;
    let l = porDia.get(item.data);
    if (!l) {
      l = { data: item.data, dinheiro: false, cartaoDebito: false, cartaoCredito: false, pix: false };
      porDia.set(item.data, l);
    }
    if (item.forma === "dinheiro") l.dinheiro = true;
    else if (item.forma === "debito") l.cartaoDebito = true;
    else if (item.forma === "credito") l.cartaoCredito = true;
    else l.pix = true;
  }
  return porDia;
}

/**
 * Conciliação Comanda x Belle dia a dia — mesmo formato de
 * calcularConciliacaoPorDia (Comanda x Contas), reaproveitando o
 * mesmo motor de pareamento (shared/conciliacao.ts), só trocando o
 * lado B e o rótulo do texto gerado.
 */
export async function calcularConciliacaoBellePorDia(
  unidadeId: number,
  dataInicio: string,
  dataFim: string,
): Promise<ConciliacaoDia[]> {
  const [resumo, itensComanda, itensBelle] = await Promise.all([
    resumoBelleRegistrosPorDia(unidadeId, dataInicio, dataFim),
    listComandaItensDetalhe(unidadeId, dataInicio, dataFim),
    detalheBelleRegistrosPorDia(unidadeId, dataInicio, dataFim),
  ]);

  const comandaPorDia = new Map<string, ItemConciliacao[]>();
  for (const it of itensComanda) {
    const lista = comandaPorDia.get(it.data) ?? [];
    lista.push({ forma: it.forma, descricao: it.descricao, valor: it.valor });
    comandaPorDia.set(it.data, lista);
  }
  const bellePorDia = new Map<string, ItemConciliacao[]>();
  for (const it of itensBelle) {
    const lista = bellePorDia.get(it.data) ?? [];
    lista.push({ forma: it.forma, descricao: it.descricao, valor: it.valor });
    bellePorDia.set(it.data, lista);
  }

  const dias = new Set<string>([
    ...Array.from(resumo.keys()),
    ...Array.from(comandaPorDia.keys()),
    ...Array.from(bellePorDia.keys()),
  ]);

  return Array.from(dias).map((data) => {
    const valores = resumo.get(data);
    const texto = gerarTextoConciliacao(data, comandaPorDia.get(data) ?? [], bellePorDia.get(data) ?? [], "Belle");
    return {
      data,
      cartaoDebito: valores?.cartaoDebito ?? 0,
      cartaoCredito: valores?.cartaoCredito ?? 0,
      pix: valores?.pix ?? 0,
      texto,
    };
  });
}

/**
 * Total de saídas (débito, qualquer origem/conta) no período — usado
 * no relatório diário da rotina de sincronização (server/dailySyncReport.ts)
 * pra dar a dimensão do dia (entradas via resumoContasBancariasPorDia
 * já existente, saídas aqui). Soma bruta de inter_extratos, sem
 * depender de categorização (diferente de resumoContasBancariasPorDia,
 * que só conta o que já foi categorizado como Receita de Vendas) —
 * saída não passa por esse filtro, então soma tudo que é débito.
 */
export async function totalSaidasNoPeriodo(unidadeId: number, dataInicio: string, dataFim: string): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const linhas = await db.select({ valor: interExtratos.valor }).from(interExtratos).where(and(
    eq(interExtratos.unidadeId, unidadeId),
    eq(interExtratos.tipoOperacao, "D"),
    gte(interExtratos.dataEntrada, dataInicio),
    lte(interExtratos.dataEntrada, dataFim),
  ));
  return linhas.reduce((soma, l) => soma + Number(l.valor), 0);
}

// ===== Contas =====

export async function listContas(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contas).where(eq(contas.unidadeId, unidadeId)).orderBy(contas.createdAt);
}

/**
 * CNPJs de todas as contas cadastradas (qualquer unidade — transferência
 * entre Satori e Agama, por exemplo, atravessa unidade), guardando a
 * unidade dona de cada um — usada pra detectar transferência bancária
 * real *entre* unidades (CNPJ de destino/origem bate com uma conta de
 * uma unidade diferente da do lançamento), critério exato via CNPJ
 * cadastrado, não heurística. Normalizado (só dígitos), pra bater
 * contra cpfCnpjOrigem/cpfCnpjDestino do extrato sem depender de
 * formatação.
 */
export async function listCnpjsPorUnidade(): Promise<Map<string, number>> {
  const db = await getDb();
  if (!db) return new Map();
  const todas = await db.select({ cnpj: contas.cnpj, unidadeId: contas.unidadeId }).from(contas);
  const mapa = new Map<string, number>();
  for (const c of todas) {
    const digitos = c.cnpj?.replace(/\D/g, "");
    if (digitos) mapa.set(digitos, c.unidadeId);
  }
  return mapa;
}

/**
 * Garante que a unidade tenha uma conta "Banco Inter" (auto-cria na
 * primeira chamada, sem precisar de seed manual). Usada tanto pra listar
 * contas quanto pelo sync automático, pra ter um contaId real pra marcar
 * as transações que ele insere.
 */
export async function getOrCreateContaInter(unidadeId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const existente = await db.select().from(contas)
    .where(and(eq(contas.unidadeId, unidadeId), eq(contas.tipo, "inter_oauth")))
    .limit(1);
  if (existente[0]) return existente[0];

  const insertValues: InsertConta = { unidadeId, nome: "Banco Inter", tipo: "inter_oauth" };
  const result = await db.insert(contas).values(insertValues).$returningId();
  const novaId = result[0]?.id;
  if (!novaId) return undefined;
  const novaConta = await db.select().from(contas).where(eq(contas.id, novaId)).limit(1);
  return novaConta[0];
}

/**
 * Garante que a unidade tenha a conta "Sicredi" com tipo "sicredi_oauth"
 * — a linha "Sicredi" já existe hoje como conta "manual" (criada por
 * ensureContasPadrao), então aqui não cria uma segunda: promove a
 * existente pra "sicredi_oauth" na primeira sincronização automática,
 * preservando as transações já importadas manualmente sob a mesma conta.
 */
export async function getOrCreateContaSicredi(unidadeId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const existente = await db.select().from(contas)
    .where(and(eq(contas.unidadeId, unidadeId), eq(contas.nome, "Sicredi")))
    .limit(1);
  if (existente[0]) {
    if (existente[0].tipo !== "sicredi_oauth") {
      await db.update(contas).set({ tipo: "sicredi_oauth" }).where(eq(contas.id, existente[0].id));
    }
    return { ...existente[0], tipo: "sicredi_oauth" as const };
  }

  const insertValues: InsertConta = { unidadeId, nome: "Sicredi", tipo: "sicredi_oauth" };
  const result = await db.insert(contas).values(insertValues).$returningId();
  const novaId = result[0]?.id;
  if (!novaId) return undefined;
  const novaConta = await db.select().from(contas).where(eq(contas.id, novaId)).limit(1);
  return novaConta[0];
}

/**
 * Garante que a unidade tenha a conta "Mercado Pago" (mesmo espírito do
 * getOrCreateContaInter) — usada pelo sync do extrato da conta MP pra
 * ter um contaId real, independente de contas.list já ter sido chamado
 * antes (ensureContasPadrao abaixo cobre isso na listagem, mas o sync
 * pode ser a primeira coisa a rodar).
 */
export async function getOrCreateContaMercadoPago(unidadeId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const existente = await db.select().from(contas)
    .where(and(eq(contas.unidadeId, unidadeId), eq(contas.nome, "Mercado Pago")))
    .limit(1);
  if (existente[0]) return existente[0];

  const insertValues: InsertConta = { unidadeId, nome: "Mercado Pago", tipo: "conta_corrente" };
  const result = await db.insert(contas).values(insertValues).$returningId();
  const novaId = result[0]?.id;
  if (!novaId) return undefined;
  const novaConta = await db.select().from(contas).where(eq(contas.id, novaId)).limit(1);
  return novaConta[0];
}

/**
 * Garante que a unidade tenha as contas "manuais" padrão do negócio
 * (Sicredi, Mercado Pago) — auto-provisiona na primeira chamada, mesmo
 * espírito do getOrCreateContaInter, sem precisar de seed manual. Não
 * recria se o nome já existir (o usuário pode renomear/excluir depois).
 */
// "Sicredi" precisa nascer com tipo "sicredi_oauth" — senão o botão
// "Sincronizar com Sicredi" (gated em contaAtual.tipo === "sicredi_oauth")
// nunca aparece, e só quem promove o tipo é getOrCreateContaSicredi,
// chamado de dentro do próprio sync que o botão dispara: ovo-e-galinha.
// "Mercado Pago" é "conta_corrente" (dinheiro líquido de verdade, só
// não é banco tradicional) — o botão de sync dela checa por nome, não tipo.
const CONTAS_PADRAO: { nome: string; tipo: "conta_corrente" | "sicredi_oauth" }[] = [
  { nome: "Sicredi", tipo: "sicredi_oauth" },
  { nome: "Mercado Pago", tipo: "conta_corrente" },
];

export async function ensureContasPadrao(unidadeId: number) {
  const db = await getDb();
  if (!db) return;
  const existentes = await db.select({ nome: contas.nome }).from(contas).where(eq(contas.unidadeId, unidadeId));
  const nomesExistentes = new Set(existentes.map((c) => c.nome));
  for (const { nome, tipo } of CONTAS_PADRAO) {
    if (!nomesExistentes.has(nome)) {
      const insertValues: InsertConta = { unidadeId, nome, tipo };
      await db.insert(contas).values(insertValues);
    }
  }
}

export interface DadosConta {
  nome: string;
  tipo?: "conta_corrente" | "caixa_fisico" | "cartao_credito";
  agencia?: string;
  numeroConta?: string;
  cnpj?: string;
  saldoInicial?: string;
  saldoInicialEm?: string;
}

export async function createConta(unidadeId: number, dados: DadosConta) {
  const db = await getDb();
  if (!db) return undefined;
  const insertValues: InsertConta = { unidadeId, tipo: "conta_corrente", ...dados };
  const result = await db.insert(contas).values(insertValues).$returningId();
  return result[0]?.id;
}

export async function atualizarConta(id: number, dados: Partial<DadosConta>) {
  const db = await getDb();
  if (!db) return;
  await db.update(contas).set(dados).where(eq(contas.id, id));
}

/**
 * Saldo real da conta na data de início de um período — âncora
 * (saldoInicial na sua data) + soma de tudo que já aconteceu entre a
 * âncora e o dia anterior ao período. Retorna null se a conta não tem
 * saldo inicial cadastrado (não dá pra calcular saldo corrido sem
 * ponto de partida).
 */
export async function calcularSaldoNaData(contaId: number, dataInicioPeriodo: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const conta = await getContaById(contaId);
  if (!conta?.saldoInicial || !conta.saldoInicialEm) return null;

  const transacoesAntes = await db.select().from(interExtratos)
    .where(and(
      eq(interExtratos.contaId, contaId),
      gte(interExtratos.dataEntrada, conta.saldoInicialEm),
      lte(interExtratos.dataEntrada, dataInicioPeriodo),
    ));

  let saldo = parseFloat(conta.saldoInicial);
  for (const t of transacoesAntes) {
    // Se a data de início do período coincidir com uma transação, ela
    // entra no cálculo do próprio dia (a coluna Saldo soma no acumulado
    // do dia), não no "saldo antes do período" — evita contar 2x.
    if (t.dataEntrada >= dataInicioPeriodo) continue;
    saldo += (t.tipoOperacao === "C" ? 1 : -1) * parseFloat(t.valor);
  }
  return saldo;
}

/**
 * Atualiza o saldo extraído do <LEDGERBAL> de um OFX importado. Só
 * sobrescreve se a nova data de apuração for igual ou mais recente que
 * a que já estava salva — evita um OFX antigo importado por engano
 * regredir o saldo mostrado.
 */
export async function atualizarSaldoImportado(contaId: number, saldo: string, dataApuracao: string) {
  const db = await getDb();
  if (!db) return;
  const conta = await getContaById(contaId);
  if (conta?.saldoImportadoEm && conta.saldoImportadoEm > dataApuracao) return;
  await db.update(contas).set({ saldoImportado: saldo, saldoImportadoEm: dataApuracao }).where(eq(contas.id, contaId));
}

export async function getContaById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contas).where(eq(contas.id, id)).limit(1);
  return result[0];
}

// ===== DRE: plano de contas e categorização automática =====

/**
 * Popula o plano de contas e as regras na primeira chamada (tabela
 * vazia) — auto-provisionado, mesmo espírito do getOrCreateContaInter,
 * sem precisar de INSERT manual pelo Manus.
 */
export async function ensureDreSeed() {
  const db = await getDb();
  if (!db) return;

  const existentes = await db.select({ id: dreCategorias.id }).from(dreCategorias).limit(1);
  if (existentes.length > 0) return;

  await db.insert(dreCategorias).values(DRE_CATEGORIAS_SEED);

  const categoriasInseridas = await db.select().from(dreCategorias);
  const categoriaIdPorNome = new Map(categoriasInseridas.map((c) => [c.nome, c.id]));

  const descricoesParaInserir = DRE_DESCRICOES_SEED
    .map((d) => {
      const dreCategoriaId = categoriaIdPorNome.get(d.categoriaNome);
      if (!dreCategoriaId) return null;
      return { nome: d.nome, dreCategoriaId, chave: d.chave ?? null };
    })
    .filter((d): d is NonNullable<typeof d> => d !== null);

  if (descricoesParaInserir.length > 0) {
    await db.insert(dreDescricoes).values(descricoesParaInserir);
  }

  const descricoesInseridas = await db.select().from(dreDescricoes);
  const descricaoIdPorNome = new Map(descricoesInseridas.map((d) => [d.nome, d.id]));

  const regrasParaInserir = DRE_REGRAS_SEED
    .map((r) => {
      const dreDescricaoId = descricaoIdPorNome.get(r.descricaoNome);
      if (!dreDescricaoId) return null;
      return {
        padrao: r.padrao,
        dreDescricaoId,
        origem: "seed" as const,
        valorMin: r.valorMin?.toFixed(2),
        valorMax: r.valorMax?.toFixed(2),
        alertaSeRepetirNoMes: r.alertaSeRepetirNoMes ? ("true" as const) : ("false" as const),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (regrasParaInserir.length > 0) {
    await db.insert(dreRegras).values(regrasParaInserir);
  }
}

export async function listDreCategorias() {
  await ensureDreSeed();
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dreCategorias).orderBy(dreCategorias.secao, dreCategorias.ordem);
}

/**
 * Categoria nova no plano de contas — só inclusão (editar/excluir uma
 * categoria existente mexe com histórico já categorizado, fica de fora
 * por segurança).
 */
export async function criarDreCategoria(nome: string, secao: string) {
  const db = await getDb();
  if (!db) return undefined;
  const maxOrdem = await db.select({ ordem: dreCategorias.ordem }).from(dreCategorias)
    .where(eq(dreCategorias.secao, secao as any)).orderBy(desc(dreCategorias.ordem)).limit(1);
  const proximaOrdem = (maxOrdem[0]?.ordem ?? 0) + 1;
  const result = await db.insert(dreCategorias).values({ nome, secao: secao as any, ordem: proximaOrdem }).$returningId();
  return result[0]?.id;
}

/**
 * Edita nome/seção de uma categoria já existente — não mexe em
 * Descrições/lançamentos ligados a ela (continuam pelo mesmo id).
 */
export async function atualizarDreCategoria(id: number, dados: { nome?: string; secao?: string }) {
  const db = await getDb();
  if (!db) return;
  await db.update(dreCategorias).set(dados as any).where(eq(dreCategorias.id, id));
}

export async function listDreDescricoes() {
  await ensureDreSeed();
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: dreDescricoes.id,
    nome: dreDescricoes.nome,
    dreCategoriaId: dreDescricoes.dreCategoriaId,
    categoriaNome: dreCategorias.nome,
    chave: dreDescricoes.chave,
    competencia: dreDescricoes.competencia,
  })
    .from(dreDescricoes)
    .innerJoin(dreCategorias, eq(dreDescricoes.dreCategoriaId, dreCategorias.id))
    .orderBy(dreCategorias.nome, dreDescricoes.nome);
}

export async function listDreDescricoesPorCategoria(dreCategoriaId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dreDescricoes).where(eq(dreDescricoes.dreCategoriaId, dreCategoriaId)).orderBy(dreDescricoes.nome);
}

/**
 * Descrição nova dentro de uma categoria existente — usada tanto pela
 * tela de Parâmetros quanto pelo modal "criar nova descrição" ao
 * categorizar um lançamento em Extratos.
 */
export async function criarDreDescricao(nome: string, dreCategoriaId: number, competencia?: "mes_lancamento" | "mes_anterior") {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(dreDescricoes).values({ nome, dreCategoriaId, competencia }).$returningId();
  return result[0]?.id;
}

export async function atualizarDreDescricao(id: number, dados: { nome?: string; dreCategoriaId?: number; competencia?: "mes_lancamento" | "mes_anterior" }) {
  const db = await getDb();
  if (!db) return;
  await db.update(dreDescricoes).set(dados).where(eq(dreDescricoes.id, id));
}

export interface RelatorioExclusaoDescricao {
  nome: string;
  regrasRemovidas: number;
  extratosAfetados: number;
  adquirenteAfetados: number;
}

/**
 * Exclui uma Descrição — lançamentos já categorizados com ela (extrato
 * e adquirente) voltam pra "Pendente"/sem descrição, e as regras que
 * apontavam pra ela são removidas junto (não faz sentido uma regra
 * apontando pra uma Descrição que não existe mais). Retorna quantos
 * itens de cada tipo foram afetados, pro relatório na tela.
 */
export async function excluirDreDescricao(id: number): Promise<RelatorioExclusaoDescricao> {
  const vazio = { nome: "", regrasRemovidas: 0, extratosAfetados: 0, adquirenteAfetados: 0 };
  const db = await getDb();
  if (!db) return vazio;

  const [descricao] = await db.select().from(dreDescricoes).where(eq(dreDescricoes.id, id)).limit(1);
  if (!descricao) return vazio;
  if (descricao.chave !== null) {
    throw new Error(`"${descricao.nome}" é usada internamente pelo sistema (Comanda Recepção / categorização automática) e não pode ser excluída.`);
  }

  const extratosAtingidos = await db.select({ id: interExtratos.id }).from(interExtratos).where(eq(interExtratos.dreDescricaoId, id));
  const adquirenteAtingidos = await db.select({ id: adquirenteVendas.id }).from(adquirenteVendas).where(eq(adquirenteVendas.dreDescricaoId, id));
  const regrasAtingidas = await db.select({ id: dreRegras.id }).from(dreRegras).where(eq(dreRegras.dreDescricaoId, id));

  if (extratosAtingidos.length > 0) {
    await db.update(interExtratos).set({ dreDescricaoId: null, categorizacaoStatus: "pendente" }).where(eq(interExtratos.dreDescricaoId, id));
  }
  if (adquirenteAtingidos.length > 0) {
    await db.update(adquirenteVendas).set({ dreDescricaoId: null }).where(eq(adquirenteVendas.dreDescricaoId, id));
  }
  if (regrasAtingidas.length > 0) {
    await db.delete(dreRegras).where(eq(dreRegras.dreDescricaoId, id));
  }
  await db.delete(dreDescricoes).where(eq(dreDescricoes.id, id));

  return {
    nome: descricao.nome,
    regrasRemovidas: regrasAtingidas.length,
    extratosAfetados: extratosAtingidos.length,
    adquirenteAfetados: adquirenteAtingidos.length,
  };
}

export interface RelatorioExclusaoCategoria extends RelatorioExclusaoDescricao {
  descricoesRemovidas: number;
}

/**
 * Exclui uma Categoria — em cascata, exclui (via excluirDreDescricao)
 * todas as Descrições que pertencem a ela, revertendo pra "Pendente"
 * tudo que estava categorizado com alguma delas. Bloqueia se qualquer
 * Descrição da categoria tiver uma chave (uso interno do sistema).
 */
export async function excluirDreCategoria(id: number): Promise<RelatorioExclusaoCategoria> {
  const vazio = { nome: "", descricoesRemovidas: 0, regrasRemovidas: 0, extratosAfetados: 0, adquirenteAfetados: 0 };
  const db = await getDb();
  if (!db) return vazio;

  const [categoria] = await db.select().from(dreCategorias).where(eq(dreCategorias.id, id)).limit(1);
  if (!categoria) return vazio;

  const descricoesDaCategoria = await db.select().from(dreDescricoes).where(eq(dreDescricoes.dreCategoriaId, id));
  const protegida = descricoesDaCategoria.find((d) => d.chave !== null);
  if (protegida) {
    throw new Error(`Não dá pra excluir "${categoria.nome}" — a descrição "${protegida.nome}" dentro dela é usada internamente pelo sistema.`);
  }

  let regrasRemovidas = 0;
  let extratosAfetados = 0;
  let adquirenteAfetados = 0;
  for (const d of descricoesDaCategoria) {
    const relatorio = await excluirDreDescricao(d.id);
    regrasRemovidas += relatorio.regrasRemovidas;
    extratosAfetados += relatorio.extratosAfetados;
    adquirenteAfetados += relatorio.adquirenteAfetados;
  }

  await db.delete(dreCategorias).where(eq(dreCategorias.id, id));

  return {
    nome: categoria.nome,
    descricoesRemovidas: descricoesDaCategoria.length,
    regrasRemovidas,
    extratosAfetados,
    adquirenteAfetados,
  };
}

async function resolverDescricaoIdPorChave(chave: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const linha = await db.select({ id: dreDescricoes.id }).from(dreDescricoes).where(eq(dreDescricoes.chave, chave)).limit(1);
  return linha[0]?.id ?? null;
}

export interface DadosDreRegra {
  padrao: string;
  dreDescricaoId: number;
  valorMin?: string;
  valorMax?: string;
  alertaSeRepetirNoMes?: boolean;
}

/**
 * Todas as regras (inclusive inativas) com o nome da descrição e da
 * categoria já resolvidos — pra tela de gerenciamento em Parâmetros.
 */
export async function listDreRegrasCompleto() {
  await ensureDreSeed();
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: dreRegras.id,
    padrao: dreRegras.padrao,
    dreDescricaoId: dreRegras.dreDescricaoId,
    descricaoNome: dreDescricoes.nome,
    dreCategoriaId: dreDescricoes.dreCategoriaId,
    categoriaNome: dreCategorias.nome,
    valorMin: dreRegras.valorMin,
    valorMax: dreRegras.valorMax,
    alertaSeRepetirNoMes: dreRegras.alertaSeRepetirNoMes,
    origem: dreRegras.origem,
    ativa: dreRegras.ativa,
  })
    .from(dreRegras)
    .innerJoin(dreDescricoes, eq(dreRegras.dreDescricaoId, dreDescricoes.id))
    .innerJoin(dreCategorias, eq(dreDescricoes.dreCategoriaId, dreCategorias.id))
    .orderBy(dreDescricoes.nome, dreRegras.padrao);
}

export async function criarDreRegra(dados: DadosDreRegra) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(dreRegras).values({
    padrao: dados.padrao,
    dreDescricaoId: dados.dreDescricaoId,
    valorMin: dados.valorMin,
    valorMax: dados.valorMax,
    alertaSeRepetirNoMes: dados.alertaSeRepetirNoMes ? "true" : "false",
    origem: "manual",
  }).$returningId();
  return result[0]?.id;
}

export async function atualizarDreRegra(id: number, dados: Partial<DadosDreRegra>) {
  const db = await getDb();
  if (!db) return;
  const { alertaSeRepetirNoMes, ...resto } = dados;
  await db.update(dreRegras).set({
    ...resto,
    ...(alertaSeRepetirNoMes !== undefined ? { alertaSeRepetirNoMes: alertaSeRepetirNoMes ? "true" as const : "false" as const } : {}),
  }).where(eq(dreRegras.id, id));
}

export async function ativarDesativarDreRegra(id: number, ativa: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(dreRegras).set({ ativa: ativa ? "true" : "false" }).where(eq(dreRegras.id, id));
}

/**
 * Apaga um padrão específico — diferente de desativar, some de vez.
 * Não mexe em lançamentos já categorizados (o dreDescricaoId fica onde
 * está); só deixa de existir como candidato pra bater em novas
 * transações.
 */
export async function excluirDreRegra(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(dreRegras).where(eq(dreRegras.id, id));
}

/**
 * Regras ativas com o id da descrição já resolvido — buscar uma vez e
 * reusar num loop de importação em lote, em vez de uma query por
 * transação.
 */
export async function listRegrasParaMatch(): Promise<(RegraMatch & { dreDescricaoId: number; alertaSeRepetirNoMes: boolean })[]> {
  await ensureDreSeed();
  const db = await getDb();
  if (!db) return [];
  const linhas = await db.select({
    padrao: dreRegras.padrao,
    descricaoNome: dreDescricoes.nome,
    dreDescricaoId: dreRegras.dreDescricaoId,
    valorMin: dreRegras.valorMin,
    valorMax: dreRegras.valorMax,
    alertaSeRepetirNoMes: dreRegras.alertaSeRepetirNoMes,
  })
    .from(dreRegras)
    .innerJoin(dreDescricoes, eq(dreRegras.dreDescricaoId, dreDescricoes.id))
    .where(eq(dreRegras.ativa, "true"));

  return linhas.map((r) => ({
    ...r,
    valorMin: r.valorMin !== null ? parseFloat(r.valorMin) : null,
    valorMax: r.valorMax !== null ? parseFloat(r.valorMax) : null,
    alertaSeRepetirNoMes: r.alertaSeRepetirNoMes === "true",
  }));
}

export interface DadosParaCategorizar {
  unidadeId: number;
  contaId: number;
  dataEntrada: string; // AAAA-MM-DD
  tipoTransacao?: string | null;
  titulo?: string | null;
  descricao?: string | null;
  valor: number; // sempre positivo
  cpfCnpjOrigem?: string | null;
  cpfCnpjDestino?: string | null;
  // origem/tipoOperacao habilitam os casos determinísticos abaixo
  // (Caixa Físico, liquidação Mercado Pago) — sem eles, cai direto na
  // regra de texto/valor de sempre.
  origem?: string | null;
  tipoOperacao?: "D" | "C" | null;
}

/**
 * Ponto único de categorização automática — usado no import (sync,
 * CSV, PDF, OFX) e no reprocessamento de pendentes. Ordem de
 * prioridade:
 * 1) origem "caixa_fisico" e crédito = "Receita em Espécie" direto, sem
 *    precisar de regra de texto — toda entrada do Caixa Físico é
 *    dinheiro em espécie por definição. Se o valor for R$0,00 (dia sem
 *    movimento), confirma direto — não tem julgamento contábil nenhum
 *    a fazer aqui, é sempre a mesma coisa, então pedir 1 clique por dia
 *    só vira trabalho manual repetitivo (confirmado pelo usuário em
 *    2026-08-12: "se for na conta caixa e valor = 0 pode considerar
 *    Confirmado automaticamente" — critério exato, não é heurística);
 * 2) CNPJ de origem/destino batendo com uma conta cadastrada (de
 *    qualquer unidade) = transferência bancária real entre contas —
 *    critério exato (CNPJ cadastrado), roda antes de qualquer regra de
 *    texto porque um texto genérico tipo "Pix recebido" não distingue
 *    isso de uma venda de verdade. Duas Descrições possíveis,
 *    decididas comparando a unidade dona do CNPJ da contraparte com a
 *    unidade do lançamento (nunca pelo texto/nome da contraparte
 *    sozinho — Agama transferindo pra Satori é uma coisa, Agama
 *    transferindo pra outra conta da própria Agama é outra, mesmo
 *    aparecendo o mesmo nome "Agama" no extrato):
 *    - unidade *diferente* → "Empréstimo entre Unidades" (chave
 *      CHAVE_TRANSACAO_ENTRE_UNIDADES) — ao confirmar
 *      (`confirmarSugestao`/`categorizarManual`) gera 1 linha em
 *      `transacoes_entre_unidades`;
 *    - unidade *igual* → "Transf. contas mesmo CNPJ" (chave
 *      CHAVE_TRANSFERENCIA_MESMO_CNPJ) — só remanejo interno entre duas
 *      contas da mesma empresa, sem efeito nenhum entre unidades.
 *    Nunca confirma sozinho (1 clique, como toda sugestão);
 * 3) regra de texto/valor (como sempre foi).
 * Se a regra tiver alertaSeRepetirNoMes e já existir outra transação
 * da mesma descrição na mesma conta no mesmo mês, marca um aviso (não
 * bloqueia, só avisa).
 *
 * Removida em 2026-08-12 (a pedido do usuário, "vamos testar só com
 * padrões"): a exclusão automática de origem "mercadopago" — o Mercado
 * Pago deixou de ser só liquidação de adquirente (hoje recebe outros
 * tipos de entrada também), então excluir tudo incondicionalmente
 * virou incorreto. Continua removida hoje (Mercado Pago só sai pra
 * conta Inter correspondente, então já funciona bem só com padrão de
 * texto — sem ambiguidade de unidade pra resolver por CNPJ).
 *
 * O item 2 (CNPJ de conta própria) tinha sido removido junto nessa
 * mesma decisão e foi *reintroduzido* em 2026-09-09, mas agora
 * corretamente: antes era "todo CNPJ de conta própria = exclui do
 * DRE", sem separar mesma unidade de unidade diferente — aí um Pix da
 * Satori caindo na conta da Agama (empréstimo real) e um Pix da Agama
 * caindo numa conta da própria Agama (remanejo interno) tomavam a
 * mesma Descrição, quando são coisas bem diferentes. Agora as duas
 * viram sugestões separadas (ver acima), então não recai no mesmo
 * problema de 2026-08-12.
 */
export async function categorizarTransacaoAutomaticamente(
  dados: DadosParaCategorizar,
  regras: (RegraMatch & { dreDescricaoId: number; alertaSeRepetirNoMes: boolean })[],
  cnpjsPorUnidade: Map<string, number>,
  transacaoIdParaExcluirDoAlerta?: number,
): Promise<{ dreDescricaoId: number | null; categorizacaoStatus: "sugerida" | "pendente" | "confirmada"; alerta: string | null }> {
  if (dados.origem === "caixa_fisico" && dados.tipoOperacao === "C") {
    const especieId = await resolverDescricaoIdPorChave(CHAVE_RECEITA_ESPECIE);
    if (especieId) {
      return { dreDescricaoId: especieId, categorizacaoStatus: dados.valor === 0 ? "confirmada" : "sugerida", alerta: null };
    }
  }

  const cnpjContraparte = [dados.cpfCnpjOrigem, dados.cpfCnpjDestino]
    .map((c) => c?.replace(/\D/g, ""))
    .find((c): c is string => !!c && cnpjsPorUnidade.has(c));
  if (cnpjContraparte) {
    const unidadeContraparte = cnpjsPorUnidade.get(cnpjContraparte)!;
    const chave = unidadeContraparte === dados.unidadeId ? CHAVE_TRANSFERENCIA_MESMO_CNPJ : CHAVE_TRANSACAO_ENTRE_UNIDADES;
    const descricaoId = await resolverDescricaoIdPorChave(chave);
    if (descricaoId) {
      return { dreDescricaoId: descricaoId, categorizacaoStatus: "sugerida", alerta: null };
    }
  }

  const texto = `${dados.tipoTransacao ?? ""} ${dados.titulo ?? ""} ${dados.descricao ?? ""}`;
  const descricaoNome = sugerirDescricaoNome(texto, dados.valor, regras);
  if (!descricaoNome) return { dreDescricaoId: null, categorizacaoStatus: "pendente", alerta: null };

  const regra = regras.find((r) => r.descricaoNome === descricaoNome && texto.toLowerCase().includes(r.padrao.toLowerCase()));
  const dreDescricaoId = regra?.dreDescricaoId;
  if (!dreDescricaoId) return { dreDescricaoId: null, categorizacaoStatus: "pendente", alerta: null };

  let alerta: string | null = null;
  if (regra?.alertaSeRepetirNoMes) {
    const db = await getDb();
    if (db) {
      const mesPrefixo = dados.dataEntrada.slice(0, 7); // AAAA-MM
      const condicoes = [
        eq(interExtratos.contaId, dados.contaId),
        eq(interExtratos.dreDescricaoId, dreDescricaoId),
        like(interExtratos.dataEntrada, `${mesPrefixo}%`),
      ];
      if (transacaoIdParaExcluirDoAlerta) condicoes.push(ne(interExtratos.id, transacaoIdParaExcluirDoAlerta));
      const outras = await db.select({ id: interExtratos.id }).from(interExtratos).where(and(...condicoes)).limit(1);
      if (outras.length > 0) {
        alerta = `Já existe outro lançamento de "${descricaoNome}" nesta conta em ${mesPrefixo} — confira se não é duplicidade.`;
      }
    }
  }

  return { dreDescricaoId, categorizacaoStatus: "sugerida", alerta };
}

/**
 * Reaplica as regras atuais em toda transação ainda não confirmada
 * ("pendente" ou "sugerida"). Necessário porque a categorização só
 * roda no momento do import ou quando uma regra nova é aprendida —
 * toda vez que uma regra muda (nova, editada, removida), as linhas
 * antigas ficam com a sugestão velha até alguém rodar isso. Nunca mexe
 * em linha "confirmada" (decisão humana).
 *
 * Resultado vira "sugerida" (não "confirmada") — é o sistema aplicando
 * uma regra, não uma decisão humana; ainda precisa de 1 clique de
 * confirmação. Se nenhuma regra bater mais numa linha que estava
 * "sugerida" (ex.: regra removida/alterada), volta pra "pendente" de
 * verdade em vez de ficar com uma sugestão que não existe mais.
 *
 * contaId/dataInicio/dataFim são opcionais mas devem ser passados pela
 * tela sempre que o botão for clicado dentro de uma aba/período
 * específico — sem isso a função reprocessa a unidade inteira, em
 * qualquer data, o que já causou confusão real: usuário via "14
 * sugerida(s)" na aba Mercado Pago do mês vigente, clicava, e o
 * resultado dizia "1537 categorizada(s)" porque pegou o histórico
 * inteiro de todas as contas.
 */
export async function reprocessarPendentes(
  unidadeId: number,
  contaId?: number,
  dataInicio?: string,
  dataFim?: string,
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const regras = await listRegrasParaMatch();
  const cnpjsPorUnidade = await listCnpjsPorUnidade();

  const condicoes = [eq(interExtratos.unidadeId, unidadeId), ne(interExtratos.categorizacaoStatus, "confirmada")];
  if (contaId !== undefined) condicoes.push(eq(interExtratos.contaId, contaId));
  if (dataInicio) condicoes.push(gte(interExtratos.dataEntrada, dataInicio));
  if (dataFim) condicoes.push(lte(interExtratos.dataEntrada, dataFim));

  const naoConfirmadas = await db.select().from(interExtratos).where(and(...condicoes));

  let atualizados = 0;
  for (const t of naoConfirmadas) {
    const resultado = await categorizarTransacaoAutomaticamente({
      unidadeId: t.unidadeId,
      contaId: t.contaId ?? 0,
      dataEntrada: t.dataEntrada,
      tipoTransacao: t.tipoTransacao,
      titulo: t.titulo,
      descricao: t.descricao,
      valor: parseFloat(t.valor),
      cpfCnpjOrigem: t.cpfCnpjOrigem,
      cpfCnpjDestino: t.cpfCnpjDestino,
      origem: t.origem,
      tipoOperacao: t.tipoOperacao,
    }, regras, cnpjsPorUnidade, t.id);
    if (!resultado.dreDescricaoId) {
      if (t.categorizacaoStatus !== "pendente") {
        await db.update(interExtratos).set({
          dreDescricaoId: null,
          categorizacaoStatus: "pendente",
          alerta: null,
        }).where(eq(interExtratos.id, t.id));
        atualizados++;
      }
      continue;
    }
    await db.update(interExtratos).set({
      dreDescricaoId: resultado.dreDescricaoId,
      categorizacaoStatus: resultado.categorizacaoStatus,
      alerta: resultado.alerta,
    }).where(eq(interExtratos.id, t.id));
    atualizados++;
  }
  return atualizados;
}

/**
 * Decisão humana: usuário escolhe (ou corrige) a descrição de uma
 * transação pelo seletor (a categoria vem por herança da descrição).
 * Marca como "confirmada" direto, sem criar ou alterar regras de match.
 * Padrões de extrato devem ser cadastrados manualmente na administração,
 * evitando que uma contraparte genérica contamine categorizações futuras.
 */
export async function categorizarManual(transacaoId: number, dreDescricaoId: number | null): Promise<{ regraAprendida: boolean }> {
  const db = await getDb();
  if (!db) return { regraAprendida: false };

  if (dreDescricaoId === null) {
    await db.update(interExtratos).set({ dreDescricaoId: null, categorizacaoStatus: "pendente" }).where(eq(interExtratos.id, transacaoId));
    return { regraAprendida: false };
  }

  const [transacao] = await db.select().from(interExtratos).where(eq(interExtratos.id, transacaoId)).limit(1);
  await db.update(interExtratos).set({ dreDescricaoId, categorizacaoStatus: "confirmada" }).where(eq(interExtratos.id, transacaoId));
  if (transacao) await registrarTransferenciaRealSeAplicavel(db, transacao, dreDescricaoId);
  return { regraAprendida: false };
}

/**
 * Se a Descrição final for "Transação entre Unidades" (chave
 * CHAVE_TRANSACAO_ENTRE_UNIDADES) E a transação for de saída (D — o
 * dinheiro saiu desta unidade rumo à outra), gera 1 linha em
 * `transacoes_entre_unidades` automaticamente. Só no lado "D" de
 * propósito: a mesma transferência real também aparece como "C" no
 * extrato da unidade que recebeu (sincronizado à parte) — gerar dos
 * dois lados duplicaria o valor no saldo; o lado "D" já é o suficiente
 * pra registrar a dívida (quem mandou = credora, quem recebeu =
 * devedora).
 *
 * Compartilhado por confirmarSugestao E categorizarManual — achado real
 * 2026-09-08: uma transação categorizada "Transação entre Unidades" pelo
 * seletor manual (categorizarManual) nunca virava linha aqui, porque essa
 * geração só existia dentro de confirmarSugestao (o "confirmar sugestão
 * automática" de 1 clique). Duas ações diferentes chegam no mesmo estado
 * final (dreDescricaoId + confirmada) e as duas precisam do mesmo efeito.
 * Verifica se já existe linha pra essa transação antes de inserir —
 * categorizarManual pode ser chamada mais de uma vez na mesma transação
 * (recategorizando), sem o guard de "só se sugerida" que confirmarSugestao
 * já tem naturalmente.
 */
async function registrarTransferenciaRealSeAplicavel(
  db: DbConectado,
  transacao: typeof interExtratos.$inferSelect,
  dreDescricaoIdFinal: number | null,
): Promise<void> {
  if (transacao.tipoOperacao !== "D") return;
  const transacaoEntreUnidadesId = await resolverDescricaoIdPorChave(CHAVE_TRANSACAO_ENTRE_UNIDADES);
  if (!transacaoEntreUnidadesId || dreDescricaoIdFinal !== transacaoEntreUnidadesId) return;
  const cnpjsPorUnidade = await listCnpjsPorUnidade();
  const cnpjContraparte = [transacao.cpfCnpjOrigem, transacao.cpfCnpjDestino]
    .map((c) => c?.replace(/\D/g, ""))
    .find((c): c is string => !!c && cnpjsPorUnidade.has(c) && cnpjsPorUnidade.get(c) !== transacao.unidadeId);
  const unidadeDevedora = cnpjContraparte ? cnpjsPorUnidade.get(cnpjContraparte) : undefined;
  if (unidadeDevedora === undefined) return;

  const [existente] = await db.select({ id: transacoesEntreUnidades.id }).from(transacoesEntreUnidades)
    .where(eq(transacoesEntreUnidades.interExtratoId, transacao.id)).limit(1);
  if (existente) return;

  await db.insert(transacoesEntreUnidades).values({
    data: transacao.dataEntrada,
    tipo: "transferencia_real",
    unidadeCredora: transacao.unidadeId,
    unidadeDevedora,
    valor: transacao.valor,
    descricao: transacao.titulo || "Transferência entre unidades",
    interExtratoId: transacao.id,
  });
}

/**
 * Confirma uma sugestão automática sem trocar a categoria — o "tá
 * certo" de 1 clique. Só age em linha "sugerida"; ignora silenciosamente
 * qualquer outro estado (evita confirmar algo que já não é sugestão).
 */
export async function confirmarSugestao(transacaoId: number) {
  const db = await getDb();
  if (!db) return;

  const [transacao] = await db.select().from(interExtratos)
    .where(and(eq(interExtratos.id, transacaoId), eq(interExtratos.categorizacaoStatus, "sugerida")))
    .limit(1);
  if (!transacao) return;

  await db.update(interExtratos).set({ categorizacaoStatus: "confirmada" }).where(eq(interExtratos.id, transacaoId));
  await registrarTransferenciaRealSeAplicavel(db, transacao, transacao.dreDescricaoId);
}

/**
 * confirmarSugestao em lote — usada pela seleção em massa da tela de
 * Contas (marca várias sugestões que bateram certo e confirma todas
 * de uma vez, sem trocar a categoria de nenhuma). Ignora silenciosamente
 * qualquer id que não esteja mais "sugerida" (ex.: usuário confirmou à
 * mão antes de aplicar o lote) — mesmo comportamento no-op que
 * confirmarSugestao já tem pra 1 transação. Retorna quantas confirmou.
 */
export async function confirmarSugestoesEmMassa(transacaoIds: number[]): Promise<number> {
  const db = await getDb();
  if (!db || transacaoIds.length === 0) return 0;

  const transacoes = await db.select().from(interExtratos)
    .where(and(inArray(interExtratos.id, transacaoIds), eq(interExtratos.categorizacaoStatus, "sugerida")));
  if (transacoes.length === 0) return 0;

  await db.update(interExtratos).set({ categorizacaoStatus: "confirmada" })
    .where(inArray(interExtratos.id, transacoes.map((t) => t.id)));

  for (const transacao of transacoes) {
    await registrarTransferenciaRealSeAplicavel(db, transacao, transacao.dreDescricaoId);
  }
  return transacoes.length;
}

// ===== Split de lançamento =====

export interface LinhaSplitInput {
  dreDescricaoId: number;
  valor: number;
  unidadeId: number;
  observacao?: string;
  /** "AAAA-MM" — mês de competência dessa linha pro DRE. Omitido = mês do dataEntrada da transação-mãe (comportamento de sempre). */
  mesReferencia?: string;
}

/**
 * Todos os splits das transações dentro de um período/conta — mesmo
 * escopo de `listInterExtratos`, carregado de uma vez pra tela de
 * Extratos montar o mapa "quais linhas têm split" sem N+1 query.
 */
export async function listSplitsPorPeriodo(unidadeId: number, dataInicio: string, dataFim: string, contaId?: number) {
  const db = await getDb();
  if (!db) return [];
  const condicoes = [
    eq(interExtratos.unidadeId, unidadeId),
    gte(interExtratos.dataEntrada, dataInicio),
    lte(interExtratos.dataEntrada, dataFim),
  ];
  if (contaId !== undefined) condicoes.push(eq(interExtratos.contaId, contaId));
  return db.select({
    id: lancamentoSplits.id,
    interExtratoId: lancamentoSplits.interExtratoId,
    dreDescricaoId: lancamentoSplits.dreDescricaoId,
    valor: lancamentoSplits.valor,
    unidadeId: lancamentoSplits.unidadeId,
    observacao: lancamentoSplits.observacao,
    mesReferencia: lancamentoSplits.mesReferencia,
  })
    .from(lancamentoSplits)
    .innerJoin(interExtratos, eq(lancamentoSplits.interExtratoId, interExtratos.id))
    .where(and(...condicoes));
}

/**
 * Divide uma transação em N linhas, cada uma com sua Descrição (e
 * unidade dona da parte). Valida que a soma bate com o valor da
 * transação (tolerância de 1 centavo) antes de gravar — nunca salva
 * parcial nem arredonda sobra silenciosamente. Substitui qualquer
 * split anterior daquela transação (delete-all-insert-set, mesmo
 * espírito do reprocessamento: o conjunto novo é sempre a verdade).
 * Dividir é decisão humana — mesma régua de `categorizarManual`, marca
 * direto como "confirmada".
 *
 * Linha com `unidadeId` diferente da unidade da transação = rateio de
 * despesa entre unidades — gera 1 linha em `transacoes_entre_unidades`
 * (a unidade que pagou de verdade vira credora daquela parte).
 */
export async function salvarSplits(interExtratoId: number, linhas: LinhaSplitInput[]): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (linhas.length === 0) throw new Error("Informe ao menos 1 linha de split.");

  const [transacao] = await db.select().from(interExtratos).where(eq(interExtratos.id, interExtratoId)).limit(1);
  if (!transacao) throw new Error("Transação não encontrada.");

  const somaLinhas = linhas.reduce((soma, l) => soma + l.valor, 0);
  const valorTransacao = parseFloat(transacao.valor);
  if (Math.abs(somaLinhas - valorTransacao) > 0.01) {
    throw new Error(`A soma das linhas (R$${somaLinhas.toFixed(2)}) não bate com o valor da transação (R$${valorTransacao.toFixed(2)}).`);
  }

  const splitsAntigos = await db.select({ id: lancamentoSplits.id }).from(lancamentoSplits)
    .where(eq(lancamentoSplits.interExtratoId, interExtratoId));
  if (splitsAntigos.length > 0) {
    await db.delete(transacoesEntreUnidades).where(inArray(transacoesEntreUnidades.lancamentoSplitId, splitsAntigos.map((s) => s.id)));
  }
  await db.delete(lancamentoSplits).where(eq(lancamentoSplits.interExtratoId, interExtratoId));

  const mesTransacao = transacao.dataEntrada.slice(0, 7);
  const idsInseridos = await db.insert(lancamentoSplits).values(linhas.map((l) => ({
    interExtratoId,
    dreDescricaoId: l.dreDescricaoId,
    valor: l.valor.toFixed(2),
    unidadeId: l.unidadeId,
    observacao: l.observacao?.trim() || null,
    mesReferencia: l.mesReferencia?.trim() || mesTransacao,
  }))).$returningId();

  const linhasCrossUnidade = linhas
    .map((l, i) => ({ ...l, splitId: idsInseridos[i]?.id }))
    .filter((l): l is typeof l & { splitId: number } => l.unidadeId !== transacao.unidadeId && l.splitId !== undefined);

  if (linhasCrossUnidade.length > 0) {
    const nomesDescricoes = new Map(
      (await db.select({ id: dreDescricoes.id, nome: dreDescricoes.nome }).from(dreDescricoes)).map((d) => [d.id, d.nome]),
    );
    await db.insert(transacoesEntreUnidades).values(linhasCrossUnidade.map((l) => ({
      data: transacao.dataEntrada,
      tipo: "rateio_despesa" as const,
      unidadeCredora: transacao.unidadeId,
      unidadeDevedora: l.unidadeId,
      valor: l.valor.toFixed(2),
      descricao: l.observacao?.trim() || nomesDescricoes.get(l.dreDescricaoId) || "Rateio de despesa",
      lancamentoSplitId: l.splitId,
    })));
  }

  await db.update(interExtratos).set({ dreDescricaoId: null, categorizacaoStatus: "confirmada" })
    .where(eq(interExtratos.id, interExtratoId));
}

/**
 * Remove o split (e qualquer rateio gerado por ele em
 * transacoes_entre_unidades) e devolve a transação pra "Pendente" —
 * volta a poder escolher uma Descrição única normalmente.
 */
export async function excluirSplits(interExtratoId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const splits = await db.select({ id: lancamentoSplits.id }).from(lancamentoSplits)
    .where(eq(lancamentoSplits.interExtratoId, interExtratoId));
  if (splits.length > 0) {
    await db.delete(transacoesEntreUnidades).where(inArray(transacoesEntreUnidades.lancamentoSplitId, splits.map((s) => s.id)));
  }
  await db.delete(lancamentoSplits).where(eq(lancamentoSplits.interExtratoId, interExtratoId));
  await db.update(interExtratos).set({ dreDescricaoId: null, categorizacaoStatus: "pendente" })
    .where(eq(interExtratos.id, interExtratoId));
}

// ===== Receita x Despesa / DRE =====

export interface DadosLancamentoManualDre {
  unidadeId: number;
  dreDescricaoId: number;
  mesReferencia: string; // "AAAA-MM"
  valor: number;
  observacao?: string;
  criadoPor?: string;
}

/**
 * Lançamento manual no DRE (só competência, ver comentário em
 * drizzle/schema.ts) — pra valor que afeta o resultado sem transação
 * bancária por trás, ex.: encontro de contas com franqueador (royalties
 * abatidos contra vouchers a receber).
 */
export async function criarLancamentoManualDre(dados: DadosLancamentoManualDre) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(lancamentosManuaisDre).values({
    unidadeId: dados.unidadeId,
    dreDescricaoId: dados.dreDescricaoId,
    mesReferencia: dados.mesReferencia,
    valor: dados.valor.toFixed(2),
    observacao: dados.observacao?.trim() || null,
    criadoPor: dados.criadoPor ?? null,
  }).$returningId();
  return result[0]?.id;
}

export async function listLancamentosManuaisDre(unidadeId: number, mesInicio: string, mesFim: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: lancamentosManuaisDre.id,
    dreDescricaoId: lancamentosManuaisDre.dreDescricaoId,
    dreDescricaoNome: dreDescricoes.nome,
    mesReferencia: lancamentosManuaisDre.mesReferencia,
    valor: lancamentosManuaisDre.valor,
    observacao: lancamentosManuaisDre.observacao,
    criadoPor: lancamentosManuaisDre.criadoPor,
    createdAt: lancamentosManuaisDre.createdAt,
  })
    .from(lancamentosManuaisDre)
    .innerJoin(dreDescricoes, eq(lancamentosManuaisDre.dreDescricaoId, dreDescricoes.id))
    .where(and(
      eq(lancamentosManuaisDre.unidadeId, unidadeId),
      gte(lancamentosManuaisDre.mesReferencia, mesInicio),
      lte(lancamentosManuaisDre.mesReferencia, mesFim),
    ))
    .orderBy(desc(lancamentosManuaisDre.mesReferencia), desc(lancamentosManuaisDre.id));
}

export async function excluirLancamentoManualDre(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(lancamentosManuaisDre).where(eq(lancamentosManuaisDre.id, id));
}

export interface LinhaDreAgregada {
  dreDescricaoId: number;
  dreDescricaoNome: string;
  dreCategoriaId: number;
  dreCategoriaNome: string;
  secao: DreSecao;
  ordem: number;
  valor: number;
}

/**
 * Agregação Receita x Despesa / DRE — soma inter_extratos (sem split) +
 * lancamento_splits (linhas de split) + adquirente_vendas (vendas de
 * maquininha, valor BRUTO) por Descrição, num período de meses, no
 * regime pedido. Exclui sempre secao="excluido" (transferência entre
 * contas/unidades — não é P&L de verdade).
 *
 * adquirente_vendas entra pelo valor BRUTO (não o valorLiquido) porque
 * é essa a Descrição real de receita ("Receita Cartão de Débito/
 * Crédito") — o depósito líquido correspondente que chega no banco via
 * inter_extratos é categorizado à parte como "Receita Líq. Cartão de
 * Débito/Crédito", sempre secao="excluido" (ver dreCategorizacao.ts),
 * exatamente pra não contar a mesma venda 2x aqui. Faltava essa fonte
 * na agregação (só lia inter_extratos/lancamento_splits) — achado
 * 2026-09-09: DRE mostrando Receita Bruta bem menor que o real porque
 * toda venda de cartão ficava de fora.
 *
 * CAIXA: sempre pela dataEntrada/dataHora da transação-mãe, split ou
 * não — nunca olha mesReferencia nem a competência da Descrição. Uma
 * licença anual rateada em 12 meses de competência ainda aparece
 * inteira, num mês só, aqui.
 *
 * COMPETÊNCIA: transação sem split usa o mês do dataEntrada/dataHora,
 * ajustado -1 mês se a Descrição dela tiver competencia="mes_anterior";
 * linha de split usa seu próprio mesReferencia direto (explícito sempre
 * vence a regra da Descrição — é uma decisão manual e pontual do
 * usuário). adquirente_vendas não tem split, só a regra da Descrição.
 */
export async function listDreAgregado(
  unidadeId: number,
  mesInicio: string, // "AAAA-MM"
  mesFim: string,
  regime: "caixa" | "competencia",
): Promise<LinhaDreAgregada[]> {
  const db = await getDb();
  if (!db) return [];

  const dataInicio = `${mesInicio}-01`;
  const dataFim = `${mesFim}-31`; // comparação de string "AAAA-MM-DD" — dia inválido num mês de 30 ainda ordena depois do último dia real

  const somasPorDescricao = new Map<number, number>();
  const somar = (id: number | null, valor: string | null) => {
    if (id === null || valor === null) return;
    somasPorDescricao.set(id, (somasPorDescricao.get(id) ?? 0) + parseFloat(valor));
  };

  if (regime === "caixa") {
    const semSplit = await db.select({ dreDescricaoId: interExtratos.dreDescricaoId, valor: interExtratos.valor })
      .from(interExtratos)
      .where(and(
        eq(interExtratos.unidadeId, unidadeId),
        gte(interExtratos.dataEntrada, dataInicio),
        lte(interExtratos.dataEntrada, dataFim),
        isNotNull(interExtratos.dreDescricaoId),
      ));
    for (const t of semSplit) somar(t.dreDescricaoId, t.valor);

    const splits = await db.select({ dreDescricaoId: lancamentoSplits.dreDescricaoId, valor: lancamentoSplits.valor })
      .from(lancamentoSplits)
      .innerJoin(interExtratos, eq(lancamentoSplits.interExtratoId, interExtratos.id))
      .where(and(
        eq(interExtratos.unidadeId, unidadeId),
        gte(interExtratos.dataEntrada, dataInicio),
        lte(interExtratos.dataEntrada, dataFim),
      ));
    for (const s of splits) somar(s.dreDescricaoId, s.valor);

    const vendas = await db.select({ dreDescricaoId: adquirenteVendas.dreDescricaoId, valor: adquirenteVendas.valorBruto })
      .from(adquirenteVendas)
      .where(and(
        eq(adquirenteVendas.unidadeId, unidadeId),
        gte(adquirenteVendas.dataHora, dataInicio),
        lte(adquirenteVendas.dataHora, `${dataFim} 23:59:59`),
        isNotNull(adquirenteVendas.dreDescricaoId),
      ));
    for (const v of vendas) somar(v.dreDescricaoId, v.valor);
  } else {
    // Janela ampliada em +1 mês no fim, pra pegar transação de mesFim+1
    // marcada "mes_anterior" que cai dentro do período de competência
    // pedido — filtra de verdade em JS depois de calcular o mês real de
    // cada uma.
    const dataFimAmpliada = `${mesSeguinte(mesFim)}-31`;
    const semSplit = await db.select({
      dreDescricaoId: interExtratos.dreDescricaoId,
      valor: interExtratos.valor,
      dataEntrada: interExtratos.dataEntrada,
      competencia: dreDescricoes.competencia,
    })
      .from(interExtratos)
      .innerJoin(dreDescricoes, eq(interExtratos.dreDescricaoId, dreDescricoes.id))
      .where(and(
        eq(interExtratos.unidadeId, unidadeId),
        gte(interExtratos.dataEntrada, dataInicio),
        lte(interExtratos.dataEntrada, dataFimAmpliada),
      ));
    for (const t of semSplit) {
      const mesTransacao = t.dataEntrada.slice(0, 7);
      const mesCompetencia = t.competencia === "mes_anterior" ? mesAnterior(mesTransacao) : mesTransacao;
      if (mesCompetencia >= mesInicio && mesCompetencia <= mesFim) somar(t.dreDescricaoId, t.valor);
    }

    const splits = await db.select({ dreDescricaoId: lancamentoSplits.dreDescricaoId, valor: lancamentoSplits.valor })
      .from(lancamentoSplits)
      .innerJoin(interExtratos, eq(lancamentoSplits.interExtratoId, interExtratos.id))
      .where(and(
        eq(interExtratos.unidadeId, unidadeId),
        gte(lancamentoSplits.mesReferencia, mesInicio),
        lte(lancamentoSplits.mesReferencia, mesFim),
      ));
    for (const s of splits) somar(s.dreDescricaoId, s.valor);

    const dataFimAmpliadaHora = `${mesSeguinte(mesFim)}-31 23:59:59`;
    const vendas = await db.select({
      dreDescricaoId: adquirenteVendas.dreDescricaoId,
      valor: adquirenteVendas.valorBruto,
      dataHora: adquirenteVendas.dataHora,
      competencia: dreDescricoes.competencia,
    })
      .from(adquirenteVendas)
      .innerJoin(dreDescricoes, eq(adquirenteVendas.dreDescricaoId, dreDescricoes.id))
      .where(and(
        eq(adquirenteVendas.unidadeId, unidadeId),
        gte(adquirenteVendas.dataHora, dataInicio),
        lte(adquirenteVendas.dataHora, dataFimAmpliadaHora),
      ));
    for (const v of vendas) {
      const mesVenda = v.dataHora.slice(0, 7);
      const mesCompetencia = v.competencia === "mes_anterior" ? mesAnterior(mesVenda) : mesVenda;
      if (mesCompetencia >= mesInicio && mesCompetencia <= mesFim) somar(v.dreDescricaoId, v.valor);
    }

    // Lançamento manual (ver drizzle/schema.ts) — só existe em
    // competência, por definição não circulou dinheiro real (caixa
    // nunca inclui isso).
    const manuais = await db.select({ dreDescricaoId: lancamentosManuaisDre.dreDescricaoId, valor: lancamentosManuaisDre.valor })
      .from(lancamentosManuaisDre)
      .where(and(
        eq(lancamentosManuaisDre.unidadeId, unidadeId),
        gte(lancamentosManuaisDre.mesReferencia, mesInicio),
        lte(lancamentosManuaisDre.mesReferencia, mesFim),
      ));
    for (const m of manuais) somar(m.dreDescricaoId, m.valor);
  }

  // Voucher site / Gympass-Totalpass: vêm do resumo MENSAL da planilha
  // Resumos (resumo_mensal_unidade), não de transação bancária — não
  // tem o que ratear em caixa/competência, o mês já é o mês certo nos
  // dois regimes (decisão do usuário 2026-09-10, ver comentário em
  // dreCategorizacao.ts).
  const resumosMensais = await db.select({
    voucherSite: resumoMensalUnidade.voucherSite,
    gympassTotalpass: resumoMensalUnidade.gympassTotalpass,
  }).from(resumoMensalUnidade).where(and(
    eq(resumoMensalUnidade.unidadeId, unidadeId),
    gte(resumoMensalUnidade.mesAno, mesInicio),
    lte(resumoMensalUnidade.mesAno, mesFim),
  ));
  if (resumosMensais.length > 0) {
    const idVoucher = await resolverDescricaoIdPorChave(CHAVE_RECEITA_VOUCHER_SITE);
    const idGympass = await resolverDescricaoIdPorChave(CHAVE_RECEITA_GYMPASS_TOTALPASS);
    for (const r of resumosMensais) {
      if (idVoucher) somar(idVoucher, r.voucherSite);
      if (idGympass) somar(idGympass, r.gympassTotalpass);
    }
  }

  if (somasPorDescricao.size === 0) return [];

  const descricoesInfo = await db.select({
    id: dreDescricoes.id,
    nome: dreDescricoes.nome,
    dreCategoriaId: dreDescricoes.dreCategoriaId,
    categoriaNome: dreCategorias.nome,
    secao: dreCategorias.secao,
    ordem: dreCategorias.ordem,
  })
    .from(dreDescricoes)
    .innerJoin(dreCategorias, eq(dreDescricoes.dreCategoriaId, dreCategorias.id))
    .where(inArray(dreDescricoes.id, Array.from(somasPorDescricao.keys())));

  return descricoesInfo
    .filter((d) => d.secao !== "excluido")
    .map((d) => ({
      dreDescricaoId: d.id,
      dreDescricaoNome: d.nome,
      dreCategoriaId: d.dreCategoriaId,
      dreCategoriaNome: d.categoriaNome,
      secao: d.secao,
      ordem: d.ordem,
      valor: somasPorDescricao.get(d.id) ?? 0,
    }))
    .sort((a, b) => a.ordem - b.ordem || a.dreCategoriaNome.localeCompare(b.dreCategoriaNome));
}

export interface LinhaDreLancamento {
  data: string; // "AAAA-MM-DD"
  titulo: string;
  valor: number; // sempre positivo, igual às fontes (o sinal é decidido pela seção na tela)
  origem: string;
  dreDescricaoNome: string;
  /** Chave estável da Descrição (null se a Descrição não tiver uma) — usada pra agrupar por forma de pagamento na tela. */
  dreDescricaoChave: string | null;
  /** "N/M" (ex.: "2/3") — só em venda de cartão de crédito via adquirente_vendas; null pra tudo mais, incluindo débito à vista (não tem parcela). */
  parcela: string | null;
  /** id em lancamentos_manuais_dre — só presente quando origem="manual" (permite excluir da tela); null pra tudo mais. */
  lancamentoManualId: number | null;
}

/**
 * Drill-down do DRE: lista os lançamentos individuais (de qualquer das
 * 3 fontes que listDreAgregado soma) que compõem uma Categoria, no
 * mesmo período/regime — usada pelo hover "detalhar" de cada Categoria
 * na tela de DRE. Mesmas regras de caixa/competência de listDreAgregado,
 * só que devolvendo linha a linha em vez de somado.
 */
export async function listDreLancamentosPorCategoria(
  unidadeId: number,
  mesInicio: string,
  mesFim: string,
  regime: "caixa" | "competencia",
  dreCategoriaId: number,
): Promise<LinhaDreLancamento[]> {
  const db = await getDb();
  if (!db) return [];

  const descricoesDaCategoria = await db.select({
    id: dreDescricoes.id,
    nome: dreDescricoes.nome,
    chave: dreDescricoes.chave,
    competencia: dreDescricoes.competencia,
  }).from(dreDescricoes).where(eq(dreDescricoes.dreCategoriaId, dreCategoriaId));
  if (descricoesDaCategoria.length === 0) return [];

  const idsDescricao = descricoesDaCategoria.map((d) => d.id);
  const nomePorId = new Map(descricoesDaCategoria.map((d) => [d.id, d.nome]));
  const chavePorId = new Map(descricoesDaCategoria.map((d) => [d.id, d.chave]));
  const competenciaPorId = new Map(descricoesDaCategoria.map((d) => [d.id, d.competencia]));

  const dataInicio = `${mesInicio}-01`;
  const dataFim = `${mesFim}-31`;
  const resultado: LinhaDreLancamento[] = [];

  if (regime === "caixa") {
    const semSplit = await db.select({
      dataEntrada: interExtratos.dataEntrada,
      titulo: interExtratos.titulo,
      descricao: interExtratos.descricao,
      valor: interExtratos.valor,
      origem: interExtratos.origem,
      dreDescricaoId: interExtratos.dreDescricaoId,
    }).from(interExtratos).where(and(
      eq(interExtratos.unidadeId, unidadeId),
      gte(interExtratos.dataEntrada, dataInicio),
      lte(interExtratos.dataEntrada, dataFim),
      inArray(interExtratos.dreDescricaoId, idsDescricao),
    ));
    for (const t of semSplit) {
      resultado.push({
        data: t.dataEntrada,
        titulo: t.titulo || t.descricao || "—",
        valor: parseFloat(t.valor),
        origem: t.origem ?? "inter",
        dreDescricaoNome: nomePorId.get(t.dreDescricaoId!) ?? "",
        dreDescricaoChave: chavePorId.get(t.dreDescricaoId!) ?? null,
        parcela: null,
        lancamentoManualId: null,
      });
    }

    const splits = await db.select({
      dataEntrada: interExtratos.dataEntrada,
      titulo: interExtratos.titulo,
      observacao: lancamentoSplits.observacao,
      valor: lancamentoSplits.valor,
      origem: interExtratos.origem,
      dreDescricaoId: lancamentoSplits.dreDescricaoId,
    }).from(lancamentoSplits)
      .innerJoin(interExtratos, eq(lancamentoSplits.interExtratoId, interExtratos.id))
      .where(and(
        eq(interExtratos.unidadeId, unidadeId),
        gte(interExtratos.dataEntrada, dataInicio),
        lte(interExtratos.dataEntrada, dataFim),
        inArray(lancamentoSplits.dreDescricaoId, idsDescricao),
      ));
    for (const s of splits) {
      resultado.push({
        data: s.dataEntrada,
        titulo: s.observacao || `${s.titulo || "Split"} (dividido)`,
        valor: parseFloat(s.valor),
        origem: s.origem ?? "inter",
        dreDescricaoNome: nomePorId.get(s.dreDescricaoId) ?? "",
        dreDescricaoChave: chavePorId.get(s.dreDescricaoId) ?? null,
        parcela: null,
        lancamentoManualId: null,
      });
    }

    const vendas = await db.select({
      dataHora: adquirenteVendas.dataHora,
      tipo: adquirenteVendas.tipo,
      bandeira: adquirenteVendas.bandeira,
      parcela: adquirenteVendas.parcela,
      valor: adquirenteVendas.valorBruto,
      adquirente: adquirenteVendas.adquirente,
      dreDescricaoId: adquirenteVendas.dreDescricaoId,
    }).from(adquirenteVendas).where(and(
      eq(adquirenteVendas.unidadeId, unidadeId),
      gte(adquirenteVendas.dataHora, dataInicio),
      lte(adquirenteVendas.dataHora, `${dataFim} 23:59:59`),
      inArray(adquirenteVendas.dreDescricaoId, idsDescricao),
    ));
    for (const v of vendas) {
      if (v.valor === null) continue;
      resultado.push({
        data: v.dataHora.slice(0, 10),
        titulo: [v.tipo, v.bandeira].filter(Boolean).join(" - ") || "Venda maquininha",
        valor: parseFloat(v.valor),
        origem: v.adquirente,
        dreDescricaoNome: nomePorId.get(v.dreDescricaoId!) ?? "",
        dreDescricaoChave: chavePorId.get(v.dreDescricaoId!) ?? null,
        parcela: v.parcela,
        lancamentoManualId: null,
      });
    }
  } else {
    const dataFimAmpliada = `${mesSeguinte(mesFim)}-31`;
    const semSplit = await db.select({
      dataEntrada: interExtratos.dataEntrada,
      titulo: interExtratos.titulo,
      descricao: interExtratos.descricao,
      valor: interExtratos.valor,
      origem: interExtratos.origem,
      dreDescricaoId: interExtratos.dreDescricaoId,
    }).from(interExtratos).where(and(
      eq(interExtratos.unidadeId, unidadeId),
      gte(interExtratos.dataEntrada, dataInicio),
      lte(interExtratos.dataEntrada, dataFimAmpliada),
      inArray(interExtratos.dreDescricaoId, idsDescricao),
    ));
    for (const t of semSplit) {
      const mesTransacao = t.dataEntrada.slice(0, 7);
      const competencia = competenciaPorId.get(t.dreDescricaoId!) ?? "mes_lancamento";
      const mesCompetencia = competencia === "mes_anterior" ? mesAnterior(mesTransacao) : mesTransacao;
      if (mesCompetencia < mesInicio || mesCompetencia > mesFim) continue;
      resultado.push({
        data: t.dataEntrada,
        titulo: t.titulo || t.descricao || "—",
        valor: parseFloat(t.valor),
        origem: t.origem ?? "inter",
        dreDescricaoNome: nomePorId.get(t.dreDescricaoId!) ?? "",
        dreDescricaoChave: chavePorId.get(t.dreDescricaoId!) ?? null,
        parcela: null,
        lancamentoManualId: null,
      });
    }

    const splits = await db.select({
      dataEntrada: interExtratos.dataEntrada,
      titulo: interExtratos.titulo,
      observacao: lancamentoSplits.observacao,
      valor: lancamentoSplits.valor,
      origem: interExtratos.origem,
      dreDescricaoId: lancamentoSplits.dreDescricaoId,
    }).from(lancamentoSplits)
      .innerJoin(interExtratos, eq(lancamentoSplits.interExtratoId, interExtratos.id))
      .where(and(
        eq(interExtratos.unidadeId, unidadeId),
        gte(lancamentoSplits.mesReferencia, mesInicio),
        lte(lancamentoSplits.mesReferencia, mesFim),
        inArray(lancamentoSplits.dreDescricaoId, idsDescricao),
      ));
    for (const s of splits) {
      resultado.push({
        data: s.dataEntrada,
        titulo: s.observacao || `${s.titulo || "Split"} (dividido)`,
        valor: parseFloat(s.valor),
        origem: s.origem ?? "inter",
        dreDescricaoNome: nomePorId.get(s.dreDescricaoId) ?? "",
        dreDescricaoChave: chavePorId.get(s.dreDescricaoId) ?? null,
        parcela: null,
        lancamentoManualId: null,
      });
    }

    const dataFimAmpliadaHora = `${mesSeguinte(mesFim)}-31 23:59:59`;
    const vendas = await db.select({
      dataHora: adquirenteVendas.dataHora,
      tipo: adquirenteVendas.tipo,
      bandeira: adquirenteVendas.bandeira,
      parcela: adquirenteVendas.parcela,
      valor: adquirenteVendas.valorBruto,
      adquirente: adquirenteVendas.adquirente,
      dreDescricaoId: adquirenteVendas.dreDescricaoId,
    }).from(adquirenteVendas).where(and(
      eq(adquirenteVendas.unidadeId, unidadeId),
      gte(adquirenteVendas.dataHora, dataInicio),
      lte(adquirenteVendas.dataHora, dataFimAmpliadaHora),
      inArray(adquirenteVendas.dreDescricaoId, idsDescricao),
    ));
    for (const v of vendas) {
      if (v.valor === null) continue;
      const mesVenda = v.dataHora.slice(0, 7);
      const competencia = competenciaPorId.get(v.dreDescricaoId!) ?? "mes_lancamento";
      const mesCompetencia = competencia === "mes_anterior" ? mesAnterior(mesVenda) : mesVenda;
      if (mesCompetencia < mesInicio || mesCompetencia > mesFim) continue;
      resultado.push({
        data: v.dataHora.slice(0, 10),
        titulo: [v.tipo, v.bandeira].filter(Boolean).join(" - ") || "Venda maquininha",
        valor: parseFloat(v.valor),
        origem: v.adquirente,
        dreDescricaoNome: nomePorId.get(v.dreDescricaoId!) ?? "",
        dreDescricaoChave: chavePorId.get(v.dreDescricaoId!) ?? null,
        parcela: v.parcela,
        lancamentoManualId: null,
      });
    }

    // Lançamento manual (ver drizzle/schema.ts) — só existe em
    // competência, mesma regra de listDreAgregado.
    const manuais = await db.select({
      id: lancamentosManuaisDre.id,
      mesReferencia: lancamentosManuaisDre.mesReferencia,
      valor: lancamentosManuaisDre.valor,
      observacao: lancamentosManuaisDre.observacao,
      dreDescricaoId: lancamentosManuaisDre.dreDescricaoId,
    }).from(lancamentosManuaisDre).where(and(
      eq(lancamentosManuaisDre.unidadeId, unidadeId),
      gte(lancamentosManuaisDre.mesReferencia, mesInicio),
      lte(lancamentosManuaisDre.mesReferencia, mesFim),
      inArray(lancamentosManuaisDre.dreDescricaoId, idsDescricao),
    ));
    for (const m of manuais) {
      resultado.push({
        data: `${m.mesReferencia}-01`,
        titulo: m.observacao || "Lançamento manual",
        valor: parseFloat(m.valor),
        origem: "manual",
        dreDescricaoNome: nomePorId.get(m.dreDescricaoId) ?? "",
        dreDescricaoChave: chavePorId.get(m.dreDescricaoId) ?? null,
        parcela: null,
        lancamentoManualId: m.id,
      });
    }
  }

  // Voucher site / Gympass-Totalpass: sem lançamento individual (vem
  // do resumo MENSAL da planilha Resumos), então o "detalhe" aqui é 1
  // linha sintética por mês com o valor direto — ver mesmo comentário
  // em listDreAgregado.
  const idVoucher = await resolverDescricaoIdPorChave(CHAVE_RECEITA_VOUCHER_SITE);
  const idGympass = await resolverDescricaoIdPorChave(CHAVE_RECEITA_GYMPASS_TOTALPASS);
  if ((idVoucher && idsDescricao.includes(idVoucher)) || (idGympass && idsDescricao.includes(idGympass))) {
    const resumosMensais = await db.select({
      mesAno: resumoMensalUnidade.mesAno,
      voucherSite: resumoMensalUnidade.voucherSite,
      gympassTotalpass: resumoMensalUnidade.gympassTotalpass,
    }).from(resumoMensalUnidade).where(and(
      eq(resumoMensalUnidade.unidadeId, unidadeId),
      gte(resumoMensalUnidade.mesAno, mesInicio),
      lte(resumoMensalUnidade.mesAno, mesFim),
    ));
    for (const r of resumosMensais) {
      if (idVoucher && idsDescricao.includes(idVoucher) && r.voucherSite !== null && parseFloat(r.voucherSite) !== 0) {
        resultado.push({
          data: `${r.mesAno}-01`,
          titulo: "Voucher site (resumo mensal)",
          valor: parseFloat(r.voucherSite),
          origem: "resumo_mensal",
          dreDescricaoNome: nomePorId.get(idVoucher) ?? "",
          dreDescricaoChave: CHAVE_RECEITA_VOUCHER_SITE,
          parcela: null,
          lancamentoManualId: null,
        });
      }
      if (idGympass && idsDescricao.includes(idGympass) && r.gympassTotalpass !== null && parseFloat(r.gympassTotalpass) !== 0) {
        resultado.push({
          data: `${r.mesAno}-01`,
          titulo: "Gympass / Totalpass (resumo mensal)",
          valor: parseFloat(r.gympassTotalpass),
          origem: "resumo_mensal",
          dreDescricaoNome: nomePorId.get(idGympass) ?? "",
          dreDescricaoChave: CHAVE_RECEITA_GYMPASS_TOTALPASS,
          parcela: null,
          lancamentoManualId: null,
        });
      }
    }
  }

  return resultado.sort((a, b) => b.data.localeCompare(a.data));
}

// ===== Transações entre Unidades =====

export async function listTransacoesEntreUnidades() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(transacoesEntreUnidades)
    .orderBy(desc(transacoesEntreUnidades.data), desc(transacoesEntreUnidades.id));
}

export interface DadosTransacaoManualEntreUnidades {
  data: string;
  unidadeCredora: number;
  unidadeDevedora: number;
  valor: number;
  descricao: string;
}

/**
 * Lançamento manual na conta corrente entre unidades — pro caso sem
 * transação bancária nenhuma por trás (ex.: mercadoria que volta de
 * uma unidade pra outra, abatendo o que era devido em dinheiro).
 */
export async function criarTransacaoManualEntreUnidades(dados: DadosTransacaoManualEntreUnidades) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(transacoesEntreUnidades).values({
    data: dados.data,
    tipo: "manual",
    unidadeCredora: dados.unidadeCredora,
    unidadeDevedora: dados.unidadeDevedora,
    valor: dados.valor.toFixed(2),
    descricao: dados.descricao,
  }).$returningId();
  return result[0]?.id;
}

// Sempre guardado na perspectiva da unidade 1 (Shopping Santa Úrsula) —
// positivo = unidade 1 entrou com saldo credor (recebeu líquido antes do
// controle começar), negativo = unidade 1 entrou devendo. Pedido do
// usuário 2026-09-08: "conta corrente" com saldo inicial editável, pra
// registrar empréstimo/histórico anterior ao início do rastreamento.
const CHAVE_SALDO_INICIAL_TRANSACOES_ENTRE_UNIDADES = "saldo_inicial_transacoes_entre_unidades_unidade1";

export async function getSaldoInicialTransacoesEntreUnidades(): Promise<number> {
  const config = await getConfig(CHAVE_SALDO_INICIAL_TRANSACOES_ENTRE_UNIDADES);
  return config?.valor ? parseFloat(config.valor) : 0;
}

/** `valor` já na perspectiva de `unidadeId` — convertido pra perspectiva canônica (unidade 1) antes de gravar. */
export async function definirSaldoInicialTransacoesEntreUnidades(unidadeId: number, valor: number): Promise<void> {
  const valorUnidade1 = unidadeId === 1 ? valor : -valor;
  await setConfig(CHAVE_SALDO_INICIAL_TRANSACOES_ENTRE_UNIDADES, String(valorUnidade1));
}

/**
 * Saldo líquido por par de unidades — soma tudo (rateio de despesa +
 * transferência real + manual) nos dois sentidos e devolve só o
 * resultado líquido, já normalizado pro lado que efetivamente é
 * credor (saldo sempre positivo).
 */
export async function saldoEntreUnidades(): Promise<{ unidadeCredora: number; unidadeDevedora: number; saldo: number }[]> {
  const db = await getDb();
  if (!db) return [];
  const todas = await db.select({
    unidadeCredora: transacoesEntreUnidades.unidadeCredora,
    unidadeDevedora: transacoesEntreUnidades.unidadeDevedora,
    valor: transacoesEntreUnidades.valor,
  }).from(transacoesEntreUnidades);

  const saldoPorPar = new Map<string, number>();
  for (const t of todas) {
    const [a, b] = [t.unidadeCredora, t.unidadeDevedora].sort((x, y) => x - y);
    const chave = `${a}-${b}`;
    const sinal = t.unidadeCredora === a ? 1 : -1;
    saldoPorPar.set(chave, (saldoPorPar.get(chave) ?? 0) + sinal * parseFloat(t.valor));
  }

  return Array.from(saldoPorPar.entries())
    .filter(([, saldo]) => Math.abs(saldo) > 0.005)
    .map(([chave, saldo]) => {
      const [a, b] = chave.split("-").map(Number);
      return saldo >= 0
        ? { unidadeCredora: a, unidadeDevedora: b, saldo }
        : { unidadeCredora: b, unidadeDevedora: a, saldo: -saldo };
    });
}

/**
 * Nota livre por transação — separada da categoria de propósito. A
 * categoria agrupa (várias contrapartes diferentes podem cair na mesma
 * categoria), a nota esclarece o caso específico sem precisar criar
 * categoria nova pra cada situação.
 */
export async function atualizarNota(transacaoId: number, nota: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(interExtratos).set({ nota: nota || null }).where(eq(interExtratos.id, transacaoId));
}

/**
 * Garante que a unidade tenha a conta "Caixa Físico" (mesmo espírito do
 * getOrCreateContaInter/getOrCreateContaMercadoPago) — as transações
 * sincronizadas do Google Sheets entram em inter_extratos igual às de
 * qualquer outra conta, pra participar do Consolidado.
 */
export async function getOrCreateContaCaixaFisico(unidadeId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const existente = await db.select().from(contas)
    .where(and(eq(contas.unidadeId, unidadeId), eq(contas.nome, "Caixa Físico")))
    .limit(1);
  if (existente[0]) return existente[0];

  const insertValues: InsertConta = { unidadeId, nome: "Caixa Físico", tipo: "caixa_fisico" };
  const result = await db.insert(contas).values(insertValues).$returningId();
  const novaId = result[0]?.id;
  if (!novaId) return undefined;
  const novaConta = await db.select().from(contas).where(eq(contas.id, novaId)).limit(1);
  return novaConta[0];
}

// ===== Log de Auditoria (trazido do mobai-crm, 2026-08-08) =====

export interface FiltrosAuditLog {
  userId?: number;
  atendenteId?: number;
  procedureContains?: string;
  apenasErros?: boolean;
  cursorId?: number;
  limit: number;
}

/**
 * Toda mutation autenticada, gravada pelo auditMiddleware em
 * server/_core/trpc.ts — paginação por cursor (id decrescente), mesmo
 * padrão do mobai-crm.
 */
export async function listAuditLog(filtros: FiltrosAuditLog) {
  const db = await getDb();
  if (!db) return { items: [], nextCursor: null };

  const condicoes = [];
  if (filtros.userId != null) condicoes.push(eq(auditLog.userId, filtros.userId));
  if (filtros.atendenteId != null) condicoes.push(eq(auditLog.atendenteId, filtros.atendenteId));
  if (filtros.procedureContains) condicoes.push(like(auditLog.procedure, `%${filtros.procedureContains}%`));
  if (filtros.apenasErros) condicoes.push(eq(auditLog.sucesso, false));
  if (filtros.cursorId != null) condicoes.push(lt(auditLog.id, filtros.cursorId));

  const rows = await db
    .select()
    .from(auditLog)
    .where(condicoes.length > 0 ? and(...condicoes) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(filtros.limit);

  return {
    items: rows,
    nextCursor: rows.length === filtros.limit ? rows[rows.length - 1].id : null,
  };
}

/** Lista enxuta de usuários pro filtro "Usuário" da tela de auditoria. */
export async function listUsuariosParaFiltro() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: users.id, name: users.name, email: users.email }).from(users).orderBy(users.name);
}

/** Lista enxuta de atendentes (todas as unidades) pro filtro "Atendente" da tela de auditoria. */
export async function listAtendentesParaFiltro() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: atendentes.id, nome: atendentes.nome }).from(atendentes).orderBy(atendentes.nome);
}

// ===== Controle de acesso por módulo (ver shared/modulos.ts) =====

export interface UsuarioComPermissoes {
  id: number;
  name: string | null;
  email: string | null;
  role: "user" | "admin";
  permissoesCustomizadas: boolean;
  pendente: boolean;
}

/** Pra tela de administração de usuários. */
export async function listUsuariosComPermissoes(): Promise<UsuarioComPermissoes[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    permissoesCustomizadas: users.permissoesCustomizadas,
    openId: users.openId,
  }).from(users).orderBy(users.name);
  return rows.map(({ openId, ...resto }) => ({ ...resto, pendente: openId.startsWith(PREFIXO_OPENID_CONVITE) }));
}

/**
 * Promove/rebaixa entre user/admin. Recusa rebaixar o último admin
 * restante — sem isso seria possível zerar o acesso admin da conta
 * inteira sem querer, sem ninguém pra reverter pela própria UI.
 */
export async function alterarRoleUsuario(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) return;

  if (role === "user") {
    const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin"));
    const restantes = admins.filter((a) => a.id !== userId);
    if (restantes.length === 0) {
      throw new Error("Não é possível rebaixar o último administrador");
    }
  }

  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export interface PermissoesUsuario {
  restrito: boolean;
  modulos: string[];
  // Sub-seções liberadas (ver shared/subsecoes.ts) — presença de
  // QUALQUER chave "modulo:..." aqui restringe esse módulo às
  // sub-seções listadas; ausência = acesso a todas.
  subsecoes: string[];
}

/**
 * `restrito: false` (conta sem permissoesCustomizadas) significa acesso
 * total — é o que toda conta já tinha antes dessa feature existir, e
 * continua sendo o padrão pra conta nova. `restrito: true` com
 * `modulos: []` é um bloqueio completo e deliberado (ex.: afastar
 * alguém sem excluir a conta), não "ainda não configurado".
 */
export async function getPermissoesUsuario(userId: number): Promise<PermissoesUsuario> {
  const db = await getDb();
  if (!db) return { restrito: false, modulos: [], subsecoes: [] };

  const userRows = await db.select({ permissoesCustomizadas: users.permissoesCustomizadas })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!userRows[0]?.permissoesCustomizadas) return { restrito: false, modulos: [], subsecoes: [] };

  const [modRows, subRows] = await Promise.all([
    db.select({ modulo: permissoesModulo.modulo }).from(permissoesModulo).where(eq(permissoesModulo.userId, userId)),
    db.select({ subsecao: permissoesSubsecao.subsecao }).from(permissoesSubsecao).where(eq(permissoesSubsecao.userId, userId)),
  ]);
  return { restrito: true, modulos: modRows.map((r) => r.modulo), subsecoes: subRows.map((r) => r.subsecao) };
}

/** Substitui o conjunto inteiro de módulos (e sub-seções) liberados pra essa conta (pode ser vazio — bloqueio total). */
export async function salvarPermissoesUsuario(userId: number, modulos: string[], subsecoes: string[] = []) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ permissoesCustomizadas: true }).where(eq(users.id, userId));
  await db.delete(permissoesModulo).where(eq(permissoesModulo.userId, userId));
  await db.delete(permissoesSubsecao).where(eq(permissoesSubsecao.userId, userId));
  if (modulos.length > 0) {
    await db.insert(permissoesModulo).values(modulos.map((modulo) => ({ userId, modulo })));
  }
  if (subsecoes.length > 0) {
    await db.insert(permissoesSubsecao).values(subsecoes.map((subsecao) => ({ userId, subsecao })));
  }
}

/** Volta pro padrão "acesso total" — limpa a restrição, os módulos e as sub-seções salvos. */
export async function removerRestricaoUsuario(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ permissoesCustomizadas: false }).where(eq(users.id, userId));
  await db.delete(permissoesModulo).where(eq(permissoesModulo.userId, userId));
  await db.delete(permissoesSubsecao).where(eq(permissoesSubsecao.userId, userId));
}

// ===== Controle de acesso por unidade (eixo independente do módulo acima) =====

export interface UnidadesPermitidas {
  restrito: boolean;
  unidadeIds: number[];
}

/**
 * `restrito: false` (unidadesCustomizadas=false) = vê todas as
 * unidades, igual sempre foi. `restrito: true` com `unidadeIds: []` é
 * bloqueio total deliberado, mesma convenção de getPermissoesUsuario.
 */
export async function getUnidadesPermitidasUsuario(userId: number): Promise<UnidadesPermitidas> {
  const db = await getDb();
  if (!db) return { restrito: false, unidadeIds: [] };

  const userRows = await db.select({ unidadesCustomizadas: users.unidadesCustomizadas })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!userRows[0]?.unidadesCustomizadas) return { restrito: false, unidadeIds: [] };

  const rows = await db.select({ unidadeId: permissoesUnidade.unidadeId }).from(permissoesUnidade).where(eq(permissoesUnidade.userId, userId));
  return { restrito: true, unidadeIds: rows.map((r) => r.unidadeId) };
}

/** Substitui o conjunto inteiro de unidades liberadas pra essa conta (pode ser vazio — bloqueio total). */
export async function salvarUnidadesUsuario(userId: number, restrito: boolean, unidadeIds: number[]) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ unidadesCustomizadas: restrito }).where(eq(users.id, userId));
  await db.delete(permissoesUnidade).where(eq(permissoesUnidade.userId, userId));
  if (restrito && unidadeIds.length > 0) {
    await db.insert(permissoesUnidade).values(unidadeIds.map((unidadeId) => ({ userId, unidadeId })));
  }
}

// ===== Atendentes (identidade por PIN — ver server/atendenteAuth.ts) =====

/** Pro seletor "Quem está atendendo?" — nunca inclui o hash do PIN. */
export async function listAtendentesAtivos(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: atendentes.id, nome: atendentes.nome }).from(atendentes)
    .where(and(eq(atendentes.unidadeId, unidadeId), eq(atendentes.ativo, true)))
    .orderBy(atendentes.nome);
}

/** Pra tela de administração — inclui inativos, sem o hash do PIN. */
export async function listAtendentesAdmin(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: atendentes.id, nome: atendentes.nome, ativo: atendentes.ativo, createdAt: atendentes.createdAt })
    .from(atendentes)
    .where(eq(atendentes.unidadeId, unidadeId))
    .orderBy(atendentes.nome);
}

export async function getAtendenteComHash(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(atendentes).where(eq(atendentes.id, id)).limit(1);
  return rows[0];
}

export async function criarAtendente(unidadeId: number, nome: string, pinHash: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(atendentes).values({ unidadeId, nome, pinHash }).$returningId();
  return result[0]?.id;
}

export async function atualizarAtendente(id: number, dados: { nome?: string; pinHash?: string; ativo?: boolean }) {
  const db = await getDb();
  if (!db) return;
  await db.update(atendentes).set(dados).where(eq(atendentes.id, id));
}

export async function listTerapeutasAdmin(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(terapeutas)
    .where(eq(terapeutas.unidadeId, unidadeId))
    .orderBy(terapeutas.nomeCompleto);
}

export async function criarTerapeuta(params: {
  unidadeId: number;
  nomeCompleto: string;
  nomeAbreviado: string;
  celular?: string | null;
  whatsappParticipanteId?: string | null;
  cpf?: string | null;
  vinculo?: "fixo" | "freelancer";
  nivel?: "diamante" | "ouro" | "prata" | "bronze";
}) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(terapeutas).values(params).$returningId();
  return result[0]?.id;
}

export async function atualizarTerapeuta(unidadeId: number, id: number, dados: {
  nomeCompleto?: string;
  nomeAbreviado?: string;
  celular?: string | null;
  whatsappParticipanteId?: string | null;
  cpf?: string | null;
  vinculo?: "fixo" | "freelancer";
  nivel?: "diamante" | "ouro" | "prata" | "bronze";
  ativo?: boolean;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(terapeutas).set(dados).where(and(eq(terapeutas.id, id), eq(terapeutas.unidadeId, unidadeId)));
}

export async function listarFidelizacaoTerapeutas(unidadeId: number, dataInicio: string, dataFim: string) {
  const db = await getDb();
  if (!db) return [];

  const [terapeutasAtivos, atendimentos] = await Promise.all([
    db.select({ id: terapeutas.id, nomeCompleto: terapeutas.nomeCompleto, nomeAbreviado: terapeutas.nomeAbreviado })
      .from(terapeutas)
      .where(and(eq(terapeutas.unidadeId, unidadeId), eq(terapeutas.ativo, true), ne(terapeutas.nomeCompleto, NOME_TERAPEUTA_CURINGA)))
      .orderBy(asc(terapeutas.nomeAbreviado)),
    db.select({ profissionalNome: belleAtendimentos.profissionalNome, temPreferencia: belleAtendimentos.temPreferencia })
      .from(belleAtendimentos)
      .where(and(
        eq(belleAtendimentos.unidadeId, unidadeId),
        gte(belleAtendimentos.dataAtendimento, dataInicio),
        lte(belleAtendimentos.dataAtendimento, dataFim),
        eq(belleAtendimentos.status, "Atendido"),
      )),
  ]);

  return calcularFidelizacao(terapeutasAtivos, atendimentos);
}

// Série temporal (hover no nome do terapeuta em Fidelização) — mesmos
// atendimentos de listarFidelizacaoTerapeutas, mas de UM terapeuta só e
// bucketados por semana/mês em vez de agregados no período inteiro.
export async function listarEvolucaoFidelizacaoTerapeuta(
  unidadeId: number,
  terapeutaId: number,
  dataInicio: string,
  dataFim: string,
  granularidade: GranularidadeEvolucao,
) {
  const db = await getDb();
  if (!db) return [];

  const [terapeuta] = await db.select({ id: terapeutas.id, nomeCompleto: terapeutas.nomeCompleto, nomeAbreviado: terapeutas.nomeAbreviado })
    .from(terapeutas)
    .where(and(eq(terapeutas.id, terapeutaId), eq(terapeutas.unidadeId, unidadeId)))
    .limit(1);
  if (!terapeuta) return [];

  const atendimentos = await db.select({
    profissionalNome: belleAtendimentos.profissionalNome,
    temPreferencia: belleAtendimentos.temPreferencia,
    dataAtendimento: belleAtendimentos.dataAtendimento,
  }).from(belleAtendimentos)
    .where(and(
      eq(belleAtendimentos.unidadeId, unidadeId),
      gte(belleAtendimentos.dataAtendimento, dataInicio),
      lte(belleAtendimentos.dataAtendimento, dataFim),
      eq(belleAtendimentos.status, "Atendido"),
    ));

  return calcularEvolucaoFidelizacao(atendimentos, terapeuta, granularidade);
}

export async function listarPreferenciaisTerapeutas(unidadeId: number, dataInicio: string, dataFim: string) {
  const db = await getDb();
  if (!db) return [];

  const [terapeutasAtivos, atendimentos] = await Promise.all([
    db.select({ id: terapeutas.id, nomeCompleto: terapeutas.nomeCompleto, nomeAbreviado: terapeutas.nomeAbreviado })
      .from(terapeutas)
      .where(and(eq(terapeutas.unidadeId, unidadeId), eq(terapeutas.ativo, true), ne(terapeutas.nomeCompleto, NOME_TERAPEUTA_CURINGA)))
      .orderBy(asc(terapeutas.nomeAbreviado)),
    db.select({
      clienteId: belleAtendimentos.clienteId,
      clienteNome: belleAtendimentos.clienteNome,
      profissionalNome: belleAtendimentos.profissionalNome,
      temPreferencia: belleAtendimentos.temPreferencia,
    })
      .from(belleAtendimentos)
      .where(and(
        eq(belleAtendimentos.unidadeId, unidadeId),
        gte(belleAtendimentos.dataAtendimento, dataInicio),
        lte(belleAtendimentos.dataAtendimento, dataFim),
        eq(belleAtendimentos.status, "Atendido"),
        eq(belleAtendimentos.temPreferencia, true),
      )),
  ]);

  return calcularPreferenciaisPorAtendimento(terapeutasAtivos, atendimentos);
}

export async function listarFechamentoAgendaTerapeutas(unidadeId: number, dataInicio: string, dataFim: string) {
  const db = await getDb();
  if (!db) {
    return calcularFechamentoAgenda([], [], dataInicio, dataFim);
  }

  const [terapeutasAtivos, atendimentos] = await Promise.all([
    db.select({ id: terapeutas.id, nomeCompleto: terapeutas.nomeCompleto, nomeAbreviado: terapeutas.nomeAbreviado })
      .from(terapeutas)
      .where(and(eq(terapeutas.unidadeId, unidadeId), eq(terapeutas.ativo, true), ne(terapeutas.nomeCompleto, NOME_TERAPEUTA_CURINGA)))
      .orderBy(asc(terapeutas.nomeAbreviado)),
    db.select({
      profissionalNome: belleAtendimentos.profissionalNome,
      dataAtendimento: belleAtendimentos.dataAtendimento,
    })
      .from(belleAtendimentos)
      .where(and(
        eq(belleAtendimentos.unidadeId, unidadeId),
        gte(belleAtendimentos.dataAtendimento, dataInicio),
        lte(belleAtendimentos.dataAtendimento, dataFim),
        eq(belleAtendimentos.status, "Atendido"),
      )),
  ]);

  return calcularFechamentoAgenda(terapeutasAtivos, atendimentos, dataInicio, dataFim);
}

export async function listarTerapeutasComLiberacoes(unidadeId: number) {
  const db = await getDb();
  if (!db) return { terapeutas: [], liberacoes: [] };

  const [terapeutasAtivos, liberacoes] = await Promise.all([
    db.select({ id: terapeutas.id, nomeCompleto: terapeutas.nomeCompleto, nomeAbreviado: terapeutas.nomeAbreviado })
      .from(terapeutas)
      .where(and(eq(terapeutas.unidadeId, unidadeId), eq(terapeutas.ativo, true), ne(terapeutas.nomeCompleto, NOME_TERAPEUTA_CURINGA)))
      .orderBy(asc(terapeutas.nomeAbreviado)),
    db.select({
      terapeutaId: terapeutasLiberacoes.terapeutaId,
      servicoCodigo: terapeutasLiberacoes.servicoCodigo,
      servicoNome: terapeutasLiberacoes.servicoNome,
    })
      .from(terapeutasLiberacoes)
      .where(eq(terapeutasLiberacoes.unidadeId, unidadeId)),
  ]);

  return { terapeutas: terapeutasAtivos, liberacoes };
}

export async function salvarLiberacaoTerapeuta(params: {
  unidadeId: number;
  terapeutaId: number;
  servicoCodigo: number;
  servicoNome: string;
  liberada: boolean;
}) {
  const db = await getDb();
  if (!db) return;

  const terapeuta = await db.select({ id: terapeutas.id })
    .from(terapeutas)
    .where(and(eq(terapeutas.id, params.terapeutaId), eq(terapeutas.unidadeId, params.unidadeId)))
    .limit(1);
  if (!terapeuta[0]) throw new Error("Terapeuta não encontrado nesta unidade");

  const servicoNome = params.servicoNome.trim();

  // Casa pelo nome, não pelo código: o catálogo de terapias (trpc.servicos.list)
  // passou a vir da Tabela de Preços, que usa `id` como código — diferente do
  // código Belle com o qual liberações mais antigas foram salvas. Casar pelo
  // nome faz liberações antigas continuarem valendo (e se "curarem" pro novo
  // código na primeira vez que alguém mexer nelas) sem precisar migrar dados.
  await db.delete(terapeutasLiberacoes).where(and(
    eq(terapeutasLiberacoes.unidadeId, params.unidadeId),
    eq(terapeutasLiberacoes.terapeutaId, params.terapeutaId),
    eq(terapeutasLiberacoes.servicoNome, servicoNome),
  ));

  if (!params.liberada) return;

  await db.insert(terapeutasLiberacoes).values({
    unidadeId: params.unidadeId,
    terapeutaId: params.terapeutaId,
    servicoCodigo: params.servicoCodigo,
    servicoNome,
  });
}

/**
 * Cria a sessão pós-PIN e devolve o token (o chamador grava no
 * cookie). Também limpa sessões expiradas desse atendente pra tabela
 * não crescer sem limite — não precisa de cron dedicado pra isso.
 */
export async function criarSessaoAtendente(atendenteId: number, expiraEm: Date): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");

  await db.delete(atendenteSessoes).where(and(
    eq(atendenteSessoes.atendenteId, atendenteId),
    lt(atendenteSessoes.expiraEm, new Date()),
  ));

  const token = crypto.randomBytes(32).toString("hex");
  await db.insert(atendenteSessoes).values({ token, atendenteId, expiraEm });
  return token;
}

/**
 * Resolve o atendente ativo a partir do cookie de sessão — usado pelo
 * createContext em toda requisição. `null` tanto pra token inexistente/
 * expirado quanto pra atendente desativado depois que a sessão começou.
 */
export async function getAtendenteAtualPorToken(token: string): Promise<{ id: number; nome: string; unidadeId: number } | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.select({
    id: atendentes.id,
    nome: atendentes.nome,
    unidadeId: atendentes.unidadeId,
    ativo: atendentes.ativo,
    expiraEm: atendenteSessoes.expiraEm,
  })
    .from(atendenteSessoes)
    .innerJoin(atendentes, eq(atendenteSessoes.atendenteId, atendentes.id))
    .where(eq(atendenteSessoes.token, token))
    .limit(1);

  const row = rows[0];
  if (!row || !row.ativo || row.expiraEm < new Date()) return null;
  return { id: row.id, nome: row.nome, unidadeId: row.unidadeId };
}

export async function encerrarSessaoAtendente(token: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(atendenteSessoes).where(eq(atendenteSessoes.token, token));
}

// ===== Clientes (base local, importada de planilha — Belle API negado) =====

/**
 * Upsert por belleId (a única chave estável entre reimportações). Uma
 * consulta prévia busca os belleId já existentes de uma vez (em vez de
 * um SELECT por linha) — com 5000+ linhas isso corta pela metade o
 * número de idas ao banco. `clienteSsu`/`clienteRbs`: liga só a flag da
 * unidade sendo importada agora, sem nunca desligar a outra — é assim
 * que um cliente das duas unidades acaba com as duas true, vindas de
 * imports em momentos diferentes.
 *
 * Reconciliação lead→cliente: uma linha nova (belleId nunca visto) pode
 * na verdade ser a mesma pessoa de um "lead" já criado pelo Inbox
 * (belleId sintético negativo). Antes de inserir como registro novo,
 * checa o telefone contra os leads existentes — batendo, PROMOVE o
 * mesmo registro (troca o belleId sintético pelo real, tipoCliente vira
 * "cliente") em vez de duplicar. Preserva o `id` porque
 * inbox_conversas.clienteId pode já apontar pra ele.
 */
export async function upsertClientesImportados(
  unidadeSlug: "rbs" | "ssu",
  linhas: LinhaClienteImportada[],
): Promise<{ inseridos: number; atualizados: number; promovidosDeLead: number }> {
  const db = await getDb();
  if (!db) return { inseridos: 0, atualizados: 0, promovidosDeLead: 0 };
  if (linhas.length === 0) return { inseridos: 0, atualizados: 0, promovidosDeLead: 0 };

  const belleIds = linhas.map((l) => l.belleId);
  const existentes = await db.select({ id: clientes.id, belleId: clientes.belleId }).from(clientes).where(inArray(clientes.belleId, belleIds));
  const idPorBelleId = new Map(existentes.map((e) => [e.belleId, e.id]));

  const leads = await db.select({
    id: clientes.id,
    celular: clientes.celular,
    celular2: clientes.celular2,
    telefone: clientes.telefone,
  }).from(clientes).where(eq(clientes.tipoCliente, "lead"));
  const digitosValidos = (v: string | null) => {
    const d = (v ?? "").replace(/\D/g, "");
    return d.length >= 8 ? d : null;
  };
  const leadPorTelefone = new Map<string, number>();
  for (const lead of leads) {
    for (const bruto of [lead.celular, lead.celular2, lead.telefone]) {
      const digitos = digitosValidos(bruto);
      if (!digitos) continue;
      leadPorTelefone.set(digitos, lead.id);
      leadPorTelefone.set(digitos.replace(/^55/, ""), lead.id);
    }
  }
  const leadsJaPromovidos = new Set<number>();

  const flagUnidade = unidadeSlug === "ssu" ? { clienteSsu: true as const } : { clienteRbs: true as const };

  let inseridos = 0;
  let atualizados = 0;
  let promovidosDeLead = 0;
  const clienteIdsTocados: number[] = [];
  const linhasIndice: InsertClienteTelefone[] = [];
  const indexarTelefones = (clienteId: number, l: LinhaClienteImportada) => {
    clienteIdsTocados.push(clienteId);
    linhasIndice.push(...telefonesParaIndexar(clienteId, { celular: l.celular, celular2: l.celular2, telefone: l.telefone }));
  };
  for (const l of linhas) {
    const dadosBase = {
      nome: l.nome,
      rg: l.rg,
      cpf: l.cpf,
      dataNascimento: l.dataNascimento,
      sexo: l.sexo,
      endereco: l.endereco,
      bairro: l.bairro,
      cidade: l.cidade,
      uf: l.uf,
      telefone: l.telefone,
      celular: l.celular,
      celular2: l.celular2,
      email: l.email,
      dataCadastro: l.dataCadastro,
      primeiroAtendimento: l.primeiroAtendimento,
      ultimoAtendimento: l.ultimoAtendimento,
      qtdAtendimentosFinalizados: l.qtdAtendimentosFinalizados,
      qtdServicosFinalizados: l.qtdServicosFinalizados,
    };

    const clienteIdExistente = idPorBelleId.get(l.belleId);
    if (clienteIdExistente !== undefined) {
      await db.update(clientes).set({ ...dadosBase, ...flagUnidade }).where(eq(clientes.belleId, l.belleId));
      indexarTelefones(clienteIdExistente, l);
      atualizados++;
      continue;
    }

    const digitosImportado = [l.celular, l.celular2, l.telefone].map(digitosValidos).find((d): d is string => !!d);
    const leadId = digitosImportado
      ? leadPorTelefone.get(digitosImportado) ?? leadPorTelefone.get(digitosImportado.replace(/^55/, ""))
      : undefined;

    if (leadId !== undefined && !leadsJaPromovidos.has(leadId)) {
      await db.update(clientes).set({
        belleId: l.belleId,
        tipoCliente: "cliente",
        ...dadosBase,
        ...flagUnidade,
      }).where(eq(clientes.id, leadId));
      leadsJaPromovidos.add(leadId);
      indexarTelefones(leadId, l);
      promovidosDeLead++;
      continue;
    }

    const insertValues: InsertCliente = {
      belleId: l.belleId,
      ...dadosBase,
      tipoCliente: "cliente",
      clienteSsu: unidadeSlug === "ssu",
      clienteRbs: unidadeSlug === "rbs",
    };
    const result = await db.insert(clientes).values(insertValues).$returningId();
    const novoClienteId = result[0]?.id;
    if (novoClienteId) indexarTelefones(novoClienteId, l);
    inseridos++;
  }

  // Índice cliente_telefones: 1 DELETE + 1 (ou poucos) INSERT em lote
  // pra todo o import, em vez de round-trip por linha — reimport do
  // Belle roda pra todo o cadastro toda vez, então isso também serve
  // de "backfill de graça" pra clientes que já existiam antes dessa
  // coluna existir (2026-08-15), sem precisar de job dedicado.
  if (clienteIdsTocados.length > 0) {
    await db.delete(clienteTelefones).where(inArray(clienteTelefones.clienteId, clienteIdsTocados));
  }
  for (let i = 0; i < linhasIndice.length; i += 500) {
    await db.insert(clienteTelefones).values(linhasIndice.slice(i, i + 500));
  }

  return { inseridos, atualizados, promovidosDeLead };
}

export interface ResultadoImportacaoAtendimentosBelle {
  inseridos: number;
  atualizados: number;
  vinculadosComSeguranca: number;
  semVinculo: number;
  ambiguos: number;
}

/**
 * Espelha atendimentos exportados do Belle sem cruzar as duas unidades.
 * O vínculo só é criado quando o telefone do relatório corresponde a um único
 * cliente cadastrado na mesma unidade; homônimos e telefones compartilhados
 * ficam sem clienteId para uma revisão posterior, nunca ligados por suposição.
 */
export async function upsertAtendimentosBelleImportados(
  unidadeId: number,
  linhas: LinhaAtendimentoBelleImportada[],
): Promise<ResultadoImportacaoAtendimentosBelle> {
  const db = await getDb();
  if (!db || linhas.length === 0) {
    return { inseridos: 0, atualizados: 0, vinculadosComSeguranca: 0, semVinculo: 0, ambiguos: 0 };
  }

  const campoUnidade = unidadeId === 1 ? clientes.clienteSsu : unidadeId === 2 ? clientes.clienteRbs : null;
  if (!campoUnidade) throw new Error("Unidade física inválida para importação de atendimentos.");

  const unicosPorAtendimento = new Map<number, LinhaAtendimentoBelleImportada>();
  for (const linha of linhas) unicosPorAtendimento.set(linha.atendimentoBelleId, linha);
  const registros = Array.from(unicosPorAtendimento.values());

  const [clientesDaUnidade, existentes] = await Promise.all([
    db.select({
      id: clientes.id,
      celular: clientes.celular,
      celular2: clientes.celular2,
      telefone: clientes.telefone,
    }).from(clientes).where(eq(campoUnidade, true)),
    db.select({ atendimentoBelleId: belleAtendimentos.atendimentoBelleId })
      .from(belleAtendimentos)
      .where(and(eq(belleAtendimentos.unidadeId, unidadeId), inArray(belleAtendimentos.atendimentoBelleId, registros.map((linha) => linha.atendimentoBelleId)))),
  ]);

  const candidatosPorTelefone = new Map<string, Set<number>>();
  for (const cliente of clientesDaUnidade) {
    for (const telefone of [cliente.celular, cliente.celular2, cliente.telefone]) {
      const canonico = telefoneCanonico(telefone);
      if (!canonico) continue;
      const candidatos = candidatosPorTelefone.get(canonico) ?? new Set<number>();
      candidatos.add(cliente.id);
      candidatosPorTelefone.set(canonico, candidatos);
    }
  }

  const existentesIds = new Set(existentes.map((linha) => linha.atendimentoBelleId));
  let inseridos = 0;
  let atualizados = 0;
  let vinculadosComSeguranca = 0;
  let semVinculo = 0;
  let ambiguos = 0;

  const valoresParaGravar: InsertBelleAtendimento[] = [];
  for (const linha of registros) {
    const canonico = telefoneCanonico(linha.telefone);
    const candidatos = canonico ? candidatosPorTelefone.get(canonico) : undefined;
    const clienteId = candidatos?.size === 1 ? Array.from(candidatos)[0] : null;
    if (clienteId) vinculadosComSeguranca++;
    else if (candidatos && candidatos.size > 1) ambiguos++;
    else semVinculo++;

    const valores: InsertBelleAtendimento = {
      unidadeId,
      atendimentoBelleId: linha.atendimentoBelleId,
      clienteId,
      clienteNome: linha.clienteNome,
      telefone: linha.telefone,
      dataAtendimento: linha.dataAtendimento,
      horario: linha.horario,
      servicoCodigo: linha.servicoCodigo,
      servicoNome: linha.servicoNome,
      duracaoMinutos: linha.duracaoMinutos,
      profissionalNome: linha.profissionalNome,
      temPreferencia: linha.temPreferencia,
      planoBelleId: linha.planoBelleId,
      areaAplicacao: linha.areaAplicacao,
      tipo: linha.tipo,
      status: linha.status,
      importadoEm: new Date(),
    };
    valoresParaGravar.push(valores);
    if (existentesIds.has(linha.atendimentoBelleId)) atualizados++;
    else inseridos++;
  }

  for (let inicio = 0; inicio < valoresParaGravar.length; inicio += 250) {
    await db.insert(belleAtendimentos).values(valoresParaGravar.slice(inicio, inicio + 250)).onDuplicateKeyUpdate({
      set: {
        clienteId: sql`VALUES(clienteId)`,
        clienteNome: sql`VALUES(clienteNome)`,
        telefone: sql`VALUES(telefone)`,
        dataAtendimento: sql`VALUES(dataAtendimento)`,
        horario: sql`VALUES(horario)`,
        servicoCodigo: sql`VALUES(servicoCodigo)`,
        servicoNome: sql`VALUES(servicoNome)`,
        duracaoMinutos: sql`VALUES(duracaoMinutos)`,
        profissionalNome: sql`VALUES(profissionalNome)`,
        temPreferencia: sql`VALUES(temPreferencia)`,
        planoBelleId: sql`VALUES(planoBelleId)`,
        areaAplicacao: sql`VALUES(areaAplicacao)`,
        tipo: sql`VALUES(tipo)`,
        status: sql`VALUES(status)`,
        importadoEm: sql`VALUES(importadoEm)`,
      },
    });
  }

  // A planilha real ganha do agendamento inferido na conversa — uma vez
  // que o Belle traz um atendimento do mesmo cliente na mesma data nesse
  // import, o palpite pendente some (ver registrarAgendamentoInferidoBelle).
  //
  // Casa por NOME + DATA (nomesClienteCorrespondem), não por clienteId:
  // o palpite quase nunca tem clienteId (criado a partir da conversa,
  // antes de qualquer resolução formal — confirmado em produção
  // 2026-09-08, todos nulos) e boa parte das linhas reais importadas
  // também fica sem clienteId (só vincula quando o telefone bate com um
  // único cliente). Casar por clienteId praticamente nunca disparava —
  // os palpites "Agendado (IA)" nunca somiam depois do import de
  // verdade, ficando duplicados ao lado do atendimento real.
  const datasDoImport = Array.from(new Set(valoresParaGravar.map((v) => v.dataAtendimento)));
  const palpitesPendentes = datasDoImport.length > 0
    ? await db.select({ id: belleAtendimentos.id, clienteNome: belleAtendimentos.clienteNome, dataAtendimento: belleAtendimentos.dataAtendimento })
        .from(belleAtendimentos)
        .where(and(
          eq(belleAtendimentos.unidadeId, unidadeId),
          eq(belleAtendimentos.status, STATUS_AGENDADO_POR_IA),
          inArray(belleAtendimentos.dataAtendimento, datasDoImport),
        ))
    : [];
  const idsPalpitesSuperados = palpitesPendentes
    .filter((palpite) => valoresParaGravar.some((real) =>
      real.dataAtendimento === palpite.dataAtendimento && nomesClienteCorrespondem(real.clienteNome, palpite.clienteNome)
    ))
    .map((palpite) => palpite.id);
  if (idsPalpitesSuperados.length > 0) {
    await db.delete(belleAtendimentos).where(inArray(belleAtendimentos.id, idsPalpitesSuperados));
  }

  return { inseridos, atualizados, vinculadosComSeguranca, semVinculo, ambiguos };
}

export async function listarAtendimentosBellePorCliente(unidadeId: number, clienteId: number, limite = 12) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(belleAtendimentos)
    .where(and(eq(belleAtendimentos.unidadeId, unidadeId), eq(belleAtendimentos.clienteId, clienteId)))
    .orderBy(desc(belleAtendimentos.dataAtendimento), desc(belleAtendimentos.horario))
    .limit(limite);
}

export interface ResultadoImportacaoPlanosBelle {
  planosInseridos: number;
  planosAtualizados: number;
  servicosInseridos: number;
  servicosAtualizados: number;
  planosVinculadosComSeguranca: number;
  planosSemVinculo: number;
  planosAmbiguos: number;
}

function nomeCanonicoParaVinculo(nome: string | null): string | null {
  const resultado = (nome ?? "").trim().toLocaleLowerCase("pt-BR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
  return resultado || null;
}

/**
 * Espelha planos e seus serviços por unidade. O ID Belle do cliente, quando
 * disponível, prevalece; nomes únicos são apenas fallback para arquivos legados.
 */
export async function upsertPlanosBelleImportados(
  unidadeId: number,
  relatorio: RelatorioPlanosBelleImportado,
): Promise<ResultadoImportacaoPlanosBelle> {
  const db = await getDb();
  if (!db || relatorio.planos.length === 0) {
    return { planosInseridos: 0, planosAtualizados: 0, servicosInseridos: 0, servicosAtualizados: 0, planosVinculadosComSeguranca: 0, planosSemVinculo: 0, planosAmbiguos: 0 };
  }
  const campoUnidade = unidadeId === 1 ? clientes.clienteSsu : unidadeId === 2 ? clientes.clienteRbs : null;
  if (!campoUnidade) throw new Error("Unidade física inválida para importação de planos.");

  const [clientesDaUnidade, planosExistentes, servicosExistentes] = await Promise.all([
    db.select({ id: clientes.id, nome: clientes.nome, belleId: clientes.belleId }).from(clientes).where(eq(campoUnidade, true)),
    db.select({ planoBelleId: bellePlanosClientes.planoBelleId }).from(bellePlanosClientes)
      .where(and(eq(bellePlanosClientes.unidadeId, unidadeId), inArray(bellePlanosClientes.planoBelleId, relatorio.planos.map((plano) => plano.planoBelleId)))),
    db.select({ planoBelleId: bellePlanosServicos.planoBelleId, servicoCodigo: bellePlanosServicos.servicoCodigo }).from(bellePlanosServicos)
      .where(and(eq(bellePlanosServicos.unidadeId, unidadeId), inArray(bellePlanosServicos.planoBelleId, relatorio.planos.map((plano) => plano.planoBelleId)))),
  ]);
  const clientesPorNome = new Map<string, Set<number>>();
  const clientesPorBelleId = new Map<number, number>();
  for (const cliente of clientesDaUnidade) {
    clientesPorBelleId.set(cliente.belleId, cliente.id);
    const nome = nomeCanonicoParaVinculo(cliente.nome);
    if (!nome) continue;
    const candidatos = clientesPorNome.get(nome) ?? new Set<number>();
    candidatos.add(cliente.id);
    clientesPorNome.set(nome, candidatos);
  }
  const planosExistentesIds = new Set(planosExistentes.map((plano) => plano.planoBelleId));
  const servicosExistentesIds = new Set(servicosExistentes.map((servico) => `${servico.planoBelleId}:${servico.servicoCodigo}`));
  let planosInseridos = 0;
  let planosAtualizados = 0;
  let planosVinculadosComSeguranca = 0;
  let planosSemVinculo = 0;
  let planosAmbiguos = 0;

  for (const plano of relatorio.planos) {
    const candidatos = clientesPorNome.get(nomeCanonicoParaVinculo(plano.clienteNome) ?? "");
    const clienteIdPorBelle = plano.clienteBelleId ? clientesPorBelleId.get(plano.clienteBelleId) ?? null : null;
    const clienteIdPorNome = candidatos?.size === 1 ? Array.from(candidatos)[0] : null;
    const clienteId = clienteIdPorBelle ?? clienteIdPorNome;
    const vinculoOrigem = clienteIdPorBelle ? "id_belle" as const : clienteIdPorNome ? "nome" as const : null;
    if (clienteId) planosVinculadosComSeguranca++;
    else if (candidatos && candidatos.size > 1) planosAmbiguos++;
    else planosSemVinculo++;
    const valores: InsertBellePlanoCliente = {
      unidadeId,
      planoBelleId: plano.planoBelleId,
      clienteId,
      clienteBelleId: plano.clienteBelleId,
      vinculoOrigem,
      vinculadoEm: clienteId ? new Date() : null,
      clienteNome: plano.clienteNome,
      pagadorNome: plano.pagadorNome,
      status: plano.status,
      dataVenda: plano.dataVenda,
      validade: plano.validade,
      valor: plano.valor,
      desconto: plano.desconto,
      valorFinal: plano.valorFinal,
      tipo: plano.tipo,
      origem: plano.origem,
      campanha: plano.campanha,
      vendedorNome: plano.vendedorNome,
      importadoEm: new Date(),
    };
    await db.insert(bellePlanosClientes).values(valores).onDuplicateKeyUpdate({
      set: {
        clienteId: valores.clienteId,
        clienteBelleId: valores.clienteBelleId,
        vinculoOrigem: valores.vinculoOrigem,
        vinculadoEm: valores.vinculadoEm,
        clienteNome: valores.clienteNome,
        pagadorNome: valores.pagadorNome,
        status: valores.status,
        dataVenda: valores.dataVenda,
        validade: valores.validade,
        valor: valores.valor,
        desconto: valores.desconto,
        valorFinal: valores.valorFinal,
        tipo: valores.tipo,
        origem: valores.origem,
        campanha: valores.campanha,
        vendedorNome: valores.vendedorNome,
        importadoEm: valores.importadoEm,
      },
    });
    if (planosExistentesIds.has(plano.planoBelleId)) planosAtualizados++;
    else planosInseridos++;
  }

  const servicosUnicos = new Map<string, RelatorioPlanosBelleImportado["servicos"][number]>();
  for (const servico of relatorio.servicos) servicosUnicos.set(`${servico.planoBelleId}:${servico.servicoCodigo}`, servico);
  let servicosInseridos = 0;
  let servicosAtualizados = 0;
  for (const servico of Array.from(servicosUnicos.values())) {
    const valores: InsertBellePlanoServico = {
      unidadeId,
      planoBelleId: servico.planoBelleId,
      servicoCodigo: servico.servicoCodigo,
      servicoNome: servico.servicoNome,
      sessoes: servico.sessoes,
      restantes: servico.restantes,
      agendados: servico.agendados,
      importadoEm: new Date(),
    };
    await db.insert(bellePlanosServicos).values(valores).onDuplicateKeyUpdate({
      set: {
        servicoNome: valores.servicoNome,
        sessoes: valores.sessoes,
        restantes: valores.restantes,
        agendados: valores.agendados,
        importadoEm: valores.importadoEm,
      },
    });
    if (servicosExistentesIds.has(`${servico.planoBelleId}:${servico.servicoCodigo}`)) servicosAtualizados++;
    else servicosInseridos++;
  }
  return { planosInseridos, planosAtualizados, servicosInseridos, servicosAtualizados, planosVinculadosComSeguranca, planosSemVinculo, planosAmbiguos };
}

export interface ResultadoVinculosPlanosBelle {
  vinculadosPorId: number;
  planosNaoEncontrados: number;
  clientesNaoEncontrados: number;
}

/** Aplica a ponte cliente–plano exportada pelo Belle, sempre dentro da unidade. */
export async function aplicarVinculosPlanosBelle(
  unidadeId: number,
  vinculos: VinculoPlanoBelleImportado[],
): Promise<ResultadoVinculosPlanosBelle> {
  const db = await getDb();
  if (!db || vinculos.length === 0) return { vinculadosPorId: 0, planosNaoEncontrados: 0, clientesNaoEncontrados: 0 };
  const campoUnidade = unidadeId === 1 ? clientes.clienteSsu : unidadeId === 2 ? clientes.clienteRbs : null;
  if (!campoUnidade) throw new Error("Unidade física inválida para vincular planos.");
  const idsCliente = Array.from(new Set(vinculos.map((item) => item.clienteBelleId)));
  const idsPlano = Array.from(new Set(vinculos.map((item) => item.planoBelleId)));
  const [clientesDaUnidade, planosDaUnidade] = await Promise.all([
    db.select({ id: clientes.id, belleId: clientes.belleId }).from(clientes)
      .where(and(eq(campoUnidade, true), inArray(clientes.belleId, idsCliente))),
    db.select({ id: bellePlanosClientes.id, planoBelleId: bellePlanosClientes.planoBelleId }).from(bellePlanosClientes)
      .where(and(eq(bellePlanosClientes.unidadeId, unidadeId), inArray(bellePlanosClientes.planoBelleId, idsPlano))),
  ]);
  const clientePorBelleId = new Map(clientesDaUnidade.map((cliente) => [cliente.belleId, cliente.id]));
  const planoPorBelleId = new Map(planosDaUnidade.map((plano) => [plano.planoBelleId, plano.id]));
  let vinculadosPorId = 0;
  let planosNaoEncontrados = 0;
  let clientesNaoEncontrados = 0;

  for (const vinculo of vinculos) {
    const clienteId = clientePorBelleId.get(vinculo.clienteBelleId);
    const planoId = planoPorBelleId.get(vinculo.planoBelleId);
    if (!planoId) {
      planosNaoEncontrados++;
      continue;
    }
    if (!clienteId) {
      clientesNaoEncontrados++;
      continue;
    }
    await db.update(bellePlanosClientes).set({
      clienteId,
      clienteBelleId: vinculo.clienteBelleId,
      clienteNome: vinculo.clienteNome,
      vinculoOrigem: "id_belle",
      vinculadoEm: new Date(),
    }).where(and(eq(bellePlanosClientes.id, planoId), eq(bellePlanosClientes.unidadeId, unidadeId)));
    vinculadosPorId++;
  }
  return { vinculadosPorId, planosNaoEncontrados, clientesNaoEncontrados };
}

export async function listarPlanosBellePendentesVinculo(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  const campoUnidade = unidadeId === 1 ? clientes.clienteSsu : unidadeId === 2 ? clientes.clienteRbs : null;
  if (!campoUnidade) return [];
  const [planosPendentes, clientesDaUnidade] = await Promise.all([
    db.select().from(bellePlanosClientes)
      .where(and(eq(bellePlanosClientes.unidadeId, unidadeId), isNull(bellePlanosClientes.clienteId)))
      .orderBy(desc(bellePlanosClientes.importadoEm)),
    db.select({ id: clientes.id, belleId: clientes.belleId, nome: clientes.nome, celular: clientes.celular, cpf: clientes.cpf })
      .from(clientes).where(eq(campoUnidade, true)),
  ]);
  return planosPendentes.map((plano) => {
    const nome = nomeCanonicoParaVinculo(plano.clienteNome);
    const candidatos = clientesDaUnidade.filter((cliente) => nomeCanonicoParaVinculo(cliente.nome) === nome);
    return { ...plano, candidatos };
  });
}

export async function vincularPlanoBelleManualmente(unidadeId: number, planoBelleId: number, clienteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const campoUnidade = unidadeId === 1 ? clientes.clienteSsu : unidadeId === 2 ? clientes.clienteRbs : null;
  if (!campoUnidade) throw new Error("Unidade física inválida para vincular planos.");
  const cliente = (await db.select({ id: clientes.id, belleId: clientes.belleId }).from(clientes)
    .where(and(eq(clientes.id, clienteId), eq(campoUnidade, true))).limit(1))[0];
  if (!cliente) throw new Error("O cliente não pertence à unidade selecionada.");
  await db.update(bellePlanosClientes).set({
    clienteId: cliente.id,
    clienteBelleId: cliente.belleId,
    vinculoOrigem: "manual",
    vinculadoEm: new Date(),
  }).where(and(eq(bellePlanosClientes.unidadeId, unidadeId), eq(bellePlanosClientes.planoBelleId, planoBelleId)));
  return { success: true };
}

export async function listarPlanosBellePorCliente(unidadeId: number, clienteId: number) {
  const db = await getDb();
  if (!db) return [];
  const planos = await db.select().from(bellePlanosClientes)
    .where(and(eq(bellePlanosClientes.unidadeId, unidadeId), eq(bellePlanosClientes.clienteId, clienteId)))
    .orderBy(desc(bellePlanosClientes.validade), desc(bellePlanosClientes.dataVenda));
  if (planos.length === 0) return [];
  const ids = planos.map((plano) => plano.planoBelleId);
  const servicos = await db.select().from(bellePlanosServicos)
    .where(and(eq(bellePlanosServicos.unidadeId, unidadeId), inArray(bellePlanosServicos.planoBelleId, ids)))
    .orderBy(bellePlanosServicos.servicoNome);
  return planos.map((plano) => ({ ...plano, servicos: servicos.filter((servico) => servico.planoBelleId === plano.planoBelleId) }));
}

export interface RelatorioReindexTelefones {
  totalClientes: number;
  clientesIndexados: number;
  clientesSemTelefoneValido: number;
  telefonesIndexados: number;
  numerosCompartilhados: number;
  maiorGrupoTamanho: number;
  distribuicaoGrupos: { tamanho2: number; tamanho3: number; tamanho4Mais: number };
  gruposComCpfDuplicado: number;
  cpfsComMultiplosCadastros: number;
  amostraCpfsDuplicados: Array<{ cpf: string; clientes: Array<{ nome: string; ssu: boolean; rbs: boolean }> }>;
  amostraMaioresGrupos: Array<{ numeroCanonico: string; clientes: Array<{ nome: string; cpf: string | null }> }>;
  conversasAtualizadas: number;
}

/**
 * Reconstrói cliente_telefones do zero a partir do cadastro atual de
 * `clientes` e preenche inbox_conversas.telefoneNormalizado nas linhas
 * antigas (criadas antes dessa coluna existir, 2026-08-15). NÃO toca
 * em inboxConversas.clienteId nem em nenhum vínculo já feito — é só
 * recálculo do índice + relatório de auditoria (contagem de números
 * compartilhados por 2+ clientes, ex.: mãe/filha), pra decidir com
 * segurança se/quando trocar buscarClientesPorTelefone pra ler daqui.
 * Botão admin em Clientes.tsx, não roda sozinho.
 */
export async function backfillIndiceTelefones(): Promise<RelatorioReindexTelefones> {
  const db = await getDb();
  const vazio: RelatorioReindexTelefones = {
    totalClientes: 0, clientesIndexados: 0, clientesSemTelefoneValido: 0, telefonesIndexados: 0,
    numerosCompartilhados: 0, maiorGrupoTamanho: 0, distribuicaoGrupos: { tamanho2: 0, tamanho3: 0, tamanho4Mais: 0 },
    gruposComCpfDuplicado: 0, cpfsComMultiplosCadastros: 0, amostraCpfsDuplicados: [],
    amostraMaioresGrupos: [], conversasAtualizadas: 0,
  };
  if (!db) return vazio;

  const todosClientes = await db.select({
    id: clientes.id,
    nome: clientes.nome,
    cpf: clientes.cpf,
    celular: clientes.celular,
    celular2: clientes.celular2,
    telefone: clientes.telefone,
    clienteSsu: clientes.clienteSsu,
    clienteRbs: clientes.clienteRbs,
  }).from(clientes);
  const clientePorId = new Map(todosClientes.map((c) => [c.id, c]));

  // Independe de telefone — pega também o caso de um mesmo cliente
  // cadastrado 2x no Belle (1 registro por unidade, belleId diferente
  // em cada), mesmo quando o telefone informado difere entre os dois
  // cadastros. CPF é identificador exato, sem achismo de nome.
  const idsPorCpf = new Map<string, number[]>();
  for (const c of todosClientes) {
    if (!c.cpf) continue;
    const arr = idsPorCpf.get(c.cpf) ?? [];
    arr.push(c.id);
    idsPorCpf.set(c.cpf, arr);
  }
  const cpfsDuplicados = Array.from(idsPorCpf.entries()).filter(([, ids]) => ids.length > 1);
  const cpfsComMultiplosCadastros = cpfsDuplicados.length;
  const amostraCpfsDuplicados = cpfsDuplicados.slice(0, 10).map(([cpf, ids]) => ({
    cpf,
    clientes: ids.map((id) => {
      const c = clientePorId.get(id);
      return { nome: c?.nome ?? `#${id}`, ssu: !!c?.clienteSsu, rbs: !!c?.clienteRbs };
    }),
  }));

  const linhasIndice: InsertClienteTelefone[] = [];
  const clientesIndexadosSet = new Set<number>();
  const clientesPorNumero = new Map<string, Set<number>>();
  for (const c of todosClientes) {
    const linhas = telefonesParaIndexar(c.id, { celular: c.celular, celular2: c.celular2, telefone: c.telefone });
    for (const l of linhas) {
      linhasIndice.push(l);
      clientesIndexadosSet.add(c.id);
      const grupo = clientesPorNumero.get(l.numeroCanonico) ?? new Set<number>();
      grupo.add(c.id);
      clientesPorNumero.set(l.numeroCanonico, grupo);
    }
  }
  const gruposCompartilhados = Array.from(clientesPorNumero.entries()).filter(([, s]) => s.size > 1);
  const numerosCompartilhados = gruposCompartilhados.length;
  const maiorGrupoTamanho = gruposCompartilhados.reduce((max, [, s]) => Math.max(max, s.size), 0);
  const distribuicaoGrupos = gruposCompartilhados.reduce(
    (acc, [, s]) => {
      if (s.size === 2) acc.tamanho2++;
      else if (s.size === 3) acc.tamanho3++;
      else acc.tamanho4Mais++;
      return acc;
    },
    { tamanho2: 0, tamanho3: 0, tamanho4Mais: 0 },
  );
  const gruposComCpfDuplicado = gruposCompartilhados.filter(([, ids]) => {
    const cpfsVistos = new Set<string>();
    for (const id of Array.from(ids)) {
      const cpf = clientePorId.get(id)?.cpf;
      if (!cpf) continue;
      if (cpfsVistos.has(cpf)) return true;
      cpfsVistos.add(cpf);
    }
    return false;
  }).length;
  const amostraMaioresGrupos = gruposCompartilhados
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 10)
    .map(([numeroCanonico, ids]) => ({
      numeroCanonico,
      clientes: Array.from(ids).map((id) => {
        const c = clientePorId.get(id);
        return { nome: c?.nome ?? `#${id}`, cpf: c?.cpf ?? null };
      }),
    }));

  await db.delete(clienteTelefones);
  for (let i = 0; i < linhasIndice.length; i += 500) {
    await db.insert(clienteTelefones).values(linhasIndice.slice(i, i + 500));
  }

  const conversasSemNormalizacao = await db.select({
    id: inboxConversas.id,
    telefone: inboxConversas.telefone,
  }).from(inboxConversas).where(isNull(inboxConversas.telefoneNormalizado));
  let conversasAtualizadas = 0;
  for (const conversa of conversasSemNormalizacao) {
    const canonico = telefoneCanonico(conversa.telefone);
    if (!canonico) continue;
    await db.update(inboxConversas).set({ telefoneNormalizado: canonico }).where(eq(inboxConversas.id, conversa.id));
    conversasAtualizadas++;
  }

  return {
    totalClientes: todosClientes.length,
    clientesIndexados: clientesIndexadosSet.size,
    clientesSemTelefoneValido: todosClientes.length - clientesIndexadosSet.size,
    telefonesIndexados: linhasIndice.length,
    numerosCompartilhados,
    maiorGrupoTamanho,
    distribuicaoGrupos,
    gruposComCpfDuplicado,
    cpfsComMultiplosCadastros,
    amostraCpfsDuplicados,
    amostraMaioresGrupos,
    conversasAtualizadas,
  };
}

export async function resumoClientesLocal() {
  const db = await getDb();
  if (!db) return { total: 0, ssu: 0, rbs: 0, ambas: 0 };
  const todos = await db.select({ clienteSsu: clientes.clienteSsu, clienteRbs: clientes.clienteRbs }).from(clientes);
  let ssu = 0;
  let rbs = 0;
  let ambas = 0;
  for (const c of todos) {
    if (c.clienteSsu && c.clienteRbs) ambas++;
    else if (c.clienteSsu) ssu++;
    else if (c.clienteRbs) rbs++;
  }
  return { total: todos.length, ssu, rbs, ambas };
}

/**
 * Base inteira, sem filtro — busca e ordenação ficam por conta do
 * client (ver Clientes.tsx), evitando ida ao servidor a cada tecla
 * digitada. Limite alto (não removido) só como rede de segurança
 * contra crescimento descontrolado, não como paginação de verdade.
 */
/** Lista administrativa usada por Disparos; o recorte por unidade fica na função abaixo. */
export async function listClientesLocal() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      ...getTableColumns(clientes),
      // Disparos não trabalha com uma única unidade. Mantém o contrato
      // compatível sem associar contato de RBS e SSU ao mesmo cliente.
      ultimoContato: sql<Date | null>`NULL`.as("ultimoContato"),
    })
    .from(clientes)
    .orderBy(clientes.nome)
    .limit(20000);
}

/** Lista operacional da tela Clientes, com o último contato isolado por unidade. */
export async function listClientesLocalPorUnidade(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];

  // `ultimaMensagemEm` é mantido pela conversa para mensagens recebidas e
  // enviadas. Agregar somente conversas já vinculadas evita associar um contato
  // pelo telefone de forma especulativa (ex.: número compartilhado por família).
  const ultimosContatos = db
    .select({
      clienteId: inboxConversas.clienteId,
      ultimoContato: sql<Date>`MAX(${inboxConversas.ultimaMensagemEm})`.as("ultimoContato"),
    })
    .from(inboxConversas)
    .where(and(
      eq(inboxConversas.unidadeId, unidadeId),
      sql`${inboxConversas.clienteId} IS NOT NULL`,
    ))
    .groupBy(inboxConversas.clienteId)
    .as("ultimos_contatos_inbox");

  const pertenceAUnidade = unidadeId === 1
    ? eq(clientes.clienteSsu, true)
    : eq(clientes.clienteRbs, true);

  return db
    .select({
      ...getTableColumns(clientes),
      ultimoContato: ultimosContatos.ultimoContato,
    })
    .from(clientes)
    .leftJoin(ultimosContatos, eq(ultimosContatos.clienteId, clientes.id))
    .where(pertenceAUnidade)
    .orderBy(clientes.nome)
    .limit(20000);
}

/** Resolve nome/telefone dos clientes selecionados pra montar destinatários de um Disparo. */
export async function getClientesPorIds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  return db.select({ id: clientes.id, nome: clientes.nome, celular: clientes.celular, telefone: clientes.telefone })
    .from(clientes).where(inArray(clientes.id, ids));
}

/**
 * Busca por CPF na base local — usada pelo Copilot (server/routers.ts
 * copilot router) desde que a API do Belle foi desativada pra
 * clientes (acesso negado pelo franqueador, ver clientes.list/buscar
 * em routers.ts). Compara só dígitos, então funciona com ou sem
 * pontuação no CPF cadastrado.
 */
export async function buscarClienteLocalPorCpf(cpf: string) {
  const db = await getDb();
  if (!db) return undefined;
  const digitos = cpf.replace(/\D/g, "");
  if (digitos.length < 3) return undefined;
  const normalizar = (coluna: any) => sql`REPLACE(REPLACE(${coluna}, '.', ''), '-', '')`;
  const resultado = await db.select().from(clientes).where(sql`${normalizar(clientes.cpf)} = ${digitos}`).limit(1);
  return resultado[0];
}

// ===== Etiquetas manuais de cliente (2026-09-03) — base do construtor de
// segmentação de Disparos, junto com os filtros sobre campos calculados logo
// abaixo (contarClientesSegmento/listarClientesSegmento). Catálogo único,
// compartilhado entre as duas unidades. =====

export async function listEtiquetas(): Promise<Etiqueta[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(etiquetas).orderBy(etiquetas.nome);
}

export async function criarEtiqueta(nome: string, cor?: string | null, tipo: "manual" | "sistema" = "manual"): Promise<Etiqueta> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const nomeNormalizado = nome.trim();
  if (!nomeNormalizado) throw new Error("Nome da etiqueta é obrigatório.");
  const existente = await db.select().from(etiquetas).where(eq(etiquetas.nome, nomeNormalizado)).limit(1);
  if (existente[0]) return existente[0];
  const resultado = await db.insert(etiquetas).values({ nome: nomeNormalizado, cor: cor ?? null, tipo });
  return { id: Number(resultado[0].insertId), nome: nomeNormalizado, cor: cor ?? null, tipo, createdAt: new Date() };
}

export async function atualizarEtiqueta(id: number, nome: string, cor?: string | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const nomeNormalizado = nome.trim();
  if (!nomeNormalizado) throw new Error("Nome da etiqueta é obrigatório.");
  await db.update(etiquetas).set({ nome: nomeNormalizado, ...(cor !== undefined ? { cor } : {}) }).where(eq(etiquetas.id, id));
}

export async function excluirEtiqueta(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(clienteEtiquetas).where(eq(clienteEtiquetas.etiquetaId, id));
  await db.delete(etiquetas).where(eq(etiquetas.id, id));
}

export async function listEtiquetasPorCliente(clienteId: number): Promise<Etiqueta[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: etiquetas.id, nome: etiquetas.nome, cor: etiquetas.cor, tipo: etiquetas.tipo, createdAt: etiquetas.createdAt })
    .from(clienteEtiquetas)
    .innerJoin(etiquetas, eq(etiquetas.id, clienteEtiquetas.etiquetaId))
    .where(eq(clienteEtiquetas.clienteId, clienteId))
    .orderBy(etiquetas.nome);
}

export async function atribuirEtiqueta(clienteId: number, etiquetaId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.insert(clienteEtiquetas).values({ clienteId, etiquetaId })
    .onDuplicateKeyUpdate({ set: { clienteId: sql`${clienteEtiquetas.clienteId}` } });
}

/** Usado pelo nó de Fluxo "Remover etiqueta" — não cria, só busca (nada a remover se não existir). */
export async function buscarEtiquetaPorNome(nome: string): Promise<Etiqueta | null> {
  const db = await getDb();
  if (!db) return null;
  const resultado = await db.select().from(etiquetas).where(eq(etiquetas.nome, nome.trim())).limit(1);
  return resultado[0] ?? null;
}

// ===== Campos personalizados (2026-09-04) — valor numérico por cliente
// (ex.: "contador de resposta a disparo"), pensado pra ser incrementado por
// um nó de Fluxo (fase 2, ver server/fluxos.ts) e usado como filtro de
// segmentação em Disparos, do mesmo jeito que etiqueta. =====

export async function listCamposPersonalizados(): Promise<CampoPersonalizado[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(camposPersonalizados).orderBy(camposPersonalizados.nome);
}

export async function criarCampoPersonalizado(nome: string, descricao?: string | null): Promise<CampoPersonalizado> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const nomeNormalizado = nome.trim();
  if (!nomeNormalizado) throw new Error("Nome do campo é obrigatório.");
  const existente = await db.select().from(camposPersonalizados).where(eq(camposPersonalizados.nome, nomeNormalizado)).limit(1);
  if (existente[0]) return existente[0];
  const resultado = await db.insert(camposPersonalizados).values({ nome: nomeNormalizado, descricao: descricao ?? null, tipo: "numero" });
  return { id: Number(resultado[0].insertId), nome: nomeNormalizado, tipo: "numero", descricao: descricao ?? null, createdAt: new Date() };
}

export async function atualizarCampoPersonalizado(id: number, nome: string, descricao?: string | null): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const nomeNormalizado = nome.trim();
  if (!nomeNormalizado) throw new Error("Nome do campo é obrigatório.");
  await db.update(camposPersonalizados).set({ nome: nomeNormalizado, ...(descricao !== undefined ? { descricao } : {}) }).where(eq(camposPersonalizados.id, id));
}

export async function excluirCampoPersonalizado(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(clienteCamposValores).where(eq(clienteCamposValores.campoId, id));
  await db.delete(camposPersonalizados).where(eq(camposPersonalizados.id, id));
}

export async function listValoresCamposPorCliente(clienteId: number): Promise<Array<{ campoId: number; nome: string; valorNumero: string | null }>> {
  const db = await getDb();
  if (!db) return [];
  return db.select({ campoId: camposPersonalizados.id, nome: camposPersonalizados.nome, valorNumero: clienteCamposValores.valorNumero })
    .from(clienteCamposValores)
    .innerJoin(camposPersonalizados, eq(camposPersonalizados.id, clienteCamposValores.campoId))
    .where(eq(clienteCamposValores.clienteId, clienteId))
    .orderBy(camposPersonalizados.nome);
}

/** Soma `incremento` (pode ser negativo) ao valor atual do cliente pra esse campo — cria a linha com 0 + incremento se ainda não existir. */
export async function incrementarCampoCliente(clienteId: number, campoId: number, incremento: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.insert(clienteCamposValores).values({ clienteId, campoId, valorNumero: String(incremento) })
    .onDuplicateKeyUpdate({ set: { valorNumero: sql`${clienteCamposValores.valorNumero} + ${incremento}` } });
}

export async function definirValorCampoCliente(clienteId: number, campoId: number, valor: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.insert(clienteCamposValores).values({ clienteId, campoId, valorNumero: String(valor) })
    .onDuplicateKeyUpdate({ set: { valorNumero: String(valor) } });
}

// ===== Lista de espera por dia (2026-09-04) — sessão do dia lotado, ver
// listaEspera em schema.ts. Plano ativo é sempre recalculado na hora contra o
// Belle (classificarPlanosRelacionamento), nunca guardado na linha — evita
// mostrar "prioridade" pra quem o plano já venceu entre a entrada na fila e
// a consulta da tela. =====

export async function criarEntradaListaEspera(dados: {
  unidadeId: number;
  clienteId: number;
  conversaId?: number | null;
  data: string;
  horarioDesejado?: string | null;
  terapiaDesejada?: string | null;
  observacao?: string | null;
  criadoPorUserId?: number | null;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const resultado = await db.insert(listaEspera).values({
    unidadeId: dados.unidadeId,
    clienteId: dados.clienteId,
    conversaId: dados.conversaId ?? null,
    data: dados.data,
    horarioDesejado: dados.horarioDesejado?.trim() || null,
    terapiaDesejada: dados.terapiaDesejada?.trim() || null,
    observacao: dados.observacao?.trim() || null,
    criadoPorUserId: dados.criadoPorUserId ?? null,
  });
  return Number(resultado[0].insertId);
}

/** Datas com pelo menos 1 pedido "aguardando" na unidade, mais recente primeiro — vira a lista de "sessões" abertas na tela. */
export async function listDatasComListaEsperaAberta(unidadeId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const linhas = await db.selectDistinct({ data: listaEspera.data }).from(listaEspera)
    .where(and(eq(listaEspera.unidadeId, unidadeId), eq(listaEspera.status, "aguardando")))
    .orderBy(desc(listaEspera.data));
  return linhas.map((l) => l.data);
}

/**
 * Pedidos "aguardando" de um dia, com dados do cliente e se tem plano ativo.
 * Ordenado por prioridade (plano ativo primeiro) e, dentro de cada grupo, por
 * ordem de chegada — decisão do usuário: quem tem plano passa na frente, sem
 * embaralhar a ordem de pedido de cada grupo entre si.
 */
export async function listListaEsperaPorData(unidadeId: number, data: string) {
  const db = await getDb();
  if (!db) return [];
  const linhas = await db.select({
    id: listaEspera.id,
    clienteId: listaEspera.clienteId,
    conversaId: listaEspera.conversaId,
    horarioDesejado: listaEspera.horarioDesejado,
    terapiaDesejada: listaEspera.terapiaDesejada,
    observacao: listaEspera.observacao,
    createdAt: listaEspera.createdAt,
    clienteNome: clientes.nome,
    clienteCelular: clientes.celular,
    clienteTelefone: clientes.telefone,
  })
    .from(listaEspera)
    .innerJoin(clientes, eq(clientes.id, listaEspera.clienteId))
    .where(and(eq(listaEspera.unidadeId, unidadeId), eq(listaEspera.data, data), eq(listaEspera.status, "aguardando")))
    .orderBy(asc(listaEspera.createdAt));

  const hojeBrt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const comPlano = await Promise.all(linhas.map(async (linha) => {
    const planos = await listarPlanosBellePorCliente(unidadeId, linha.clienteId);
    const resumo = classificarPlanosRelacionamento(planos, hojeBrt);
    return { ...linha, temPlanoAtivo: resumo?.status === "ativo" };
  }));

  return comPlano.sort((a, b) => {
    if (a.temPlanoAtivo !== b.temPlanoAtivo) return a.temPlanoAtivo ? -1 : 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export async function atualizarStatusListaEspera(id: number, status: "convertido" | "cancelado"): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.update(listaEspera).set({ status }).where(eq(listaEspera.id, id));
}

export async function atualizarEntradaListaEspera(id: number, dados: {
  data: string;
  horarioDesejado?: string | null;
  terapiaDesejada?: string | null;
  observacao?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.update(listaEspera).set({
    data: dados.data,
    horarioDesejado: dados.horarioDesejado?.trim() || null,
    terapiaDesejada: dados.terapiaDesejada?.trim() || null,
    observacao: dados.observacao?.trim() || null,
  }).where(eq(listaEspera.id, id));
}

export async function removerEtiquetaDoCliente(clienteId: number, etiquetaId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  await db.delete(clienteEtiquetas).where(and(eq(clienteEtiquetas.clienteId, clienteId), eq(clienteEtiquetas.etiquetaId, etiquetaId)));
}

// ===== Segmentação de Disparos (2026-09-03) =====
// Construtor de filtro campo/operador/valor pro problema real: base de ~10 mil
// clientes, e a tela de Disparos só deixava buscar por nome. Os filtros sempre
// combinam por E (decisão do usuário — ver histórico da conversa; OU entre
// grupos fica pra depois se fizer falta). Cobre com dado que já existia
// (unidade, dias desde a última visita/cadastro, qtd. de atendimentos, terapia
// já feita no histórico do Belle) mais a etiqueta manual acima, pro que não dá
// pra derivar do Belle (ex.: "veio pelo Instagram").

type DbConectado = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type OperadorSegmento = "igual" | "diferente" | "maior" | "menor" | "maior_igual" | "menor_igual" | "contem";
export type CampoSegmento = "unidade" | "sexo" | "diasDesdeUltimoAtendimento" | "diasDesdeCadastro" | "qtdAtendimentos" | "terapiaFeita" | "etiqueta" | "campoPersonalizado"
  | "terapeutaPreferencial" | "diasDesdeUltimoContato" | "diasAteAniversario" | "diaSemanaUltimaVisita" | "diaSemanaUltimos180Dias" | "statusPlano";

export interface FiltroSegmento {
  campo: CampoSegmento;
  operador: OperadorSegmento;
  valor: string;
  /** Só quando campo === "campoPersonalizado": qual campo (campos_personalizados.id). */
  campoPersonalizadoId?: number;
}

function condicaoNumericaSql(expressao: ReturnType<typeof sql>, operador: OperadorSegmento, valor: number) {
  switch (operador) {
    case "igual": return sql`${expressao} = ${valor}`;
    case "diferente": return sql`${expressao} != ${valor}`;
    case "maior": return sql`${expressao} > ${valor}`;
    case "menor": return sql`${expressao} < ${valor}`;
    case "maior_igual": return sql`${expressao} >= ${valor}`;
    case "menor_igual": return sql`${expressao} <= ${valor}`;
    default: throw new Error(`Operador "${operador}" não é válido para este campo.`);
  }
}

/**
 * `unidadeId` só é conhecido dentro de um Funil de Reativação (a
 * Segmentação de Disparos, base inteira, não tem uma unidade única) —
 * por isso os 3 campos abaixo que dependem dele (terapeuta preferencial,
 * dias desde o último contato) travam com erro claro se usados fora
 * desse contexto, em vez de silenciosamente ignorar a unidade.
 */
async function condicaoFiltroSegmento(db: DbConectado, filtro: FiltroSegmento, unidadeId?: number) {
  switch (filtro.campo) {
    case "unidade": {
      if (filtro.operador !== "igual" && filtro.operador !== "diferente") {
        throw new Error('Campo "Unidade" só aceita operador igual/diferente.');
      }
      // Ramos separados (em vez de resolver a coluna numa variável) porque
      // clienteSsu/clienteRbs são colunas distintas — unificar num único tipo
      // de variável só pra passar pro eq() não compensa a perda de clareza.
      const valorBool = filtro.operador === "igual";
      if (filtro.valor === "ssu") return eq(clientes.clienteSsu, valorBool);
      if (filtro.valor === "rbs") return eq(clientes.clienteRbs, valorBool);
      throw new Error('Valor de "Unidade" deve ser "ssu" ou "rbs".');
    }
    case "sexo": {
      if (filtro.operador !== "igual" && filtro.operador !== "diferente") {
        throw new Error('Campo "Sexo" só aceita operador igual/diferente.');
      }
      const valor = filtro.valor as "Feminino" | "Masculino" | "Outros";
      return filtro.operador === "igual" ? eq(clientes.sexo, valor) : ne(clientes.sexo, valor);
    }
    case "diasDesdeUltimoAtendimento": {
      const valorNumero = Number(filtro.valor);
      if (!Number.isFinite(valorNumero)) throw new Error('Valor de "Dias desde a última visita" precisa ser um número.');
      const condicaoNumerica = condicaoNumericaSql(sql`DATEDIFF(CURDATE(), ${clientes.ultimoAtendimento})`, filtro.operador, valorNumero);
      // "maior"/"maior_igual": quem nunca teve atendimento (NULL) já conta
      // como "faz mais de X dias" — sem isso o DATEDIFF(CURDATE(), NULL) =
      // NULL derruba a linha da condição inteira (achado real do usuário,
      // mesmo problema em "diasDesdeUltimoContato" logo abaixo).
      const nuncaContaComoSempre = filtro.operador === "maior" || filtro.operador === "maior_igual";
      return nuncaContaComoSempre ? or(condicaoNumerica, isNull(clientes.ultimoAtendimento)) : condicaoNumerica;
    }
    case "diasDesdeCadastro": {
      const valorNumero = Number(filtro.valor);
      if (!Number.isFinite(valorNumero)) throw new Error('Valor de "Dias desde o cadastro" precisa ser um número.');
      return condicaoNumericaSql(sql`DATEDIFF(CURDATE(), ${clientes.dataCadastro})`, filtro.operador, valorNumero);
    }
    case "qtdAtendimentos": {
      const valorNumero = Number(filtro.valor);
      if (!Number.isFinite(valorNumero)) throw new Error('Valor de "Quantidade de atendimentos" precisa ser um número.');
      return condicaoNumericaSql(sql`${clientes.qtdAtendimentosFinalizados}`, filtro.operador, valorNumero);
    }
    case "terapiaFeita": {
      if (!filtro.valor.trim()) throw new Error('Valor de "Terapia já feita" é obrigatório.');
      if (filtro.operador !== "igual" && filtro.operador !== "contem") {
        throw new Error('Campo "Terapia já feita" só aceita operador igual/contém.');
      }
      const condicaoServico = filtro.operador === "igual"
        ? eq(belleAtendimentos.servicoNome, filtro.valor)
        : like(belleAtendimentos.servicoNome, `%${filtro.valor}%`);
      const subquery = db.select({ clienteId: belleAtendimentos.clienteId }).from(belleAtendimentos).where(condicaoServico);
      return inArray(clientes.id, subquery);
    }
    case "etiqueta": {
      if (!filtro.valor.trim()) throw new Error('Valor de "Etiqueta" é obrigatório.');
      if (filtro.operador !== "igual" && filtro.operador !== "diferente") {
        throw new Error('Campo "Etiqueta" só aceita operador igual (tem) / diferente (não tem).');
      }
      const subquery = db.select({ clienteId: clienteEtiquetas.clienteId })
        .from(clienteEtiquetas)
        .innerJoin(etiquetas, eq(etiquetas.id, clienteEtiquetas.etiquetaId))
        .where(eq(etiquetas.nome, filtro.valor));
      return filtro.operador === "igual" ? inArray(clientes.id, subquery) : notInArray(clientes.id, subquery);
    }
    case "campoPersonalizado": {
      if (!filtro.campoPersonalizadoId) throw new Error('Filtro de "Campo personalizado" precisa informar qual campo.');
      const valorNumero = Number(filtro.valor);
      if (!Number.isFinite(valorNumero)) throw new Error('Valor de "Campo personalizado" precisa ser um número.');
      const condicaoValor = condicaoNumericaSql(sql`${clienteCamposValores.valorNumero}`, filtro.operador, valorNumero);
      const subquery = db.select({ clienteId: clienteCamposValores.clienteId })
        .from(clienteCamposValores)
        .where(and(eq(clienteCamposValores.campoId, filtro.campoPersonalizadoId), condicaoValor));
      return inArray(clientes.id, subquery);
    }
    case "terapeutaPreferencial": {
      if (!filtro.valor.trim()) throw new Error('Valor de "Terapeuta preferencial" é obrigatório.');
      if (filtro.operador !== "igual" && filtro.operador !== "diferente") {
        throw new Error('Campo "Terapeuta preferencial" só aceita operador igual/diferente.');
      }
      if (!unidadeId) throw new Error('Campo "Terapeuta preferencial" só está disponível dentro de um funil de reativação.');
      const subquery = db.select({ clienteId: clientesPreferenciasTerapeuta.clienteId })
        .from(clientesPreferenciasTerapeuta)
        .where(and(eq(clientesPreferenciasTerapeuta.unidadeId, unidadeId), eq(clientesPreferenciasTerapeuta.terapeutaNome, filtro.valor)));
      return filtro.operador === "igual" ? inArray(clientes.id, subquery) : notInArray(clientes.id, subquery);
    }
    case "diasDesdeUltimoContato": {
      const valorNumero = Number(filtro.valor);
      if (!Number.isFinite(valorNumero)) throw new Error('Valor de "Dias desde o último contato" precisa ser um número.');
      if (!unidadeId) throw new Error('Campo "Dias desde o último contato" só está disponível dentro de um funil de reativação.');
      // Correlacionado por cliente — mesma lógica de listClientesLocalPorUnidade,
      // só que como subquery escalar em vez de LEFT JOIN agregado.
      const subqueryUltimoContato = sql`(SELECT MAX(${inboxConversas.ultimaMensagemEm}) FROM ${inboxConversas} WHERE ${inboxConversas.clienteId} = ${clientes.id} AND ${inboxConversas.unidadeId} = ${unidadeId})`;
      const condicaoNumerica = condicaoNumericaSql(sql`DATEDIFF(CURDATE(), ${subqueryUltimoContato})`, filtro.operador, valorNumero);
      // Mesmo ajuste do campo acima: quem nunca foi contatado (subquery
      // NULL) precisa contar como "faz mais de X dias" no "maior"/"maior_igual".
      const nuncaContaComoSempre = filtro.operador === "maior" || filtro.operador === "maior_igual";
      return nuncaContaComoSempre ? or(condicaoNumerica, sql`${subqueryUltimoContato} IS NULL`) : condicaoNumerica;
    }
    case "diasAteAniversario": {
      const valorNumero = Number(filtro.valor);
      if (!Number.isFinite(valorNumero)) throw new Error('Valor de "Dias até o aniversário" precisa ser um número.');
      // dataNascimento é "AAAA-MM-DD" em varchar — compara "MM-DD" como texto
      // (funciona porque os dois lados vêm zero-padded) pra decidir se o
      // aniversário desse ano já passou; se já passou, soma 1 ano antes do DATEDIFF.
      const mesDia = sql`SUBSTRING(${clientes.dataNascimento}, 6, 5)`;
      const hojeMesDia = sql`DATE_FORMAT(CURDATE(), '%m-%d')`;
      const proximoAniversario = sql`DATE_ADD(STR_TO_DATE(CONCAT(YEAR(CURDATE()), '-', ${mesDia}), '%Y-%m-%d'), INTERVAL IF(${mesDia} < ${hojeMesDia}, 1, 0) YEAR)`;
      return and(
        sql`${clientes.dataNascimento} IS NOT NULL AND ${clientes.dataNascimento} != ''`,
        condicaoNumericaSql(sql`DATEDIFF(${proximoAniversario}, CURDATE())`, filtro.operador, valorNumero),
      );
    }
    case "diaSemanaUltimaVisita": {
      if (filtro.operador !== "igual" && filtro.operador !== "diferente") {
        throw new Error('Campo "Dia da semana da última visita" só aceita operador igual/diferente.');
      }
      const dia = Number(filtro.valor);
      if (!Number.isInteger(dia) || dia < 1 || dia > 7) throw new Error('Valor de "Dia da semana da última visita" inválido.');
      // DAYOFWEEK do MySQL: 1 = domingo ... 7 = sábado (mesma convenção usada no seletor do front).
      const expressao = sql`DAYOFWEEK(STR_TO_DATE(${clientes.ultimoAtendimento}, '%Y-%m-%d'))`;
      return filtro.operador === "igual" ? sql`${expressao} = ${dia}` : sql`${expressao} != ${dia}`;
    }
    case "diaSemanaUltimos180Dias": {
      if (filtro.operador !== "igual" && filtro.operador !== "diferente") {
        throw new Error('Campo "Dia semana 180 dias" só aceita operador igual/diferente.');
      }
      const dia = Number(filtro.valor);
      if (!Number.isInteger(dia) || dia < 1 || dia > 7) throw new Error('Valor de "Dia semana 180 dias" inválido.');
      if (!unidadeId) throw new Error('Campo "Dia semana 180 dias" só está disponível dentro de um funil de reativação.');
      // Não é só o último atendimento: qualquer atendimento "Atendido" (de
      // fato compareceu) nos últimos 180 dias cujo dia da semana bata conta —
      // um cliente de sábado que também veio 1x numa segunda tem disponibilidade
      // demonstrada de segunda, e precisa aparecer ao preencher agenda de segunda.
      const subquery = db.select({ clienteId: belleAtendimentos.clienteId })
        .from(belleAtendimentos)
        .where(and(
          eq(belleAtendimentos.unidadeId, unidadeId),
          eq(belleAtendimentos.status, "Atendido"),
          isNotNull(belleAtendimentos.clienteId),
          sql`${belleAtendimentos.dataAtendimento} >= DATE_SUB(CURDATE(), INTERVAL 180 DAY)`,
          sql`DAYOFWEEK(STR_TO_DATE(${belleAtendimentos.dataAtendimento}, '%Y-%m-%d')) = ${dia}`,
        ));
      return filtro.operador === "igual" ? inArray(clientes.id, subquery) : notInArray(clientes.id, subquery);
    }
    case "statusPlano": {
      if (filtro.operador !== "igual" && filtro.operador !== "diferente") {
        throw new Error('Campo "Status do plano" só aceita operador igual/diferente.');
      }
      if (filtro.valor !== "ativo" && filtro.valor !== "inativo") throw new Error('Valor de "Status do plano" deve ser "ativo" ou "inativo".');
      if (!unidadeId) throw new Error('Campo "Status do plano" só está disponível dentro de um funil de reativação.');
      // Ativo = tem pelo menos 1 plano espelhado do Belle com validade em
      // aberto (ou sem validade cadastrada) E saldo de sessão > 0 em algum
      // serviço — mesmo critério de classificarPlanosRelacionamento, só que
      // como condição SQL em vez de calculado sobre os planos já carregados.
      const temPlanoAtivo = sql`EXISTS (
        SELECT 1 FROM ${bellePlanosClientes} bpc
        WHERE bpc.clienteId = ${clientes.id} AND bpc.unidadeId = ${unidadeId}
          AND (bpc.validade IS NULL OR bpc.validade >= CURDATE())
          AND EXISTS (
            SELECT 1 FROM ${bellePlanosServicos} bps
            WHERE bps.unidadeId = bpc.unidadeId AND bps.planoBelleId = bpc.planoBelleId AND bps.restantes > 0
          )
      )`;
      const querQuemTemAtivo = (filtro.operador === "igual") === (filtro.valor === "ativo");
      return querQuemTemAtivo ? temPlanoAtivo : sql`NOT ${temPlanoAtivo}`;
    }
    default:
      throw new Error("Campo de segmentação desconhecido.");
  }
}

export async function condicoesSegmento(db: DbConectado, filtros: FiltroSegmento[], unidadeId?: number) {
  const condicoes = [];
  for (const filtro of filtros) condicoes.push(await condicaoFiltroSegmento(db, filtro, unidadeId));
  return condicoes;
}

/** `unidadeId` só é necessário quando os filtros incluem campos por unidade (ver condicaoFiltroSegmento) — pré-visualização do Funil de Reativação. */
export async function contarClientesSegmento(filtros: FiltroSegmento[], unidadeId?: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const condicoes = await condicoesSegmento(db, filtros, unidadeId);
  const resultado = await db.select({ total: sql<number>`COUNT(*)` }).from(clientes)
    .where(condicoes.length > 0 ? and(...condicoes) : undefined);
  return Number(resultado[0]?.total ?? 0);
}

/** Usado tanto pra amostra na tela quanto pra resolver os destinatários finais ao criar o disparo. */
export async function listarClientesSegmento(filtros: FiltroSegmento[], limite = 20000) {
  const db = await getDb();
  if (!db) return [];
  const condicoes = await condicoesSegmento(db, filtros);
  return db.select({ id: clientes.id, nome: clientes.nome, celular: clientes.celular, telefone: clientes.telefone })
    .from(clientes)
    .where(condicoes.length > 0 ? and(...condicoes) : undefined)
    .orderBy(clientes.nome)
    .limit(limite);
}

/** Lista de serviços distintos já atendidos, pro autocomplete do filtro "Terapia já feita". */
export async function opcoesTerapias(limite = 300): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const linhas = await db.selectDistinct({ servicoNome: belleAtendimentos.servicoNome }).from(belleAtendimentos)
    .where(sql`${belleAtendimentos.servicoNome} IS NOT NULL AND ${belleAtendimentos.servicoNome} != ''`)
    .orderBy(belleAtendimentos.servicoNome)
    .limit(limite);
  return linhas.map((l) => l.servicoNome as string).filter(Boolean);
}

// ===== Funil de Reativação (2026-09-10) — extensão da base de clientes com
// os mesmos filtros da Segmentação de Disparos, mais uma etapa (status) por
// cliente/unidade que a recepção avança conforme liga/manda mensagem. Sem
// depender do Belle: pensado especificamente para o período em que a API do
// Belle está com acesso negado (ver listClientesLocalPorUnidade acima). =====

export type StatusReativacao = "inativo" | "mensagem_enviada" | "qualificado" | "agendado" | "atendido";

const ETIQUETA_NAO_REATIVAR = "Não reativar";

export async function listFunisReativacao(unidadeId: number): Promise<FunilReativacao[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(funisReativacao)
    .where(and(eq(funisReativacao.unidadeId, unidadeId), eq(funisReativacao.grupo, "estrategica")))
    .orderBy(funisReativacao.nome);
}

export type FunilVirtual = { id: string; nome: string; filtros: FiltroSegmento[] };

const DIAS_SEMANA_LABELS: Array<{ valor: number; label: string }> = [
  { valor: 1, label: "Domingo" }, { valor: 2, label: "Segunda" }, { valor: 3, label: "Terça" },
  { valor: 4, label: "Quarta" }, { valor: 5, label: "Quinta" }, { valor: 6, label: "Sexta" }, { valor: 7, label: "Sábado" },
];

/** Sem atendimento nos últimos 30 dias — mesmo limiar do primeiro funil "estratégico" criado manualmente (referência pro grupo virtual). */
const DIAS_SEM_ATENDIMENTO_PADRAO = "30";

/** "Terapeuta" sintético (id 60001/60002) usado quando a preferência ainda depende de sorteio — não é uma pessoa, não tem funil próprio. */
const TERAPEUTA_PENDENTE_SORTEIO = "Pendente de sorteio";

/**
 * Grupo "por terapeuta" (2026-09-11) — 1 funil por terapeuta ativo da
 * unidade (exceto o placeholder "Pendente de sorteio", que não é uma
 * pessoa de verdade), sempre em sincronia com o cadastro (sem gravar
 * nada, sem precisar "regenerar" quando um terapeuta entra/sai). Cada
 * um: prefere esse terapeuta + sem atendimento há 30+ dias + sem contato
 * há 30+ dias (evita repetir quem a recepção já está no meio de agendar)
 * + fora da etiqueta "Não reativar".
 */
export async function funisVirtuaisPorTerapeuta(unidadeId: number): Promise<FunilVirtual[]> {
  const terapeutasAtivos = await listTerapeutasAtivos(unidadeId);
  return terapeutasAtivos
    .filter((t) => t.nomeAbreviado !== TERAPEUTA_PENDENTE_SORTEIO)
    .map((t) => ({
      id: `terapeuta-${t.id}`,
      nome: `Pref. ${t.nomeAbreviado} · ${DIAS_SEM_ATENDIMENTO_PADRAO}d+`,
      filtros: [
        { campo: "terapeutaPreferencial", operador: "igual", valor: t.nomeAbreviado },
        { campo: "diasDesdeUltimoAtendimento", operador: "maior_igual", valor: DIAS_SEM_ATENDIMENTO_PADRAO },
        { campo: "diasDesdeUltimoContato", operador: "maior_igual", valor: DIAS_SEM_ATENDIMENTO_PADRAO },
        { campo: "etiqueta", operador: "diferente", valor: ETIQUETA_NAO_REATIVAR },
      ] as FiltroSegmento[],
    }));
}

/**
 * Grupo "por data" (2026-09-11) — 1 funil por dia da semana, pra encher a
 * agenda de um dia específico com quem já demonstrou disponibilidade
 * nele (ver campo "diaSemanaUltimos180Dias"), está parado há 30+ dias e
 * sem contato recente (mesmo raciocínio do grupo "por terapeuta" acima).
 */
export function funisVirtuaisPorData(): FunilVirtual[] {
  return DIAS_SEMANA_LABELS.map((d) => ({
    id: `dia-${d.valor}`,
    nome: `Costuma vir ${d.label} · ${DIAS_SEM_ATENDIMENTO_PADRAO}d+`,
    filtros: [
      { campo: "diaSemanaUltimos180Dias", operador: "igual", valor: String(d.valor) },
      { campo: "diasDesdeUltimoAtendimento", operador: "maior_igual", valor: DIAS_SEM_ATENDIMENTO_PADRAO },
      { campo: "diasDesdeUltimoContato", operador: "maior_igual", valor: DIAS_SEM_ATENDIMENTO_PADRAO },
      { campo: "etiqueta", operador: "diferente", valor: ETIQUETA_NAO_REATIVAR },
    ] as FiltroSegmento[],
  }));
}

/** Serviços distintos já atendidos NA UNIDADE (opcoesTerapias, mais acima, é base inteira — usada em outro contexto, sem mexer nela). */
/**
 * Nomes de serviço "avulsos" (2026-09-11) — o relatório de atendimentos do
 * Belle grava reserva com mais de 1 terapia como uma linha só, valores
 * separados por vírgula (ex.: "Alongamento 30 ,1784-Esfoliacao Corporal
 * 60"), e o 2º+ item da combinação vem com um código numérico na frente
 * ("1784-"). Descarta toda linha com vírgula (é combinação, não terapia
 * avulsa) e tira o prefixo de código das que sobram, pra achado real do
 * usuário: a lista "por terapia" tava um mostruário de combinações e
 * código em vez do nome limpo do serviço.
 */
async function listServicosAvulsosPorUnidade(unidadeId: number, limite = 150): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const linhas = await db.selectDistinct({ servicoNome: belleAtendimentos.servicoNome }).from(belleAtendimentos)
    .where(and(eq(belleAtendimentos.unidadeId, unidadeId), sql`${belleAtendimentos.servicoNome} IS NOT NULL AND ${belleAtendimentos.servicoNome} != ''`))
    .limit(2000);
  const nomes = new Set<string>();
  for (const linha of linhas) {
    const bruto = (linha.servicoNome as string) ?? "";
    if (bruto.includes(",")) continue;
    const semCodigo = bruto.replace(/^\d+-\s*/, "").trim();
    if (semCodigo) nomes.add(semCodigo);
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR")).slice(0, limite);
}

/**
 * Grupo "por terapia" (2026-09-11) — 1 funil por terapia avulsa (sem
 * combinação, sem código) já atendida na unidade, pra campanhas
 * específicas (ex.: "todo mundo que já fez Drenagem"). O filtro usa
 * "contém" (não "igual") de propósito: pega tanto quem fez a terapia
 * sozinha quanto quem fez como parte de uma combinação — só a LISTA de
 * funis exclui combinação, pra não virar um mostruário de permutações.
 * Mesmo padrão dos outros 2 grupos virtuais: sem atendimento/contato há
 * 30+ dias, fora da etiqueta "Não reativar".
 */
export async function funisVirtuaisPorTerapia(unidadeId: number): Promise<FunilVirtual[]> {
  const servicos = await listServicosAvulsosPorUnidade(unidadeId);
  return servicos.map((nome) => ({
    id: `terapia-${nome}`,
    nome: `Já fez ${nome} · ${DIAS_SEM_ATENDIMENTO_PADRAO}d+`,
    filtros: [
      { campo: "terapiaFeita", operador: "contem", valor: nome },
      { campo: "diasDesdeUltimoAtendimento", operador: "maior_igual", valor: DIAS_SEM_ATENDIMENTO_PADRAO },
      { campo: "diasDesdeUltimoContato", operador: "maior_igual", valor: DIAS_SEM_ATENDIMENTO_PADRAO },
      { campo: "etiqueta", operador: "diferente", valor: ETIQUETA_NAO_REATIVAR },
    ] as FiltroSegmento[],
  }));
}

export type GrupoVirtualReativacao = "por_terapeuta" | "por_data" | "por_terapia";

/** ids ocultados de um grupo virtual — devolvido como Set pra checagem O(1) contra a lista calculada na hora. */
export async function listItensOcultosReativacao(unidadeId: number, grupo: GrupoVirtualReativacao): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();
  const linhas = await db.select({ itemId: funisReativacaoOcultos.itemId }).from(funisReativacaoOcultos)
    .where(and(eq(funisReativacaoOcultos.unidadeId, unidadeId), eq(funisReativacaoOcultos.grupo, grupo)));
  return new Set(linhas.map((l) => l.itemId));
}

export async function ocultarItemGrupoReativacao(unidadeId: number, grupo: GrupoVirtualReativacao, itemId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(funisReativacaoOcultos).values({ unidadeId, grupo, itemId })
    .onDuplicateKeyUpdate({ set: { itemId: sql`${funisReativacaoOcultos.itemId}` } });
}

export async function reexibirItemGrupoReativacao(unidadeId: number, grupo: GrupoVirtualReativacao, itemId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(funisReativacaoOcultos)
    .where(and(eq(funisReativacaoOcultos.unidadeId, unidadeId), eq(funisReativacaoOcultos.grupo, grupo), eq(funisReativacaoOcultos.itemId, itemId)));
}

export async function criarFunilReativacao(input: { unidadeId: number; nome: string; filtros: FiltroSegmento[] }): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível.");
  const resultado = await db.insert(funisReativacao).values({ unidadeId: input.unidadeId, nome: input.nome, filtros: JSON.stringify(input.filtros) });
  return Number(resultado[0].insertId);
}

export async function obterFunilReativacaoPorId(id: number): Promise<FunilReativacao | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const linhas = await db.select().from(funisReativacao).where(eq(funisReativacao.id, id)).limit(1);
  return linhas[0];
}

export async function atualizarFunilReativacao(id: number, input: { nome: string; filtros: FiltroSegmento[] }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(funisReativacao).set({ nome: input.nome, filtros: JSON.stringify(input.filtros) }).where(eq(funisReativacao.id, id));
}

export async function excluirFunilReativacao(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(funisReativacao).where(eq(funisReativacao.id, id));
}

/**
 * Contagem por etapa de um funil, sem carregar a lista de clientes — é o
 * que alimenta a "caixinha" de cada funil no cabeçalho (e, mais pra
 * frente, o resumo no dashboard da recepção). Mesma condição de
 * listClientesFunilReativacao, só que agregada em vez de linha a linha.
 */
export async function resumoFunilReativacao(unidadeId: number, filtros: FiltroSegmento[]): Promise<{ total: number; porEtapa: Record<StatusReativacao, number> }> {
  const db = await getDb();
  const vazio = { total: 0, porEtapa: {} as Record<StatusReativacao, number> };
  if (!db) return vazio;
  const condicoesFiltro = await condicoesSegmento(db, filtros, unidadeId);
  const pertenceAUnidade = unidadeId === 1 ? eq(clientes.clienteSsu, true) : eq(clientes.clienteRbs, true);
  const statusExpressao = sql<StatusReativacao>`COALESCE(${reativacaoStatus.status}, 'inativo')`;
  const linhas = await db.select({ status: statusExpressao, total: sql<number>`COUNT(*)` })
    .from(clientes)
    .leftJoin(reativacaoStatus, and(eq(reativacaoStatus.clienteId, clientes.id), eq(reativacaoStatus.unidadeId, unidadeId)))
    .where(and(pertenceAUnidade, ...condicoesFiltro))
    .groupBy(statusExpressao);
  const porEtapa = Object.fromEntries(linhas.map((l) => [l.status, Number(l.total)])) as Record<StatusReativacao, number>;
  const total = linhas.reduce((soma, l) => soma + Number(l.total), 0);
  return { total, porEtapa };
}

/**
 * Clientes de um funil: mesmos filtros da Segmentação de Disparos, restritos
 * à unidade selecionada (como a tela Clientes), com a etapa de reativação já
 * resolvida (padrão "inativo" quando o cliente nunca foi movido). Ordenado
 * por potencial — quem mais visitou antes de sumir primeiro, e entre
 * empates, quem está parado há mais tempo — para a recepção ligar pelos de
 * maior potencial primeiro.
 */
export async function listClientesFunilReativacao(unidadeId: number, filtros: FiltroSegmento[]) {
  const db = await getDb();
  if (!db) return [];
  const condicoesFiltro = await condicoesSegmento(db, filtros, unidadeId);
  const pertenceAUnidade = unidadeId === 1 ? eq(clientes.clienteSsu, true) : eq(clientes.clienteRbs, true);
  // Mesmo cálculo de listClientesLocalPorUnidade (Clientes.tsx): só conta
  // conversas já vinculadas ao cliente, isoladas por unidade.
  const ultimosContatos = db.select({
    clienteId: inboxConversas.clienteId,
    ultimoContato: sql<Date>`MAX(${inboxConversas.ultimaMensagemEm})`.as("ultimoContato"),
  })
    .from(inboxConversas)
    .where(and(eq(inboxConversas.unidadeId, unidadeId), sql`${inboxConversas.clienteId} IS NOT NULL`))
    .groupBy(inboxConversas.clienteId)
    .as("ultimos_contatos_funil");
  return db.select({
    id: clientes.id,
    nome: clientes.nome,
    celular: clientes.celular,
    email: clientes.email,
    dataNascimento: clientes.dataNascimento,
    ultimoAtendimento: clientes.ultimoAtendimento,
    qtdAtendimentosFinalizados: clientes.qtdAtendimentosFinalizados,
    ultimoContato: ultimosContatos.ultimoContato,
    status: sql<StatusReativacao>`COALESCE(${reativacaoStatus.status}, 'inativo')`,
    statusAtualizadoEm: reativacaoStatus.updatedAt,
    // Não-nulo = cliente já marcado; o texto é o motivo salvo no clique do botão.
    naoReativarMotivo: sql<string | null>`(SELECT ce.motivo FROM ${clienteEtiquetas} ce INNER JOIN ${etiquetas} et ON et.id = ce.etiquetaId WHERE ce.clienteId = ${clientes.id} AND et.nome = ${ETIQUETA_NAO_REATIVAR} LIMIT 1)`,
  })
    .from(clientes)
    .leftJoin(reativacaoStatus, and(eq(reativacaoStatus.clienteId, clientes.id), eq(reativacaoStatus.unidadeId, unidadeId)))
    .leftJoin(ultimosContatos, eq(ultimosContatos.clienteId, clientes.id))
    .where(and(pertenceAUnidade, ...condicoesFiltro))
    .orderBy(desc(clientes.qtdAtendimentosFinalizados), asc(clientes.ultimoAtendimento))
    .limit(2000);
}

/**
 * Marca (ou atualiza o motivo d)o cliente que pediu pra não receber mais
 * contato de reativação — reaproveita o sistema de etiquetas já existente
 * (get-or-create pelo nome) em vez de um campo à parte, pra continuar
 * filtrável pelo construtor de segmentação (campo "etiqueta", diferente).
 */
export async function marcarClienteNaoReativar(clienteId: number, motivo: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const etiqueta = await criarEtiqueta(ETIQUETA_NAO_REATIVAR, null, "manual");
  await db.insert(clienteEtiquetas).values({ clienteId, etiquetaId: etiqueta.id, motivo })
    .onDuplicateKeyUpdate({ set: { motivo } });
}

export async function definirStatusReativacao(clienteId: number, unidadeId: number, status: StatusReativacao): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(reativacaoStatus).values({ clienteId, unidadeId, status })
    .onDuplicateKeyUpdate({ set: { status, updatedAt: new Date() } });
}

// ===== Contatos do Funil de Reativação e composição da meta (2026-09-11)
// — o "incentivo pra fazer isso todo dia" pedido pelo usuário. Meta e
// prêmio são sempre da recepção como equipe (achado real do usuário: é
// comum uma pessoa iniciar o atendimento e outra terminar, então meta
// individual não funciona) — por isso todo progresso/conversão abaixo é
// agregado por unidade, nunca filtrado por atendente. O contato em si
// ainda grava quem registrou (atendenteId), só pra auditoria — não pra
// comparar pessoas. Um contato é gravado automaticamente quando a
// recepção abre o WhatsApp de um cliente dentro do funil (ver
// routers.ts); único por atendente+cliente+dia, pra clicar de novo no
// mesmo cliente não inflar a contagem.

function hojeSaoPaulo(): string {
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

function horaSaoPaulo(): number {
  const partes = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).formatToParts(new Date());
  return Number(partes.find((p) => p.type === "hour")?.value ?? "0");
}

export async function registrarContatoReativacao(input: { unidadeId: number; atendenteId: number; clienteId: number; funilOrigem?: string | null }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const funilOrigem = input.funilOrigem ?? null;
  await db.insert(reativacaoContatos).values({
    unidadeId: input.unidadeId, atendenteId: input.atendenteId, clienteId: input.clienteId,
    funilOrigem, data: hojeSaoPaulo(),
  }).onDuplicateKeyUpdate({ set: { funilOrigem } });
}

/** Contatos de HOJE feitos por qualquer atendente da unidade — número da equipe, não individual. */
export async function contatosReativacaoHoje(unidadeId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const linhas = await db.select({ total: sql<number>`COUNT(*)` }).from(reativacaoContatos)
    .where(and(eq(reativacaoContatos.unidadeId, unidadeId), eq(reativacaoContatos.data, hojeSaoPaulo())));
  return Number(linhas[0]?.total ?? 0);
}

/**
 * Contatados x convertidos numa janela de dias, unidade inteira.
 * "Convertido" = ultimoAtendimento do cliente é na data do contato ou
 * depois (voltou depois de ser contatado); é derivado, não exige marcar
 * nada manualmente.
 */
export async function conversaoContatosReativacao(unidadeId: number, janelaDias = 30): Promise<{ contatados: number; convertidos: number }> {
  const db = await getDb();
  if (!db) return { contatados: 0, convertidos: 0 };
  const linhas = await db.select({ data: reativacaoContatos.data, ultimoAtendimento: clientes.ultimoAtendimento })
    .from(reativacaoContatos)
    .innerJoin(clientes, eq(clientes.id, reativacaoContatos.clienteId))
    .where(and(
      eq(reativacaoContatos.unidadeId, unidadeId),
      sql`${reativacaoContatos.data} >= DATE_SUB(CURDATE(), INTERVAL ${janelaDias} DAY)`,
    ));
  const contatados = linhas.length;
  const convertidos = linhas.filter((l) => l.ultimoAtendimento && l.ultimoAtendimento >= l.data).length;
  return { contatados, convertidos };
}

/**
 * A meta mensal de faturamento (2026-09-12) mora em `resumo_mensal_unidade`
 * (coluna metaFaturamento), sincronizada da aba "Metas" da planilha
 * "Contabilidade SSU e RBS" — achado real do usuário: a tabela `metas`
 * (mes/ano soltos, editável por Financeiro > Visão Geral > Metas) nunca
 * teve linha nenhuma gravada; a de verdade, que a unidade já usa e
 * mantém pela planilha, é essa. Sem edição local aqui de propósito — um
 * valor digitado no app seria sobrescrito no próximo "Sincronizar tudo".
 */
export async function getMetaMensalAtual(unidadeId: number): Promise<{ valorFaturamento: string | null } | undefined> {
  const mesAno = hojeSaoPaulo().slice(0, 7);
  const db = await getDb();
  if (!db) return undefined;
  const linhas = await db.select({ valorFaturamento: resumoMensalUnidade.metaFaturamento })
    .from(resumoMensalUnidade)
    .where(and(eq(resumoMensalUnidade.unidadeId, unidadeId), eq(resumoMensalUnidade.mesAno, mesAno)))
    .limit(1);
  return linhas[0];
}

const TICKET_MEDIO_PADRAO = 230; // meio do intervalo informado pelo usuário (R$200–260)
function chaveTicketMedioReativacao(unidadeId: number): string {
  return `reativacao_ticket_medio_unidade_${unidadeId}`;
}

export async function getTicketMedioReativacao(unidadeId: number): Promise<number> {
  const db = await getDb();
  if (!db) return TICKET_MEDIO_PADRAO;
  const linhas = await db.select().from(configuracoes).where(eq(configuracoes.chave, chaveTicketMedioReativacao(unidadeId))).limit(1);
  const valor = linhas[0]?.valor ? Number(linhas[0].valor) : NaN;
  return Number.isFinite(valor) && valor > 0 ? valor : TICKET_MEDIO_PADRAO;
}

export async function definirTicketMedioReativacao(unidadeId: number, valor: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const chave = chaveTicketMedioReativacao(unidadeId);
  await db.insert(configuracoes).values({ chave, valor: String(valor) }).onDuplicateKeyUpdate({ set: { valor: String(valor) } });
}

/**
 * Soma de "receitas" (DRE) por dia num intervalo — mesmas 3 fontes de
 * listDreAgregado (extrato sem split + splits + vendas de adquirente),
 * só que por dia em vez de somado no intervalo inteiro; listDreAgregado
 * não expõe granularidade diária, por isso essa versão existe à parte
 * (usada tanto pela evolução do mês corrente quanto pela média
 * histórica por dia da semana, abaixo).
 */
async function receitaPorDiaNoIntervalo(unidadeId: number, dataInicio: string, dataFim: string): Promise<Map<string, number>> {
  const db = await getDb();
  const porDia = new Map<string, number>();
  if (!db) return porDia;

  const idsReceita = new Set(
    (await db.select({ id: dreDescricoes.id })
      .from(dreDescricoes)
      .innerJoin(dreCategorias, eq(dreCategorias.id, dreDescricoes.dreCategoriaId))
      .where(eq(dreCategorias.secao, "receitas"))
    ).map((l) => l.id),
  );
  const soma = (dataIso: string, dreDescricaoId: number | null, valor: string | null) => {
    if (dreDescricaoId === null || valor === null || !idsReceita.has(dreDescricaoId)) return;
    porDia.set(dataIso, (porDia.get(dataIso) ?? 0) + parseFloat(valor));
  };

  const [semSplit, splits, vendas] = await Promise.all([
    db.select({ dataEntrada: interExtratos.dataEntrada, dreDescricaoId: interExtratos.dreDescricaoId, valor: interExtratos.valor })
      .from(interExtratos)
      .where(and(eq(interExtratos.unidadeId, unidadeId), gte(interExtratos.dataEntrada, dataInicio), lte(interExtratos.dataEntrada, dataFim), isNotNull(interExtratos.dreDescricaoId))),
    db.select({ dataEntrada: interExtratos.dataEntrada, dreDescricaoId: lancamentoSplits.dreDescricaoId, valor: lancamentoSplits.valor })
      .from(lancamentoSplits)
      .innerJoin(interExtratos, eq(lancamentoSplits.interExtratoId, interExtratos.id))
      .where(and(eq(interExtratos.unidadeId, unidadeId), gte(interExtratos.dataEntrada, dataInicio), lte(interExtratos.dataEntrada, dataFim))),
    db.select({ dataHora: adquirenteVendas.dataHora, dreDescricaoId: adquirenteVendas.dreDescricaoId, valor: adquirenteVendas.valorBruto })
      .from(adquirenteVendas)
      .where(and(eq(adquirenteVendas.unidadeId, unidadeId), gte(adquirenteVendas.dataHora, dataInicio), lte(adquirenteVendas.dataHora, `${dataFim} 23:59:59`), isNotNull(adquirenteVendas.dreDescricaoId))),
  ]);
  for (const l of semSplit) soma(l.dataEntrada, l.dreDescricaoId, l.valor);
  for (const s of splits) soma(s.dataEntrada, s.dreDescricaoId, s.valor);
  for (const v of vendas) soma(v.dataHora.slice(0, 10), v.dreDescricaoId, v.valor);
  return porDia;
}

function somarDiasIso(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** DAYOFWEEK do MySQL: 1 = domingo ... 7 = sábado — mesma convenção de diaSemanaUltimaVisita/diaSemanaUltimos180Dias. */
function diaSemanaMySQL(dataIso: string): number {
  return new Date(`${dataIso}T00:00:00Z`).getUTCDay() + 1;
}

/**
 * Peso relativo de cada dia da semana (2026-09-12) — a unidade já faz
 * essa distribuição não-linear na planilha "Informe de vendas" (linha
 * 23: um sábado carrega mais meta que uma segunda), só que lá o peso de
 * cada dia é digitado à mão. Aqui é calculado sozinho a partir da média
 * real de receita de cada dia da semana nos últimos `diasHistorico`
 * dias — se o padrão da unidade mudar (ex.: nova campanha muda a
 * segunda), a distribuição se ajusta sozinha, sem precisar editar
 * planilha nenhuma. Índice 1 (domingo) a 7 (sábado); sem histórico
 * nenhum, todos os pesos saem iguais (equivale à distribuição linear).
 */
async function mediaReceitaPorDiaSemana(unidadeId: number, diasHistorico = 90): Promise<Record<number, number>> {
  const uniforme: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1 };
  const fim = somarDiasIso(hojeSaoPaulo(), -1); // até ontem — hoje ainda está incompleto
  const inicio = somarDiasIso(fim, -diasHistorico);
  const porDia = await receitaPorDiaNoIntervalo(unidadeId, inicio, fim);
  if (porDia.size === 0) return uniforme;

  const somaPorDia: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  const contagemPorDia: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  let somaGeral = 0;
  for (const [dataIso, valor] of porDia) {
    const dia = diaSemanaMySQL(dataIso);
    somaPorDia[dia] += valor;
    contagemPorDia[dia] += 1;
    somaGeral += valor;
  }
  const mediaGeral = somaGeral / porDia.size;

  const medias: Record<number, number> = {};
  for (let dia = 1; dia <= 7; dia++) {
    medias[dia] = contagemPorDia[dia] > 0 ? somaPorDia[dia] / contagemPorDia[dia] : mediaGeral;
  }
  return medias;
}

/**
 * Média de receita das ÚLTIMAS DUAS ocorrências de cada dia da semana
 * até (e incluindo) `dataFimInclusive` — usada só pra linha de
 * Tendência (2026-09-12): diferente de mediaReceitaPorDiaSemana (média
 * de 90 dias, estável, usada pra distribuir a meta do mês), aqui o
 * usuário quer algo que reaja rápido ao ritmo recente pra projetar "se
 * mantiver o pace, fecha quanto" — só as 2 últimas terças, os 2 últimos
 * sábados etc. Olha 8 semanas pra trás pra garantir pelo menos essas 2
 * ocorrências mesmo com algum dia sem dado; dia da semana sem nenhuma
 * ocorrência no período vira 0 (sem base pra projetar).
 */
async function mediaReceitaUltimasDuasOcorrenciasPorDiaSemana(unidadeId: number, dataFimInclusive: string, semanasHistorico = 8): Promise<Record<number, number>> {
  const inicio = somarDiasIso(dataFimInclusive, -semanasHistorico * 7);
  const porDia = await receitaPorDiaNoIntervalo(unidadeId, inicio, dataFimInclusive);
  const porDiaSemana: Record<number, number[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  for (const dataIso of Array.from(porDia.keys()).sort()) {
    porDiaSemana[diaSemanaMySQL(dataIso)].push(porDia.get(dataIso)!);
  }
  const medias: Record<number, number> = {};
  for (let dia = 1; dia <= 7; dia++) {
    const ultimasDuas = porDiaSemana[dia].slice(-2);
    medias[dia] = ultimasDuas.length > 0 ? ultimasDuas.reduce((a, b) => a + b, 0) / ultimasDuas.length : 0;
  }
  return medias;
}

export interface PontoEvolucaoMensal {
  dia: number;
  /** Acumulado real até esse dia — sempre atualizado, usado pros números da composição (não é filtrado pelo corte das 20h). */
  acumulado: number;
  /** Igual a `acumulado` até o dia de corte do gráfico (ontem, ou hoje só a partir das 20h); null depois — é o que a linha "Realizado" deve plotar, pra não mostrar hoje pela metade como se fosse um tombo. */
  acumuladoGrafico: number | null;
  /** Projeção (linha "Tendência", verde): null antes do dia de corte; no dia de corte é igual ao acumulado real (conecta com a linha Realizado); depois soma, dia a dia, a média das 2 últimas ocorrências daquele dia da semana — "se mantiver o pace". */
  tendencia: number | null;
  metaEsperada: number;
  superMeta: number;
}

/**
 * Evolução dia a dia do faturamento acumulado no mês atual, contra a
 * meta esperada (não-linear — distribuída pela força real de cada dia
 * da semana, ver mediaReceitaPorDiaSemana) e a SuperMeta (Faixa 4 da
 * premiação: meta × 1,2, mesmo múltiplo confirmado na planilha "Informe
 * de vendas") — as linhas do gráfico pedido pelo usuário (Meta,
 * SuperMeta, Realizado, Tendência).
 *
 * O dia de hoje só entra no "Realizado" do gráfico a partir das 20h
 * (achado do usuário: antes disso o dia está incompleto e aparece como
 * um patamar/queda enganosa comparado às linhas de meta, que são
 * acumuladas o mês inteiro) — antes das 20h o gráfico encerra ontem.
 */
export async function evolucaoDiariaReceitaReativacao(unidadeId: number): Promise<PontoEvolucaoMensal[]> {
  const hoje = hojeSaoPaulo();
  const mesStr = hoje.slice(0, 7);
  const [ano, mes] = hoje.split("-").map(Number);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const inicioMes = `${mesStr}-01`;
  const fimMes = `${mesStr}-31`;
  const diaAtual = Number(hoje.slice(8, 10));
  const corteIncluiHoje = horaSaoPaulo() >= 20;
  const diaCorte = corteIncluiHoje ? diaAtual : diaAtual - 1;
  const dataCorte = corteIncluiHoje ? hoje : somarDiasIso(hoje, -1);

  const [porDia, pesos, metaLinha, mediaUltimasDuas] = await Promise.all([
    receitaPorDiaNoIntervalo(unidadeId, inicioMes, fimMes),
    mediaReceitaPorDiaSemana(unidadeId),
    getMetaMensalAtual(unidadeId),
    mediaReceitaUltimasDuasOcorrenciasPorDiaSemana(unidadeId, dataCorte),
  ]);
  const metaFinal = metaLinha?.valorFaturamento ? Number(metaLinha.valorFaturamento) : 0;

  const datasDoMes = Array.from({ length: diasNoMes }, (_, i) => `${mesStr}-${String(i + 1).padStart(2, "0")}`);
  const pesoTotal = datasDoMes.reduce((soma, dataIso) => soma + pesos[diaSemanaMySQL(dataIso)], 0);

  const pontos: PontoEvolucaoMensal[] = [];
  let acumulado = 0;
  let metaAcumulada = 0;
  let tendenciaAcumulada = 0;
  for (const dataIso of datasDoMes) {
    acumulado += porDia.get(dataIso) ?? 0;
    const metaDoDia = pesoTotal > 0 ? metaFinal * (pesos[diaSemanaMySQL(dataIso)] / pesoTotal) : 0;
    metaAcumulada += metaDoDia;
    const dia = Number(dataIso.slice(8, 10));
    const acumuladoArredondado = Math.round(acumulado * 100) / 100;

    let tendencia: number | null = null;
    if (dia === diaCorte) {
      tendenciaAcumulada = acumulado;
      tendencia = acumuladoArredondado;
    } else if (dia > diaCorte) {
      // Sem 2 ocorrências recentes desse dia da semana (mês muito novo, ou
      // um dia da semana raro no histórico), cai pra média histórica de 90
      // dias (`pesos`, já calculada acima) em vez de somar 0 — equivalente
      // ao fallback da planilha original pra quando a estimativa ainda não
      // tem base recente o suficiente.
      const diaSemana = diaSemanaMySQL(dataIso);
      tendenciaAcumulada += mediaUltimasDuas[diaSemana] || pesos[diaSemana] || 0;
      tendencia = Math.round(tendenciaAcumulada * 100) / 100;
    }

    pontos.push({
      dia,
      acumulado: acumuladoArredondado,
      acumuladoGrafico: dia <= diaCorte ? acumuladoArredondado : null,
      tendencia,
      metaEsperada: Math.round(metaAcumulada * 100) / 100,
      superMeta: Math.round(metaAcumulada * 1.2 * 100) / 100,
    });
  }
  return pontos;
}

export interface ComposicaoMetaReativacao {
  metaFaturamento: number;
  faturamentoAtual: number;
  faltam: number;
  diasRestantesNoMes: number;
  ticketMedio: number;
  clientesNecessarios: number;
  clientesPorDia: number;
  taxaConversao: number | null;
  contatosNecessariosPorDia: number | null;
  // "Desempenho mensal" (2026-09-12) — mesmo painel/fórmula de premiação
  // já usado pela unidade na planilha "Informe de vendas", confirmado
  // pelo usuário com print real (Acumulado, Meta Esperada até Hoje,
  // Atingimento, Premiação por faixa, atendimentos com/sem plano).
  diaAtual: number;
  diasNoMes: number;
  metaEsperadaAteHoje: number;
  atingimentoMeta: number | null; // fração (0.9296 = 92,96%), não em %
  premiacao: string;
  totalAtendimentos: number;
  atendComPlano: number;
  atendSemPlano: number;
  planosVendidos: number;
}

/**
 * Faixa de premiação (2026-09-12) — fórmula exata informada pelo usuário,
 * já em uso na planilha "Informe de vendas": abaixo de 90% de
 * atingimento não premia; cada faixa de 10 pontos acima de 90% sobe um
 * degrau (250/500/750/1.000). `atingimentoMeta` é a fração (acumulado /
 * meta esperada até hoje — já não-linear, ver evolucaoDiariaReceitaReativacao),
 * não a meta final do mês.
 */
function faixaPremiacaoReativacao(atingimentoMeta: number | null): string {
  if (atingimentoMeta === null || atingimentoMeta < 0.9) return "Sem premiação";
  if (atingimentoMeta < 1.0) return "Faixa 1: 250,00";
  if (atingimentoMeta < 1.1) return "Faixa 2: 500,00";
  if (atingimentoMeta < 1.2) return "Faixa 3: 750,00";
  return "Faixa 4: 1.000,00";
}

/**
 * "Quantos contatos a recepção precisa fazer amanhã, em média, pra não
 * perder a meta do mês" + o painel "Desempenho mensal" (acumulado, meta
 * esperada até hoje, atingimento, premiação, atendimentos com/sem
 * plano) — cruza a meta de faturamento (tabela metas, a mesma editável
 * em Financeiro > Visão Geral > Metas) com a evolução diária não-linear
 * acima, atendimentos do Belle e a conversão real do funil de
 * reativação. Sem meta de faturamento cadastrada, os campos derivados
 * dela vêm como 0/null (a tela pede pra configurar).
 */
export async function composicaoMetaReativacao(unidadeId: number): Promise<ComposicaoMetaReativacao> {
  const db = await getDb();
  const hoje = hojeSaoPaulo();
  const mesStr = hoje.slice(0, 7);
  const diaAtual = Number(hoje.slice(8, 10));
  const [ano, mes] = hoje.split("-").map(Number);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const diasRestantesNoMes = Math.max(1, diasNoMes - diaAtual + 1); // inclui hoje
  const inicioMes = `${mesStr}-01`;
  const fimMes = `${mesStr}-31`;

  const [metaLinha, evolucao, ticketMedio, conversao, atendimentosLinhas, planosVendidosLinhas] = await Promise.all([
    getMetaMensalAtual(unidadeId),
    evolucaoDiariaReceitaReativacao(unidadeId),
    getTicketMedioReativacao(unidadeId),
    conversaoContatosReativacao(unidadeId, 30),
    // "Total de atendimentos"/"Atend. com/sem plano"/"Planos vendidos"
    // (2026-09-12) vêm da Comanda (comanda_itens, mesma fonte da aba
    // "Fechamento diário" que a unidade já confere todo dia) — não de
    // belle_atendimentos/bellePlanosClientes como antes. Achado real: o
    // Belle só tinha 93 atendimentos pro período em que a Comanda real
    // tinha 191 (confirmado célula a célula contra o "Fechamento diário"
    // impresso) — o import do Belle está incompleto. A Comanda empilha 2
    // seções na mesma aba ("Serviços" = atendimentos de verdade, e
    // "Venda de Plano, Produtos e Voucher's" — SECAO_OFFSET as separa por
    // idLinha, ver comandaVirtualXlsxParser.ts); "com plano" é
    // motivoDesconto = "Plano" dentro da 1ª seção (bate exatamente:
    // 9 de 26 num dia real, 69 de 191 no mês), "Planos vendidos" é
    // terapiaProduto contendo "plano" na 2ª seção (bate exatamente: 10 no mês).
    db ? db.select({ motivoDesconto: comandaItens.motivoDesconto }).from(comandaItens)
      .where(and(eq(comandaItens.unidadeId, unidadeId), gte(comandaItens.data, inicioMes), lte(comandaItens.data, fimMes), lt(comandaItens.idLinha, SECAO_OFFSET)))
      : Promise.resolve([]),
    db ? db.select({ id: comandaItens.id }).from(comandaItens)
      .where(and(eq(comandaItens.unidadeId, unidadeId), gte(comandaItens.data, inicioMes), lte(comandaItens.data, fimMes), gte(comandaItens.idLinha, SECAO_OFFSET), like(comandaItens.terapiaProduto, "%plano%")))
      : Promise.resolve([]),
  ]);

  const metaFaturamento = metaLinha?.valorFaturamento ? Number(metaLinha.valorFaturamento) : 0;
  const pontoHoje = evolucao[diaAtual - 1] ?? evolucao[evolucao.length - 1];
  const faturamentoAtual = pontoHoje?.acumulado ?? 0;
  const metaEsperadaAteHoje = pontoHoje?.metaEsperada ?? 0;
  const faltam = Math.max(0, metaFaturamento - faturamentoAtual);
  const clientesNecessarios = ticketMedio > 0 ? faltam / ticketMedio : 0;
  const clientesPorDia = clientesNecessarios / diasRestantesNoMes;
  const taxaConversao = conversao.contatados > 0 ? conversao.convertidos / conversao.contatados : null;
  const contatosNecessariosPorDia = taxaConversao && taxaConversao > 0 ? clientesPorDia / taxaConversao : null;

  const atingimentoMeta = metaEsperadaAteHoje > 0 ? faturamentoAtual / metaEsperadaAteHoje : null;
  const premiacao = faixaPremiacaoReativacao(atingimentoMeta);
  const totalAtendimentos = atendimentosLinhas.length;
  const atendComPlano = atendimentosLinhas.filter((a) => a.motivoDesconto === "Plano").length;
  const atendSemPlano = totalAtendimentos - atendComPlano;
  const planosVendidos = planosVendidosLinhas.length;

  return {
    metaFaturamento, faturamentoAtual, faltam, diasRestantesNoMes, ticketMedio, clientesNecessarios, clientesPorDia, taxaConversao, contatosNecessariosPorDia,
    diaAtual, diasNoMes, metaEsperadaAteHoje, atingimentoMeta, premiacao, totalAtendimentos, atendComPlano, atendSemPlano, planosVendidos,
  };
}

// ===== Comanda virtual (item a item — auditoria da Comanda Recepção) =====

const LOTE_INSERT_COMANDA_ITENS = 500;

/**
 * Upsert por unidadeId+data+idLinha (idLinha = "ID" sequencial da
 * própria planilha, dentro de cada dia) — em lote, via
 * INSERT ... ON DUPLICATE KEY UPDATE contra o índice único
 * comanda_itens_unidade_data_idlinha_unq. Decidir "insere ou atualiza"
 * é o próprio banco que faz, atomicamente por linha; nada aqui lê o
 * estado anterior pra tomar essa decisão (só pra rotular o retorno —
 * ver comentário mais abaixo). Troca de um SELECT-então-decide feita em
 * 2026-09-03 depois de um bug real: sob retry (comum — 1 dia falhando
 * por rate limit no meio de ~30 chamadas ao Sheets já basta pro
 * "Sincronizar tudo" tentar tudo de novo), o SELECT prévio às vezes não
 * via o insert de segundos atrás e duplicava a linha. Toda linha da
 * tabela desde 27/07 estava assim, duplicada 2x.
 */
export async function upsertComandaItens(
  unidadeId: number,
  linhas: LinhaComandaItemImportada[],
): Promise<{ inseridos: number; atualizados: number }> {
  const db = await getDb();
  if (!db) return { inseridos: 0, atualizados: 0 };
  if (linhas.length === 0) return { inseridos: 0, atualizados: 0 };

  // Map, não array: se a própria leitura da planilha já trouxer o mesmo
  // idLinha duas vezes (linha duplicada por engano na planilha), a
  // última leitura da mesma chave vence — mesma convenção que o resto
  // do sistema já assume pra idLinha.
  const porChave = new Map<string, InsertComandaItem>();
  for (const l of linhas) {
    porChave.set(`${l.data}|${l.idLinha}`, {
      unidadeId,
      data: l.data,
      idLinha: l.idLinha,
      cliente: l.cliente ?? null,
      aberturaResponsavel: l.aberturaResponsavel ?? null,
      visitasAnteriores: l.visitasAnteriores ?? null,
      canalCaptacao: l.canalCaptacao ?? null,
      terapiaProduto: l.terapiaProduto ?? null,
      terapeuta: l.terapeuta ?? null,
      subtotal: typeof l.subtotal === "number" ? l.subtotal.toFixed(2) : null,
      desconto: typeof l.desconto === "number" ? l.desconto.toFixed(2) : null,
      motivoDesconto: l.motivoDesconto ?? null,
      total: typeof l.total === "number" ? l.total.toFixed(2) : null,
      dinheiro: typeof l.dinheiro === "number" ? l.dinheiro.toFixed(2) : null,
      pix: typeof l.pix === "number" ? l.pix.toFixed(2) : null,
      cartaoDebito: typeof l.cartaoDebito === "number" ? l.cartaoDebito.toFixed(2) : null,
      cartaoCredito: typeof l.cartaoCredito === "number" ? l.cartaoCredito.toFixed(2) : null,
      totalPagtos: typeof l.totalPagtos === "number" ? l.totalPagtos.toFixed(2) : null,
      observacao: l.observacao ?? null,
      fechamentoResponsavel: l.fechamentoResponsavel ?? null,
      campoGerente: l.campoGerente ?? null,
    });
  }
  const linhasParaGravar = Array.from(porChave.values());

  // Só pra rotular "N novos / M atualizados" no retorno (texto
  // informativo do syncLog) — não decide mais o que gravar. Uma foto
  // levemente desatualizada aqui erra no máximo o rótulo, nunca duplica
  // linha: quem garante isso agora é o índice único
  // (comanda_itens_unidade_data_idlinha_unq) + ON DUPLICATE KEY UPDATE
  // abaixo, atômico no próprio banco — sem essa troca, um retry (ex.:
  // "Sincronizar tudo" tentando de novo depois de 1 dia falhar por rate
  // limit no meio de ~30 chamadas ao Sheets) podia rodar antes do
  // insert anterior aparecer num SELECT prévio, e inserir a mesma linha
  // de novo. Achado real (2026-09-03): toda linha de comanda_itens
  // desde 27/07 estava duplicada 2x por causa exatamente disso.
  const existentes = await db
    .select({ data: comandaItens.data, idLinha: comandaItens.idLinha })
    .from(comandaItens)
    .where(eq(comandaItens.unidadeId, unidadeId));
  const chavesExistentes = new Set(existentes.map((e) => `${e.data}|${e.idLinha}`));
  let inseridos = 0;
  let atualizados = 0;
  for (const l of linhasParaGravar) {
    if (chavesExistentes.has(`${l.data}|${l.idLinha}`)) atualizados++; else inseridos++;
  }

  // Em lote (não um INSERT por linha): numa carga histórica (a
  // esmagadora maioria é linha nova, nunca vista) um INSERT por linha é
  // lento o bastante pra estourar o timeout da requisição em planilhas
  // grandes — confirmado na prática (RBS, ~6 mil linhas, timeout; SSU,
  // ~3 mil, passou raspando). VALUES(coluna) dentro do ON DUPLICATE KEY
  // UPDATE refere-se ao valor que cada linha do lote tentou inserir —
  // funciona certo mesmo com centenas de linhas diferentes no mesmo
  // INSERT.
  for (let i = 0; i < linhasParaGravar.length; i += LOTE_INSERT_COMANDA_ITENS) {
    const lote = linhasParaGravar.slice(i, i + LOTE_INSERT_COMANDA_ITENS);
    await db.insert(comandaItens).values(lote).onDuplicateKeyUpdate({
      set: {
        cliente: sql`VALUES(${comandaItens.cliente})`,
        aberturaResponsavel: sql`VALUES(${comandaItens.aberturaResponsavel})`,
        visitasAnteriores: sql`VALUES(${comandaItens.visitasAnteriores})`,
        canalCaptacao: sql`VALUES(${comandaItens.canalCaptacao})`,
        terapiaProduto: sql`VALUES(${comandaItens.terapiaProduto})`,
        terapeuta: sql`VALUES(${comandaItens.terapeuta})`,
        subtotal: sql`VALUES(${comandaItens.subtotal})`,
        desconto: sql`VALUES(${comandaItens.desconto})`,
        motivoDesconto: sql`VALUES(${comandaItens.motivoDesconto})`,
        total: sql`VALUES(${comandaItens.total})`,
        dinheiro: sql`VALUES(${comandaItens.dinheiro})`,
        pix: sql`VALUES(${comandaItens.pix})`,
        cartaoDebito: sql`VALUES(${comandaItens.cartaoDebito})`,
        cartaoCredito: sql`VALUES(${comandaItens.cartaoCredito})`,
        totalPagtos: sql`VALUES(${comandaItens.totalPagtos})`,
        observacao: sql`VALUES(${comandaItens.observacao})`,
        fechamentoResponsavel: sql`VALUES(${comandaItens.fechamentoResponsavel})`,
        campoGerente: sql`VALUES(${comandaItens.campoGerente})`,
      },
    });
  }

  return { inseridos, atualizados };
}

// ===== Resumo mensal (planilha "Contabilidade SSU e RBS") =====

/** rbs -> unidade cujo slug tem "ribeirao"/"rbs"; ssu -> a outra. Mesma convenção de chaveUnidade em dailySyncReport.ts, invertida. */
export async function getUnidadeIdPorChaveSsuRbs(chave: "rbs" | "ssu"): Promise<number | null> {
  const todas = await getUnidades();
  const unidade = todas.find((u) => {
    const isRbs = u.slug.includes("ribeirao") || u.slug.includes("rbs");
    return chave === "rbs" ? isRbs : !isRbs && u.slug !== "buddha-mkt";
  });
  return unidade?.id ?? null;
}

export interface LinhaResumoMensalParaGravar {
  unidadeId: number;
  mesAno: string; // AAAA-MM
  // null = mês ainda sem resultado real (só meta, ex.: mês futuro) —
  // diferente de 0, que é um resultado real de valor zero.
  totalRecebidoCaixa: number | null;
  voucherSite: number | null;
  gympassTotalpass: number | null;
  faturamentoTotal: number | null;
  atendimentosSemPlano: number | null;
  atendimentosComPlano: number | null;
  totalAtendimentos: number | null;
  planos: number | null;
  metaFaturamento: number | null;
}

/**
 * Upsert por unidadeId+mesAno via ON DUPLICATE KEY UPDATE (mesmo
 * padrão consolidado hoje em upsertComandaItens — decisão "insere ou
 * atualiza" atômica no próprio banco, contra o índice único
 * resumo_mensal_unidade_unidade_mes_unq).
 */
export async function upsertResumoMensalUnidade(linhas: LinhaResumoMensalParaGravar[]): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  if (linhas.length === 0) return 0;

  const paraTexto = (v: number | null) => (v === null ? null : v.toFixed(2));
  const valores: InsertResumoMensalUnidade[] = linhas.map((l) => ({
    unidadeId: l.unidadeId,
    mesAno: l.mesAno,
    totalRecebidoCaixa: paraTexto(l.totalRecebidoCaixa),
    voucherSite: paraTexto(l.voucherSite),
    gympassTotalpass: paraTexto(l.gympassTotalpass),
    faturamentoTotal: paraTexto(l.faturamentoTotal),
    atendimentosSemPlano: l.atendimentosSemPlano,
    atendimentosComPlano: l.atendimentosComPlano,
    totalAtendimentos: l.totalAtendimentos,
    planos: l.planos,
    metaFaturamento: paraTexto(l.metaFaturamento),
  }));

  await db.insert(resumoMensalUnidade).values(valores).onDuplicateKeyUpdate({
    set: {
      totalRecebidoCaixa: sql`VALUES(${resumoMensalUnidade.totalRecebidoCaixa})`,
      voucherSite: sql`VALUES(${resumoMensalUnidade.voucherSite})`,
      gympassTotalpass: sql`VALUES(${resumoMensalUnidade.gympassTotalpass})`,
      faturamentoTotal: sql`VALUES(${resumoMensalUnidade.faturamentoTotal})`,
      atendimentosSemPlano: sql`VALUES(${resumoMensalUnidade.atendimentosSemPlano})`,
      atendimentosComPlano: sql`VALUES(${resumoMensalUnidade.atendimentosComPlano})`,
      totalAtendimentos: sql`VALUES(${resumoMensalUnidade.totalAtendimentos})`,
      planos: sql`VALUES(${resumoMensalUnidade.planos})`,
      metaFaturamento: sql`VALUES(${resumoMensalUnidade.metaFaturamento})`,
    },
  });

  return valores.length;
}

/** Lista o histórico mensal das 2 unidades, mais recente primeiro — alimenta "Visão mês a mês". */
export async function listResumoMensalUnidade(mesAnoInicio?: string): Promise<ResumoMensalUnidade[]> {
  const db = await getDb();
  if (!db) return [];
  const condicoes = mesAnoInicio ? [gte(resumoMensalUnidade.mesAno, mesAnoInicio)] : [];
  return db.select().from(resumoMensalUnidade).where(and(...condicoes)).orderBy(desc(resumoMensalUnidade.mesAno));
}

export interface ItemComandaRecepcao {
  data: string;
  forma: "dinheiro" | "debito" | "credito" | "pix";
  descricao: string;
  valor: number;
}

/**
 * Item a item da Comanda (Recepção) num período, já partido por forma
 * de pagamento — uma linha da planilha pode ter o pagamento dividido
 * entre formas (ex.: parte dinheiro, parte débito), então cada
 * lançamento vira até 4 entradas aqui, uma por forma efetivamente
 * preenchida. Mesmo formato de ItemContaBancaria no client, pra
 * reaproveitar o mesmo componente de hover.
 */
export async function listComandaItensDetalhe(
  unidadeId: number,
  dataInicio: string,
  dataFim: string,
): Promise<ItemComandaRecepcao[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(comandaItens).where(and(
    eq(comandaItens.unidadeId, unidadeId),
    gte(comandaItens.data, dataInicio),
    lte(comandaItens.data, dataFim),
  ));

  const itens: ItemComandaRecepcao[] = [];
  for (const r of rows) {
    const descricao = `${r.cliente ?? "—"} · ${r.terapiaProduto ?? "-"}`;
    const partes: [ItemComandaRecepcao["forma"], string | null][] = [
      ["dinheiro", r.dinheiro],
      ["pix", r.pix],
      ["debito", r.cartaoDebito],
      ["credito", r.cartaoCredito],
    ];
    for (const [forma, valorStr] of partes) {
      const valor = Number(valorStr ?? 0);
      if (valor > 0) itens.push({ data: r.data, forma, descricao, valor });
    }
  }
  return itens;
}

export interface ConciliacaoDia {
  data: string;
  cartaoDebito: number;
  cartaoCredito: number;
  pix: number;
  // null = sem diferença nesse dia — ver shared/conciliacao.ts
  texto: string | null;
}

/**
 * Calcula a conciliação Comanda x Contas dia a dia num período —
 * extraído de sincronizarContasBancariasParaDrive (server/routers.ts)
 * pra ser reaproveitado também pelo relatório do Telegram
 * (enviarRelatorioRecepcao), sem duplicar a lógica de pareamento em
 * dois lugares.
 */
export async function calcularConciliacaoPorDia(
  unidadeId: number,
  dataInicio: string,
  dataFim: string,
): Promise<ConciliacaoDia[]> {
  const [resumo, itensComanda, itensContas] = await Promise.all([
    resumoContasBancariasPorDia(unidadeId, dataInicio, dataFim),
    listComandaItensDetalhe(unidadeId, dataInicio, dataFim),
    detalheContasBancariasPorDia(unidadeId, dataInicio, dataFim),
  ]);

  const comandaPorDia = new Map<string, ItemConciliacao[]>();
  for (const it of itensComanda) {
    const lista = comandaPorDia.get(it.data) ?? [];
    lista.push({ forma: it.forma, descricao: it.descricao, valor: it.valor });
    comandaPorDia.set(it.data, lista);
  }
  const contasPorDia = new Map<string, ItemConciliacao[]>();
  for (const it of itensContas) {
    const lista = contasPorDia.get(it.data) ?? [];
    lista.push({ forma: it.forma, descricao: it.descricao, valor: it.valor, horario: it.horario || undefined });
    contasPorDia.set(it.data, lista);
  }

  // União dos dias com algum lançamento de qualquer lado — não só os
  // dias que já tinham "Contas bancárias" (resumo), senão um dia
  // só-Comanda (nada caiu na conta) nunca entraria na conciliação.
  const dias = new Set<string>([
    ...Array.from(resumo.keys()),
    ...Array.from(comandaPorDia.keys()),
    ...Array.from(contasPorDia.keys()),
  ]);

  return Array.from(dias).map((data) => {
    const valores = resumo.get(data);
    const texto = gerarTextoConciliacao(data, comandaPorDia.get(data) ?? [], contasPorDia.get(data) ?? []);
    return {
      data,
      cartaoDebito: valores?.cartaoDebito ?? 0,
      cartaoCredito: valores?.cartaoCredito ?? 0,
      pix: valores?.pix ?? 0,
      texto,
    };
  });
}

// ===== Relatório diário de pendências pro Telegram (grupo recepção) =====

function chaveEnvioRecepcao(unidadeId: number): string {
  return `telegram_recepcao_ultimo_envio_${unidadeId}`;
}

/** "Um disparo por dia" — compara com a data de hoje guardada em configuracoes. */
export async function jaEnviouRelatorioRecepcaoHoje(unidadeId: number): Promise<boolean> {
  const hoje = new Date().toISOString().slice(0, 10);
  const config = await getConfig(chaveEnvioRecepcao(unidadeId));
  return config?.valor === hoje;
}

export async function marcarRelatorioRecepcaoEnviadoHoje(unidadeId: number): Promise<void> {
  const hoje = new Date().toISOString().slice(0, 10);
  await setConfig(chaveEnvioRecepcao(unidadeId), hoje);
}

// ===== Scripts (mensagens prontas do Inbox) =====

// fluxoUnidadeId (via LEFT JOIN) diz de qual unidade é o fluxo de um
// script tipo="fluxo" — ScriptPicker.tsx usa isso pra só mostrar esses
// scripts quando a conversa aberta é da mesma unidade (evita disparar
// um fluxo com credencial Z-API de outra unidade).
export async function listScripts(busca?: string, categoria?: string) {
  const db = await getDb();
  if (!db) return [];
  const condicoes = [eq(scripts.ativo, true)];
  if (categoria) condicoes.push(eq(scripts.categoriaScript, categoria));
  const buscaNormalizada = busca?.trim();
  if (buscaNormalizada) {
    // A busca é deliberadamente limitada ao que a equipe consulta no item:
    // título, descrição de uso e corpo da mensagem. Categoria e fluxo são
    // metadados de organização, portanto não podem introduzir falsos positivos.
    const termo = `%${buscaNormalizada}%`;
    condicoes.push(or(
      like(scripts.script, termo),
      like(scripts.titulo, termo),
      like(scripts.descricao, termo),
    )!);
  }
  return db.select({ ...getTableColumns(scripts), fluxoUnidadeId: fluxos.unidadeId, fluxoNome: fluxos.nome })
    .from(scripts)
    .leftJoin(fluxos, eq(scripts.fluxoId, fluxos.id))
    .where(and(...condicoes))
    .orderBy(scripts.categoriaScript, scripts.id);
}

export async function listCategoriasScript(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const linhas = await db.selectDistinct({ categoria: scripts.categoriaScript }).from(scripts).where(eq(scripts.ativo, true));
  return linhas.map((l) => l.categoria).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Últimos scripts distintos usados por qualquer usuário — alimenta a coluna "Recentes" do seletor. */
export async function listScriptsRecentes(limit: number = 8) {
  const db = await getDb();
  if (!db) return [];
  const usos = await db.select({ scriptId: scriptsUso.scriptId, usadoEm: scriptsUso.usadoEm })
    .from(scriptsUso).orderBy(desc(scriptsUso.usadoEm)).limit(limit * 4);
  const idsVistos = new Set<number>();
  const idsOrdenados: number[] = [];
  for (const u of usos) {
    if (idsVistos.has(u.scriptId)) continue;
    idsVistos.add(u.scriptId);
    idsOrdenados.push(u.scriptId);
    if (idsOrdenados.length >= limit) break;
  }
  if (idsOrdenados.length === 0) return [];
  const linhas = await db.select({ ...getTableColumns(scripts), fluxoUnidadeId: fluxos.unidadeId, fluxoNome: fluxos.nome })
    .from(scripts)
    .leftJoin(fluxos, eq(scripts.fluxoId, fluxos.id))
    .where(and(inArray(scripts.id, idsOrdenados), eq(scripts.ativo, true)));
  const porId = new Map(linhas.map((l) => [l.id, l]));
  return idsOrdenados.map((id) => porId.get(id)).filter((s): s is NonNullable<typeof s> => !!s);
}

export async function registrarUsoScript(scriptId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(scriptsUso).values({ scriptId, userId });
}

export async function createScript(dados: {
  categoriaScript: string; titulo: string; descricao: string; tipo?: "texto" | "fluxo"; script?: string; fluxoId?: number; observacoes?: string; agentesPermitidos?: Array<"bianca" | "fabricia" | "estela" | "carol" | "diana">;
}): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const insertValues: InsertScript = {
    categoriaScript: dados.categoriaScript,
    titulo: dados.titulo,
    descricao: dados.descricao,
    tipo: dados.tipo ?? "texto",
    script: dados.script ?? null,
    fluxoId: dados.fluxoId ?? null,
    observacoes: dados.observacoes,
    agentesPermitidos: dados.agentesPermitidos ?? ["bianca", "fabricia", "estela", "carol", "diana"],
  };
  const result = await db.insert(scripts).values(insertValues).$returningId();
  return result[0]?.id;
}

export async function updateScript(id: number, dados: {
  categoriaScript?: string; titulo?: string; descricao?: string; tipo?: "texto" | "fluxo"; script?: string | null; fluxoId?: number | null; observacoes?: string | null; agentesPermitidos?: Array<"bianca" | "fabricia" | "estela" | "carol" | "diana">;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(scripts).set(dados).where(eq(scripts.id, id));
}

export async function getScriptById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const linhas = await db.select({ ...getTableColumns(scripts), fluxoNome: fluxos.nome, fluxoUnidadeId: fluxos.unidadeId })
    .from(scripts)
    .leftJoin(fluxos, eq(scripts.fluxoId, fluxos.id))
    .where(and(eq(scripts.id, id), eq(scripts.ativo, true)))
    .limit(1);
  return linhas[0];
}

/** Exclusão soft — preserva o histórico em scriptsUso. */
export async function excluirScript(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(scripts).set({ ativo: false }).where(eq(scripts.id, id));
}

// ===== Fluxos de automação de WhatsApp (porte do mobai-crm, 2026-08-13) =====

export async function listFluxos(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fluxos).where(eq(fluxos.unidadeId, unidadeId)).orderBy(desc(fluxos.updatedAt));
}

export async function getFluxoById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(fluxos).where(eq(fluxos.id, id)).limit(1);
  return result[0];
}

export async function createFluxo(dados: { unidadeId: number; nome: string; descricao?: string }): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const insertValues: InsertFluxo = { unidadeId: dados.unidadeId, nome: dados.nome, descricao: dados.descricao ?? null };
  const result = await db.insert(fluxos).values(insertValues).$returningId();
  return result[0]?.id;
}

export async function updateFluxo(id: number, dados: {
  nome?: string; descricao?: string | null; ativo?: boolean; entradaNoOrdem?: number | null;
  gatilhoTipo?: "manual" | "mensagem_recebida" | "dias_sem_contato" | "cliente_novo";
  gatilhoConfig?: FluxoGatilhoConfig | null; visivelNoInbox?: boolean;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(fluxos).set(dados).where(eq(fluxos.id, id));
}

/** Hard delete — cascata manual pra nós e execuções, não é dado de cliente. */
export async function excluirFluxo(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(fluxoExecucoes).where(eq(fluxoExecucoes.fluxoId, id));
  await db.delete(fluxoNos).where(eq(fluxoNos.fluxoId, id));
  await db.delete(fluxos).where(eq(fluxos.id, id));
}

export async function listFluxoNos(fluxoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fluxoNos).where(eq(fluxoNos.fluxoId, fluxoId)).orderBy(fluxoNos.ordem);
}

export async function getFluxoNoByOrdem(fluxoId: number, ordem: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(fluxoNos).where(and(eq(fluxoNos.fluxoId, fluxoId), eq(fluxoNos.ordem, ordem))).limit(1);
  return result[0];
}

export async function createFluxoNo(dados: InsertFluxoNo): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(fluxoNos).values(dados).$returningId();
  return result[0]?.id;
}

export async function updateFluxoNo(id: number, dados: {
  config?: FluxoNoConfig; proximoNoOrdem?: number | null; posX?: number | null; posY?: number | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(fluxoNos).set(dados).where(eq(fluxoNos.id, id));
}

export async function excluirFluxoNo(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(fluxoNos).where(eq(fluxoNos.id, id));
}

export async function createFluxoExecucao(dados: {
  fluxoId: number; conversaId: number; clienteId?: number | null; noAtualOrdem: number; variaveis?: Record<string, string>;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const insertValues: InsertFluxoExecucao = {
    fluxoId: dados.fluxoId, conversaId: dados.conversaId, clienteId: dados.clienteId ?? null, noAtualOrdem: dados.noAtualOrdem,
    variaveis: dados.variaveis ?? {},
  };
  const result = await db.insert(fluxoExecucoes).values(insertValues).$returningId();
  if (!result[0]?.id) throw new Error("Falha ao criar execução do fluxo");
  return result[0].id;
}

export async function getFluxoExecucaoById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(fluxoExecucoes).where(eq(fluxoExecucoes.id, id)).limit(1);
  return result[0];
}

export async function updateFluxoExecucao(id: number, dados: Partial<InsertFluxoExecucao>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(fluxoExecucoes).set(dados).where(eq(fluxoExecucoes.id, id));
}

export async function listFluxoExecucoesPorFluxo(fluxoId: number, limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    ...getTableColumns(fluxoExecucoes),
    conversaNome: inboxConversas.nomeContato,
    conversaTelefone: inboxConversas.telefone,
    clienteNome: clientes.nome,
  }).from(fluxoExecucoes)
    .leftJoin(inboxConversas, eq(fluxoExecucoes.conversaId, inboxConversas.id))
    .leftJoin(clientes, eq(fluxoExecucoes.clienteId, clientes.id))
    .where(eq(fluxoExecucoes.fluxoId, fluxoId))
    .orderBy(desc(fluxoExecucoes.iniciadoEm)).limit(limit);
}

/** Já existe uma execução ativa/pausada/aguardando desse fluxo pra essa conversa — evita iniciar duplicada. */
export async function existeFluxoExecucaoEmAndamento(fluxoId: number, conversaId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.select({ id: fluxoExecucoes.id }).from(fluxoExecucoes)
    .where(and(
      eq(fluxoExecucoes.fluxoId, fluxoId),
      eq(fluxoExecucoes.conversaId, conversaId),
      inArray(fluxoExecucoes.status, ["ativo", "pausado", "aguardando_resposta"]),
    )).limit(1);
  return result.length > 0;
}

/** Execução "aguardando_resposta" (nó menu) já aberta pra essa conversa — usado pro webhook decidir entre retomar ou disparar um gatilho novo. */
export async function getFluxoExecucaoAguardandoRespostaPorConversa(conversaId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(fluxoExecucoes)
    .where(and(eq(fluxoExecucoes.conversaId, conversaId), eq(fluxoExecucoes.status, "aguardando_resposta")))
    .orderBy(desc(fluxoExecucoes.atualizadoEm)).limit(1);
  return result[0];
}

export async function listFluxoExecucoesPausadasVencidas(limit: number = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fluxoExecucoes)
    .where(and(eq(fluxoExecucoes.status, "pausado"), lte(fluxoExecucoes.proximaExecucaoEm, new Date())))
    .limit(limit);
}

/** Execuções "aguardando_resposta" (só nó menu, v1) cujo diasTimeoutSemResposta do nó já venceu — comparado em JS, o timeout mora no config do nó, não na execução. */
export async function listFluxoExecucoesAguardandoRespostaVencidas(limit: number = 20): Promise<Array<{ execucao: typeof fluxoExecucoes.$inferSelect; noTipo: string }>> {
  const db = await getDb();
  if (!db) return [];
  const candidatas = await db.select().from(fluxoExecucoes).where(eq(fluxoExecucoes.status, "aguardando_resposta")).limit(limit * 3);
  const resultado: Array<{ execucao: typeof fluxoExecucoes.$inferSelect; noTipo: string }> = [];
  for (const execucao of candidatas) {
    if (resultado.length >= limit) break;
    const no = await getFluxoNoByOrdem(execucao.fluxoId, execucao.noAtualOrdem);
    if (!no || no.tipo !== "menu") continue;
    const config = no.config as { diasTimeoutSemResposta?: number };
    const diasTimeout = config.diasTimeoutSemResposta ?? 3;
    const vencidoEm = execucao.atualizadoEm.getTime() + diasTimeout * 86_400_000;
    if (Date.now() >= vencidoEm) resultado.push({ execucao, noTipo: no.tipo });
  }
  return resultado;
}

export async function listFluxosPorGatilho(unidadeId: number, gatilhoTipo: "mensagem_recebida" | "dias_sem_contato" | "cliente_novo") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(fluxos).where(and(eq(fluxos.unidadeId, unidadeId), eq(fluxos.ativo, true), eq(fluxos.gatilhoTipo, gatilhoTipo)));
}

/** Sweep diário do gatilho "dias_sem_contato" — conversas de uma unidade sem mensagem há N dias. */
export async function listConversasSemContatoHaDias(unidadeId: number, dias: number) {
  const db = await getDb();
  if (!db) return [];
  const limite = new Date(Date.now() - dias * 86_400_000);
  return db.select({ id: inboxConversas.id, clienteId: inboxConversas.clienteId })
    .from(inboxConversas)
    .where(and(eq(inboxConversas.unidadeId, unidadeId), lte(inboxConversas.ultimaMensagemEm, limite)));
}

// ===== Buddha Mkt: unidade sintética, templates, disparos, CTR do menu (2026-08-14) =====

/**
 * A unidade "Buddha Mkt (Marketing)" não tem seed manual — é criada na
 * primeira chamada, mesmo espírito de getOrCreateContaMercadoPago
 * (server/db.ts:1526). Identificada por slug fixo, não por nome (nome
 * pode mudar, slug não).
 */
export async function getOrCreateUnidadeBuddhaMkt() {
  const db = await getDb();
  if (!db) return undefined;
  const existente = await db.select().from(unidades).where(eq(unidades.slug, "buddha-mkt")).limit(1);
  if (existente[0]) return existente[0];

  const insertValues: InsertUnidade = {
    nome: "Buddha Mkt (Marketing)",
    slug: "buddha-mkt",
    canal: "buddha_mkt",
  };
  const result = await db.insert(unidades).values(insertValues).$returningId();
  const novaId = result[0]?.id;
  if (!novaId) return undefined;
  const nova = await db.select().from(unidades).where(eq(unidades.id, novaId)).limit(1);
  return nova[0];
}

// --- Templates ---

export async function listBuddhaMktTemplates() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(buddhaMktTemplates).orderBy(desc(buddhaMktTemplates.createdAt));
}

export async function getBuddhaMktTemplateById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(buddhaMktTemplates).where(eq(buddhaMktTemplates.id, id)).limit(1);
  return result[0];
}

export async function createBuddhaMktTemplate(dados: {
  nome: string; idioma: string; categoria: "MARKETING" | "UTILITY"; corpo: string;
  corpoExemplos?: string[]; cabecalho?: string; cabecalhoExemplo?: string; rodape?: string;
  botoes?: Array<
    | { tipo: "QUICK_REPLY"; texto: string }
    | { tipo: "URL"; texto: string; url: string; exemploVariavel?: string }
  >;
}): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const insertValues: InsertBuddhaMktTemplate = { ...dados };
  const result = await db.insert(buddhaMktTemplates).values(insertValues).$returningId();
  return result[0]?.id;
}

export async function atualizarBuddhaMktTemplateStatus(id: number, dados: {
  status: "pendente" | "aprovado" | "rejeitado"; metaTemplateId?: string | null; motivoRejeicao?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(buddhaMktTemplates).set(dados).where(eq(buddhaMktTemplates.id, id));
}

// --- Disparos (campanhas) ---

export async function listDisparos() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(disparos).orderBy(desc(disparos.createdAt));
}

export async function getDisparoById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(disparos).where(eq(disparos.id, id)).limit(1);
  return result[0];
}

export async function createDisparo(dados: {
  nome: string; templateId: number; fluxoRespostaId?: number;
  variaveisConfig?: Array<{ fonte: "nome_cliente" | "fixo"; valor?: string }>;
  destinatarios: Array<{ clienteId: number; telefone: string }>;
}): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const insertValues: InsertDisparo = {
    nome: dados.nome, templateId: dados.templateId, fluxoRespostaId: dados.fluxoRespostaId ?? null,
    variaveisConfig: dados.variaveisConfig ?? null,
    totalDestinatarios: dados.destinatarios.length,
  };
  const result = await db.insert(disparos).values(insertValues).$returningId();
  const disparoId = result[0]?.id;
  if (!disparoId) return undefined;
  if (dados.destinatarios.length > 0) {
    const linhas: InsertDisparoDestinatario[] = dados.destinatarios.map((d) => ({
      disparoId, clienteId: d.clienteId, telefone: d.telefone,
    }));
    await db.insert(disparoDestinatarios).values(linhas);
  }
  return disparoId;
}

export async function listDisparoDestinatarios(disparoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(disparoDestinatarios).where(eq(disparoDestinatarios.disparoId, disparoId));
}

export async function listDisparoDestinatariosPendentes(disparoId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(disparoDestinatarios)
    .where(and(eq(disparoDestinatarios.disparoId, disparoId), eq(disparoDestinatarios.status, "pendente")));
}

export async function atualizarDisparoDestinatario(id: number, dados: {
  status: "enviado" | "erro"; erroMsg?: string | null; enviadoEm?: Date;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(disparoDestinatarios).set(dados).where(eq(disparoDestinatarios.id, id));
}

export async function atualizarDisparo(id: number, dados: Partial<InsertDisparo>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(disparos).set(dados).where(eq(disparos.id, id));
}

export async function incrementarDisparoContadores(id: number, dados: { totalEnviados?: number; totalErros?: number }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const set: Record<string, any> = {};
  if (dados.totalEnviados) set.totalEnviados = sql`${disparos.totalEnviados} + ${dados.totalEnviados}`;
  if (dados.totalErros) set.totalErros = sql`${disparos.totalErros} + ${dados.totalErros}`;
  if (Object.keys(set).length === 0) return;
  await db.update(disparos).set(set).where(eq(disparos.id, id));
}

// --- CTR do nó "menu" ---

export async function incrementarFluxoNoEnviados(fluxoNoId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(fluxoNos).set({ enviados: sql`${fluxoNos.enviados} + 1` }).where(eq(fluxoNos.id, fluxoNoId));
}

export async function incrementarFluxoNoOpcaoClique(fluxoNoId: number, opcaoIndex: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(fluxoNoOpcaoCliques).values({ fluxoNoId, opcaoIndex, cliques: 1 })
    .onDuplicateKeyUpdate({ set: { cliques: sql`${fluxoNoOpcaoCliques.cliques} + 1` } });
}

export async function listFluxoNoOpcaoCliques(fluxoIds: number[]) {
  const db = await getDb();
  if (!db || fluxoIds.length === 0) return [];
  const nos = await db.select({ id: fluxoNos.id }).from(fluxoNos).where(inArray(fluxoNos.fluxoId, fluxoIds));
  const noIds = nos.map((n) => n.id);
  if (noIds.length === 0) return [];
  return db.select().from(fluxoNoOpcaoCliques).where(inArray(fluxoNoOpcaoCliques.fluxoNoId, noIds));
}

// --- Aviso de 10min sem retorno (roteador Buddha Mkt) ---

export async function listConversasBuddhaMktSemAlerta() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inboxConversas)
    .where(and(eq(inboxConversas.canal, "buddha_mkt"), isNull(inboxConversas.buddhaMktAlertadoEm)));
}

export async function getUltimaMensagemEnviadaEm(conversaId: number): Promise<Date | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select({ createdAt: inboxMensagens.createdAt })
    .from(inboxMensagens)
    .where(and(eq(inboxMensagens.conversaId, conversaId), eq(inboxMensagens.direcao, "enviada")))
    .orderBy(desc(inboxMensagens.createdAt))
    .limit(1);
  return rows[0]?.createdAt ?? null;
}

/** Existe conversa Z-API (unidade real) do mesmo telefone com mensagem a partir do horário do envio do roteador? Sinal de que o cliente já seguiu o link. */
export async function existeConversaZapiComMensagemApos(telefone: string, apos: Date): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const conversasZapi = await db.select({ id: inboxConversas.id }).from(inboxConversas)
    .where(and(eq(inboxConversas.canal, "zapi"), eq(inboxConversas.telefone, telefone)));
  if (conversasZapi.length === 0) return false;
  const ids = conversasZapi.map((c) => c.id);
  const rows = await db.select({ id: inboxMensagens.id }).from(inboxMensagens)
    .where(and(inArray(inboxMensagens.conversaId, ids), gte(inboxMensagens.createdAt, apos)))
    .limit(1);
  return rows.length > 0;
}

export async function marcarBuddhaMktAlertado(conversaId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxConversas).set({ buddhaMktAlertadoEm: new Date() }).where(eq(inboxConversas.id, conversaId));
}

// ===== Cobranças por Link Mercado Pago =====

export const STATUS_COBRANCA_ABERTA = ["rascunho", "criada", "enviada", "pendente"] as const;
export type StatusCobrancaLink = "rascunho" | "criada" | "enviada" | "pendente" | "aprovada" | "rejeitada" | "cancelada" | "expirada" | "erro";

/** Uma única cobrança em aberto por conversa evita mandar dois Links para a mesma negociação. */
export function chaveCobrancaAberta(conversaId: number): string {
  return `conversa:${conversaId}`;
}

export async function getCobrancaLinkAbertaPorConversa(conversaId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(cobrancasLink)
    .where(eq(cobrancasLink.chaveAberta, chaveCobrancaAberta(conversaId)))
    .limit(1);
  return rows[0];
}

export async function getCobrancaLinkPorId(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(cobrancasLink).where(eq(cobrancasLink.id, id)).limit(1);
  return rows[0];
}

export async function getCobrancaLinkPorReferencia(externalReference: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(cobrancasLink)
    .where(eq(cobrancasLink.externalReference, externalReference)).limit(1);
  return rows[0];
}

export async function criarCobrancaLink(dados: InsertCobrancaLink): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const resultado = await db.insert(cobrancasLink).values(dados).$returningId();
  return resultado[0]?.id;
}

export async function atualizarCobrancaLink(id: number, dados: Partial<InsertCobrancaLink>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(cobrancasLink).set(dados).where(eq(cobrancasLink.id, id));
}

export async function registrarPagamentoCobrancaLink(dados: {
  cobrancaId: number;
  paymentId: string;
  paymentStatus: string;
  paymentStatusDetail?: string | null;
  pagadorNome?: string | null;
  pagadorEmail?: string | null;
  paymentMethodId?: string | null;
  paymentTypeId?: string | null;
  paymentInstallments?: number | null;
  aprovadoEm?: Date | null;
  acaoWebhook?: string | null;
  assinaturaValida: boolean;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const statusMapeado: StatusCobrancaLink = dados.paymentStatus === "approved"
    ? "aprovada"
    : dados.paymentStatus === "rejected" ? "rejeitada"
      : dados.paymentStatus === "cancelled" ? "cancelada"
        : dados.paymentStatus === "expired" ? "expirada"
          : "pendente";
  const terminal = ["aprovada", "rejeitada", "cancelada", "expirada"].includes(statusMapeado);
  await db.update(cobrancasLink).set({
    status: statusMapeado,
    paymentId: dados.paymentId,
    paymentStatus: dados.paymentStatus,
    paymentStatusDetail: dados.paymentStatusDetail ?? null,
    pagadorNome: dados.pagadorNome ?? null,
    pagadorEmail: dados.pagadorEmail ?? null,
    paymentMethodId: dados.paymentMethodId ?? null,
    paymentTypeId: dados.paymentTypeId ?? null,
    paymentInstallments: dados.paymentInstallments ?? null,
    paymentApprovedAt: dados.aprovadoEm ?? null,
    ultimoWebhookEm: new Date(),
    ultimoWebhookAcao: dados.acaoWebhook ?? null,
    webhookAssinaturaValida: dados.assinaturaValida,
    ...(terminal ? { chaveAberta: null } : {}),
    ...(statusMapeado === "aprovada" ? { alertaCriadoEm: new Date() } : {}),
  }).where(eq(cobrancasLink.id, dados.cobrancaId));
}

/** Alertas são derivados das cobranças aprovadas ainda não reconhecidas (alertaReconhecidoEm null). */
export async function listCobrancasLinkAprovadasRecentes(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return db.select({
    id: cobrancasLink.id,
    conversaId: cobrancasLink.conversaId,
    clienteNome: cobrancasLink.clienteNome,
    titulo: cobrancasLink.titulo,
    valor: cobrancasLink.valor,
    paymentMethodId: cobrancasLink.paymentMethodId,
    paymentTypeId: cobrancasLink.paymentTypeId,
    paymentInstallments: cobrancasLink.paymentInstallments,
    paymentApprovedAt: cobrancasLink.paymentApprovedAt,
  }).from(cobrancasLink)
    .where(and(
      eq(cobrancasLink.unidadeId, unidadeId),
      eq(cobrancasLink.status, "aprovada"),
      gte(cobrancasLink.paymentApprovedAt, desde),
      isNull(cobrancasLink.alertaReconhecidoEm),
    ))
    .orderBy(desc(cobrancasLink.paymentApprovedAt));
}

/** Marca o alerta de pagamento aprovado como reconhecido (botão "Ciente"), persistindo no servidor. */
export async function reconhecerAlertaCobrancaLink(cobrancaId: number, unidadeId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(cobrancasLink).set({ alertaReconhecidoEm: new Date() })
    .where(and(eq(cobrancasLink.id, cobrancaId), eq(cobrancasLink.unidadeId, unidadeId)));
}

/** Cobranças confirmadas pelo Webhook são fonte imediata para a recepção, antes da próxima consulta manual no Mercado Pago. */
export async function listCobrancasLinkAprovadasParaConfirmacao(unidadeId: number, desde: Date) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: cobrancasLink.id,
    clienteNome: cobrancasLink.clienteNome,
    titulo: cobrancasLink.titulo,
    valor: cobrancasLink.valor,
    formaPagamentoInformada: cobrancasLink.formaPagamentoInformada,
    paymentMethodId: cobrancasLink.paymentMethodId,
    paymentTypeId: cobrancasLink.paymentTypeId,
    paymentInstallments: cobrancasLink.paymentInstallments,
    paymentId: cobrancasLink.paymentId,
    paymentApprovedAt: cobrancasLink.paymentApprovedAt,
    pagadorNome: cobrancasLink.pagadorNome,
  }).from(cobrancasLink)
    .where(and(
      eq(cobrancasLink.unidadeId, unidadeId),
      eq(cobrancasLink.status, "aprovada"),
      gte(cobrancasLink.paymentApprovedAt, desde),
    ))
    .orderBy(desc(cobrancasLink.paymentApprovedAt));
}

export type FonteConsultaConfirmacaoPagamento = "pix_inter" | "links_mercado_pago";

export async function salvarConsultaConfirmacaoPagamento(dados: {
  unidadeId: number;
  fonte: FonteConsultaConfirmacaoPagamento;
  consultaEm: Date;
  dataInicio: string;
  dataFim: string;
  totalConsultado: number;
  novasVendas?: number | null;
  pagamentos: unknown;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(confirmacaoPagamentosConsultas).values(dados).onDuplicateKeyUpdate({
    set: {
      consultaEm: dados.consultaEm,
      dataInicio: dados.dataInicio,
      dataFim: dados.dataFim,
      totalConsultado: dados.totalConsultado,
      novasVendas: dados.novasVendas ?? null,
      pagamentos: dados.pagamentos,
    },
  });
}

export async function getConsultasConfirmacaoPagamento(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(confirmacaoPagamentosConsultas)
    .where(eq(confirmacaoPagamentosConsultas.unidadeId, unidadeId));
}

export async function listModelosCobrancaLink(unidadeId: number, incluirInativos = false) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cobrancasLinkModelos)
    .where(incluirInativos ? eq(cobrancasLinkModelos.unidadeId, unidadeId) : and(eq(cobrancasLinkModelos.unidadeId, unidadeId), eq(cobrancasLinkModelos.ativo, true)))
    .orderBy(asc(cobrancasLinkModelos.ordem), asc(cobrancasLinkModelos.titulo));
}

export async function criarModeloCobrancaLink(dados: InsertCobrancaLinkModelo): Promise<number | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const resultado = await db.insert(cobrancasLinkModelos).values(dados).$returningId();
  return resultado[0]?.id;
}

export async function atualizarModeloCobrancaLink(id: number, dados: Partial<InsertCobrancaLinkModelo>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(cobrancasLinkModelos).set(dados).where(eq(cobrancasLinkModelos.id, id));
}
