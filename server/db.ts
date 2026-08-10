import crypto from "node:crypto";
import { eq, desc, and, gte, lte, isNull, like, ne, inArray, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, unidades, leads, metas, laminas, syncLogs, copilotConversas, configuracoes, inboxConversas, inboxMensagens, interExtratos, contas, dreCategorias, dreDescricoes, dreRegras, adquirenteVendas, comandaDiaria, comandaItens, auditLog, clientes, atendentes, atendenteSessoes, type Unidade, type InsertUnidade, type Lead, type InsertLead, type Meta, type InsertMeta, type Lamina, type InsertLamina, type SyncLog, type InsertSyncLog, type CopilotConversa, type InsertCopilotConversa, type Configuracao, type InsertInboxConversa, type InsertInboxMensagem, type InsertInterExtrato, type InsertConta, type InsertAdquirenteVenda, type InsertCliente, type InsertComandaItem } from "../drizzle/schema";
import type { LinhaClienteImportada } from "./clientesXlsxParser";
import type { LinhaComandaItemImportada } from "./comandaVirtualXlsxParser";
import { ENV } from './_core/env';
import { DRE_CATEGORIAS_SEED, DRE_DESCRICOES_SEED, DRE_REGRAS_SEED, sugerirDescricaoNome, extrairPadraoContraparte, ehTransferenciaEntreContas, CHAVE_EXCLUIDO, CHAVE_RECEITA_PIX, CHAVE_RECEITA_ESPECIE, CHAVE_RECEITA_CARTAO_DEBITO, CHAVE_RECEITA_CARTAO_CREDITO, type RegraMatch } from "./dreCategorizacao";

let _db: ReturnType<typeof drizzle> | null = null;

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

export async function listInboxConversas(filtros: { unidadeId?: number; canal?: "zapi" | "buddha_mkt" }) {
  const db = await getDb();
  if (!db) return [];
  const condicoes = [];
  if (filtros.unidadeId !== undefined) condicoes.push(eq(inboxConversas.unidadeId, filtros.unidadeId));
  if (filtros.canal !== undefined) condicoes.push(eq(inboxConversas.canal, filtros.canal));
  const query = db.select().from(inboxConversas).orderBy(desc(inboxConversas.ultimaMensagemEm));
  if (condicoes.length === 0) return query;
  return query.where(and(...condicoes));
}

export async function getInboxConversaById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(inboxConversas).where(eq(inboxConversas.id, id)).limit(1);
  return result[0];
}

export async function marcarInboxConversaLida(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxConversas).set({ naoLidas: 0 }).where(eq(inboxConversas.id, id));
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
  nomeContato?: string;
  ultimaMensagemTexto: string;
  incrementarNaoLidas?: boolean;
}) {
  const db = await getDb();
  if (!db) return undefined;

  const existente = await db.select().from(inboxConversas)
    .where(and(eq(inboxConversas.telefone, params.telefone), eq(inboxConversas.canal, params.canal)))
    .limit(1);

  const agora = new Date();

  if (existente[0]) {
    const naoLidas = params.incrementarNaoLidas ? existente[0].naoLidas + 1 : existente[0].naoLidas;
    await db.update(inboxConversas).set({
      nomeContato: params.nomeContato ?? existente[0].nomeContato,
      chatLid: params.chatLid ?? existente[0].chatLid,
      isLidPendente: params.isLidPendente !== undefined ? (params.isLidPendente ? "true" : "false") : existente[0].isLidPendente,
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
    chatLid: params.chatLid,
    isLidPendente: params.isLidPendente ? "true" : "false",
    nomeContato: params.nomeContato,
    ultimaMensagemEm: agora,
    ultimaMensagemTexto: params.ultimaMensagemTexto,
    naoLidas: params.incrementarNaoLidas ? 1 : 0,
  };
  const result = await db.insert(inboxConversas).values(insertValues).$returningId();
  return result[0]?.id;
}

/**
 * Junta uma conversa "@lid" (número real desconhecido) a uma conversa já
 * identificada pelo telefone real — move as mensagens e apaga a duplicata.
 * Uso manual, quando o número aparece depois por outro canal/atendimento.
 */
export async function unificarInboxConversas(idLid: number, idReal: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxMensagens).set({ conversaId: idReal }).where(eq(inboxMensagens.conversaId, idLid));
  await db.delete(inboxConversas).where(eq(inboxConversas.id, idLid));
}

/**
 * Join com atendentes só pra resolver o nome de quem realmente enviou
 * (enviadaPorAtendenteId) — enviadaPorUserId continua sendo a conta
 * Google/Manus compartilhada, não é isso que a UI mostra no balão.
 */
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
    lida: inboxMensagens.lida,
    createdAt: inboxMensagens.createdAt,
  })
    .from(inboxMensagens)
    .leftJoin(atendentes, eq(inboxMensagens.enviadaPorAtendenteId, atendentes.id))
    .where(eq(inboxMensagens.conversaId, conversaId))
    .orderBy(desc(inboxMensagens.createdAt))
    .limit(limit);
  return mensagens.reverse();
}

export async function insertInboxMensagem(mensagem: InsertInboxMensagem) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(inboxMensagens).values(mensagem).$returningId();
  return result[0]?.id;
}

export async function updateInboxMensagemTranscricao(id: number, transcricao: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxMensagens).set({ transcricao }).where(eq(inboxMensagens.id, id));
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
 * Classifica o tipo de uma venda de adquirente (payment_type_id do
 * Mercado Pago — em inglês, ex.: "debit_card" — ou texto livre do CSV
 * Interpag/Granito — em português, ex.: "155 - DÉBITO COBRANÇA
 * REFERENTE..." — confirmado num CSV real) numa das 3 Descrições de
 * receita "de máquina". Pix direto no banco (não pela maquininha) é
 * tratado à parte, via regra de texto "Pix recebido" em inter_extratos.
 *
 * Bug real encontrado: "débito"/"crédito" (com acento) não batem no
 * substring em inglês "debit"/"credit" — normaliza removendo acentos
 * antes de comparar, daí "débito" → "debito" bate em "debit" e
 * "crédito" → "credito" bate em "credit", cobrindo os dois idiomas com
 * a mesma checagem.
 */
function chaveDescricaoAdquirente(tipo: string | null | undefined): string | null {
  const t = (tipo || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (t.includes("pix")) return CHAVE_RECEITA_PIX;
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
  // por linha) — mesmo espírito de listRegrasParaMatch/listCnpjsDeContas.
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
        await db.update(adquirenteVendas).set(linha).where(eq(adquirenteVendas.id, existente[0].id));
        continue;
      }
    }
    await db.insert(adquirenteVendas).values({ ...linha, unidadeId });
    inseridos++;
  }
  return inseridos;
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
export async function listInterExtratos(
  unidadeId: number,
  dataInicio: string,
  dataFim: string,
  contaId?: number,
) {
  const db = await getDb();
  if (!db) return [];
  const condicoes = [
    eq(interExtratos.unidadeId, unidadeId),
    gte(interExtratos.dataEntrada, dataInicio),
    lte(interExtratos.dataEntrada, dataFim),
  ];
  if (contaId !== undefined) condicoes.push(eq(interExtratos.contaId, contaId));
  return db
    .select()
    .from(interExtratos)
    .where(and(...condicoes))
    .orderBy(desc(interExtratos.dataEntrada));
}

// ===== Comanda Recepção (conciliação semanal de caixa) =====

/**
 * Grava/atualiza os valores diários da "Comanda (Recepção)" lidos da
 * planilha Consolidado comanda (linhas 3-6, ver server/googleSheets.ts).
 */
export async function upsertComandaDiaria(
  unidadeId: number,
  linhas: { data: string; dinheiro: number; cartaoDebito: number; cartaoCredito: number; pix: number }[],
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  let gravados = 0;
  for (const l of linhas) {
    const existente = await db.select({ id: comandaDiaria.id }).from(comandaDiaria)
      .where(and(eq(comandaDiaria.unidadeId, unidadeId), eq(comandaDiaria.data, l.data)))
      .limit(1);
    const valores = {
      unidadeId,
      data: l.data,
      dinheiro: l.dinheiro.toFixed(2),
      cartaoDebito: l.cartaoDebito.toFixed(2),
      cartaoCredito: l.cartaoCredito.toFixed(2),
      pix: l.pix.toFixed(2),
    };
    if (existente[0]) {
      await db.update(comandaDiaria).set(valores).where(eq(comandaDiaria.id, existente[0].id));
    } else {
      await db.insert(comandaDiaria).values(valores);
    }
    gravados++;
  }
  return gravados;
}

export async function listComandaDiaria(unidadeId: number, dataInicio: string, dataFim: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(comandaDiaria).where(and(
    eq(comandaDiaria.unidadeId, unidadeId),
    gte(comandaDiaria.data, dataInicio),
    lte(comandaDiaria.data, dataFim),
  ));
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

// ===== Contas =====

export async function listContas(unidadeId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contas).where(eq(contas.unidadeId, unidadeId)).orderBy(contas.createdAt);
}

/**
 * CNPJs de todas as contas cadastradas (qualquer unidade — transferência
 * entre Satori e Agama, por exemplo, atravessa unidade). Normalizado
 * (só dígitos), pra bater contra cpfCnpjOrigem/cpfCnpjDestino do extrato
 * sem depender de formatação.
 */
export async function listCnpjsDeContas(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const todas = await db.select({ cnpj: contas.cnpj }).from(contas);
  return todas.map((c) => c.cnpj?.replace(/\D/g, "")).filter((c): c is string => !!c);
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

  const insertValues: InsertConta = { unidadeId, nome: "Mercado Pago", tipo: "manual" };
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
const CONTAS_PADRAO = ["Sicredi", "Mercado Pago"];

export async function ensureContasPadrao(unidadeId: number) {
  const db = await getDb();
  if (!db) return;
  const existentes = await db.select({ nome: contas.nome }).from(contas).where(eq(contas.unidadeId, unidadeId));
  const nomesExistentes = new Set(existentes.map((c) => c.nome));
  for (const nome of CONTAS_PADRAO) {
    if (!nomesExistentes.has(nome)) {
      const insertValues: InsertConta = { unidadeId, nome, tipo: "manual" };
      await db.insert(contas).values(insertValues);
    }
  }
}

export interface DadosConta {
  nome: string;
  agencia?: string;
  numeroConta?: string;
  cnpj?: string;
  saldoInicial?: string;
  saldoInicialEm?: string;
}

export async function createConta(unidadeId: number, dados: DadosConta) {
  const db = await getDb();
  if (!db) return undefined;
  const insertValues: InsertConta = { unidadeId, tipo: "manual", ...dados };
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
export async function criarDreDescricao(nome: string, dreCategoriaId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(dreDescricoes).values({ nome, dreCategoriaId }).$returningId();
  return result[0]?.id;
}

export async function atualizarDreDescricao(id: number, dados: { nome?: string; dreCategoriaId?: number }) {
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
  contaId: number;
  dataEntrada: string; // AAAA-MM-DD
  tipoTransacao?: string | null;
  titulo?: string | null;
  descricao?: string | null;
  valor: number; // sempre positivo
  cpfCnpjOrigem?: string | null;
  cpfCnpjDestino?: string | null;
  // origem/tipoOperacao habilitam os 2 casos determinísticos abaixo
  // (Caixa Físico e liquidação Mercado Pago) — sem eles, cai direto na
  // regra de texto/valor de sempre.
  origem?: string | null;
  tipoOperacao?: "D" | "C" | null;
}

/**
 * Ponto único de categorização automática — usado no import (sync,
 * CSV, PDF, OFX) e no reprocessamento de pendentes. Ordem de
 * prioridade:
 * 1) CNPJ batendo com conta própria = transferência, sempre excluída
 *    do DRE, sem exceção;
 * 2) origem "mercadopago" (liquidação da adquirente) = Excluído do DRE
 *    — esse dinheiro já foi contado como receita via adquirente_vendas
 *    (ver classificarDescricaoAdquirente); contar de novo aqui
 *    duplicaria e foi a causa real do Pix inflado na Comanda Recepção;
 * 3) origem "caixa_fisico" e crédito = "Receita em Espécie" direto, sem
 *    precisar de regra de texto — toda entrada do Caixa Físico é
 *    dinheiro em espécie por definição;
 * 4) regra de texto/valor (como sempre foi).
 * Se a regra tiver alertaSeRepetirNoMes e já existir outra transação
 * da mesma descrição na mesma conta no mesmo mês, marca um aviso (não
 * bloqueia, só avisa).
 */
export async function categorizarTransacaoAutomaticamente(
  dados: DadosParaCategorizar,
  regras: (RegraMatch & { dreDescricaoId: number; alertaSeRepetirNoMes: boolean })[],
  cnpjsContas: string[],
  transacaoIdParaExcluirDoAlerta?: number,
): Promise<{ dreDescricaoId: number | null; categorizacaoStatus: "sugerida" | "pendente"; alerta: string | null }> {
  if (ehTransferenciaEntreContas(dados.cpfCnpjOrigem, dados.cpfCnpjDestino, cnpjsContas)) {
    const excluidoId = await resolverDescricaoIdPorChave(CHAVE_EXCLUIDO);
    if (excluidoId) return { dreDescricaoId: excluidoId, categorizacaoStatus: "sugerida", alerta: null };
  }

  if (dados.origem === "mercadopago") {
    const excluidoId = await resolverDescricaoIdPorChave(CHAVE_EXCLUIDO);
    if (excluidoId) return { dreDescricaoId: excluidoId, categorizacaoStatus: "sugerida", alerta: null };
  }

  if (dados.origem === "caixa_fisico" && dados.tipoOperacao === "C") {
    const especieId = await resolverDescricaoIdPorChave(CHAVE_RECEITA_ESPECIE);
    if (especieId) return { dreDescricaoId: especieId, categorizacaoStatus: "sugerida", alerta: null };
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
 * Reaplica as regras atuais em transações que ainda estão "pendente".
 * Necessário porque a categorização só roda no momento do import ou
 * quando uma regra nova é aprendida — toda vez que uma regra nova entra,
 * as linhas antigas continuam pendentes até alguém rodar isso. Não mexe
 * em linha "sugerida" ou "confirmada".
 *
 * Resultado vira "sugerida" (não "confirmada") — é o sistema aplicando
 * uma regra, não uma decisão humana; ainda precisa de 1 clique de
 * confirmação.
 */
export async function reprocessarPendentes(unidadeId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const regras = await listRegrasParaMatch();
  if (regras.length === 0) return 0;
  const cnpjsContas = await listCnpjsDeContas();

  const pendentes = await db.select().from(interExtratos)
    .where(and(eq(interExtratos.unidadeId, unidadeId), eq(interExtratos.categorizacaoStatus, "pendente")));

  let atualizados = 0;
  for (const t of pendentes) {
    const resultado = await categorizarTransacaoAutomaticamente({
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
    }, regras, cnpjsContas, t.id);
    if (!resultado.dreDescricaoId) continue;
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
 * Marca como "confirmada" direto (não precisa de segundo clique) e, se
 * a descrição não for nula, tenta "aprender" uma regra nova a partir da
 * contraparte dessa transação — pra próxima vez que aparecer um
 * pagamento parecido, o sistema já sugerir sozinho.
 *
 * Regra aprendida é aplicada de imediato nas outras transações
 * "pendente" da unidade (via reprocessarPendentes), viram "sugerida" —
 * o usuário confirma cada uma com 1 clique, não fica automático demais.
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
  if (!transacao) return { regraAprendida: false };

  const textoContraparte = transacao.titulo || transacao.descricao || "";
  const padrao = extrairPadraoContraparte(textoContraparte);
  if (!padrao) return { regraAprendida: false };

  const jaExiste = await db.select({ id: dreRegras.id }).from(dreRegras)
    .where(and(eq(dreRegras.padrao, padrao), eq(dreRegras.ativa, "true")))
    .limit(1);
  if (jaExiste.length > 0) return { regraAprendida: false };

  await db.insert(dreRegras).values({ padrao, dreDescricaoId, origem: "aprendida" });
  await reprocessarPendentes(transacao.unidadeId);
  return { regraAprendida: true };
}

/**
 * Confirma uma sugestão automática sem trocar a categoria — o "tá
 * certo" de 1 clique. Só age em linha "sugerida"; ignora silenciosamente
 * qualquer outro estado (evita confirmar algo que já não é sugestão).
 */
export async function confirmarSugestao(transacaoId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(interExtratos).set({ categorizacaoStatus: "confirmada" })
    .where(and(eq(interExtratos.id, transacaoId), eq(interExtratos.categorizacaoStatus, "sugerida")));
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

  const insertValues: InsertConta = { unidadeId, nome: "Caixa Físico", tipo: "manual" };
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
 */
export async function upsertClientesImportados(
  unidadeSlug: "rbs" | "ssu",
  linhas: LinhaClienteImportada[],
): Promise<{ inseridos: number; atualizados: number }> {
  const db = await getDb();
  if (!db) return { inseridos: 0, atualizados: 0 };
  if (linhas.length === 0) return { inseridos: 0, atualizados: 0 };

  const belleIds = linhas.map((l) => l.belleId);
  const existentes = await db.select({ belleId: clientes.belleId }).from(clientes).where(inArray(clientes.belleId, belleIds));
  const existentesSet = new Set(existentes.map((e) => e.belleId));

  const flagUnidade = unidadeSlug === "ssu" ? { clienteSsu: true as const } : { clienteRbs: true as const };

  let inseridos = 0;
  let atualizados = 0;
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

    if (existentesSet.has(l.belleId)) {
      await db.update(clientes).set({ ...dadosBase, ...flagUnidade }).where(eq(clientes.belleId, l.belleId));
      atualizados++;
    } else {
      const insertValues: InsertCliente = {
        belleId: l.belleId,
        ...dadosBase,
        clienteSsu: unidadeSlug === "ssu",
        clienteRbs: unidadeSlug === "rbs",
      };
      await db.insert(clientes).values(insertValues);
      inseridos++;
    }
  }

  return { inseridos, atualizados };
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
export async function listClientesLocal() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clientes).orderBy(clientes.nome).limit(20000);
}

// ===== Comanda virtual (item a item — auditoria da Comanda Recepção) =====

const LOTE_INSERT_COMANDA_ITENS = 500;

/**
 * Upsert por unidadeId+data+idLinha (idLinha = "ID" sequencial da
 * própria planilha, dentro de cada dia). Uma consulta prévia busca as
 * chaves já existentes de uma vez (mesmo espírito de
 * upsertClientesImportados) — evita um SELECT por linha numa carga
 * histórica com milhares delas.
 *
 * Inserção em lote (não um INSERT por linha): numa carga histórica
 * (a esmagadora maioria é linha nova, nunca vista) um INSERT por linha
 * é lento o bastante pra estourar o timeout da requisição em
 * planilhas grandes — confirmado na prática (RBS, ~6 mil linhas,
 * timeout; SSU, ~3 mil, passou raspando). Update continua um a um —
 * bem mais raro (só acontece reimportando um dia já existente).
 */
export async function upsertComandaItens(
  unidadeId: number,
  linhas: LinhaComandaItemImportada[],
): Promise<{ inseridos: number; atualizados: number }> {
  const db = await getDb();
  if (!db) return { inseridos: 0, atualizados: 0 };
  if (linhas.length === 0) return { inseridos: 0, atualizados: 0 };

  const existentes = await db
    .select({ id: comandaItens.id, data: comandaItens.data, idLinha: comandaItens.idLinha })
    .from(comandaItens)
    .where(eq(comandaItens.unidadeId, unidadeId));
  const existentesMap = new Map(existentes.map((e) => [`${e.data}|${e.idLinha}`, e.id]));

  const paraInserir: InsertComandaItem[] = [];
  const paraAtualizar: { id: number; dados: Partial<InsertComandaItem> }[] = [];

  for (const l of linhas) {
    const dadosBase = {
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
    };

    const chave = `${l.data}|${l.idLinha}`;
    const existenteId = existentesMap.get(chave);
    if (existenteId) {
      paraAtualizar.push({ id: existenteId, dados: dadosBase });
    } else {
      paraInserir.push({ unidadeId, data: l.data, idLinha: l.idLinha, ...dadosBase });
    }
  }

  for (let i = 0; i < paraInserir.length; i += LOTE_INSERT_COMANDA_ITENS) {
    const lote = paraInserir.slice(i, i + LOTE_INSERT_COMANDA_ITENS);
    await db.insert(comandaItens).values(lote);
  }

  for (const { id, dados } of paraAtualizar) {
    await db.update(comandaItens).set(dados).where(eq(comandaItens.id, id));
  }

  return { inseridos: paraInserir.length, atualizados: paraAtualizar.length };
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
