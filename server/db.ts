import { eq, desc, and, like, or, sql, ne, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, unidades, leads, metas, laminas, syncLogs, copilotConversas, configuracoes,
  clientes, atendimentos, inboxConversas, inboxMensagens, scripts, scriptsUso, faseVenda, auditLog, tarefasDia,
  type Unidade, type InsertUnidade, type Lead, type InsertLead, type Meta, type InsertMeta,
  type Lamina, type InsertLamina, type SyncLog, type InsertSyncLog, type CopilotConversa, type InsertCopilotConversa,
  type Configuracao, type Cliente, type InsertCliente, type Atendimento, type InsertAtendimento,
  type InboxConversa, type InsertInboxConversa, type InboxMensagem, type InsertInboxMensagem,
  type Script, type InsertScript, type FaseVenda, type TarefaDia, type InsertTarefaDia,
} from "../drizzle/schema";
import { ENV } from './_core/env';

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

// ===== Clientes =====

export async function listClientes(opts?: {
  busca?: string;
  unidadeId?: number;
  status?: string;
  tipo?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  let query = db.select().from(clientes).where(eq(clientes.ativo, true)).$dynamic();

  if (opts?.busca) {
    const termo = `%${opts.busca}%`;
    query = query.where(
      or(
        like(clientes.nome, termo),
        like(clientes.cpfCnpj, termo),
        like(clientes.celular, termo),
        like(clientes.email, termo),
      )!
    );
  }
  if (opts?.unidadeId) {
    query = query.where(eq(clientes.unidadeId, opts.unidadeId));
  }
  if (opts?.status && opts.status !== 'all') {
    query = query.where(eq(clientes.statusCliente, opts.status as any));
  }
  if (opts?.tipo && opts.tipo !== 'all') {
    query = query.where(eq(clientes.tipoCliente, opts.tipo as any));
  }

  return query.orderBy(desc(clientes.updatedAt)).limit(limit).offset(offset);
}

export async function getClienteById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clientes).where(eq(clientes.id, id)).limit(1);
  return result[0];
}

export async function getClienteByCpf(cpf: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clientes).where(eq(clientes.cpfCnpj, cpf)).limit(1);
  return result[0];
}

export async function getClienteByCelular(celular: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(clientes).where(eq(clientes.celular, celular)).limit(1);
  return result[0];
}

export async function createCliente(cliente: InsertCliente) {
  const db = await getDb();
  if (!db) return;
  await db.insert(clientes).values(cliente);
}

export async function updateCliente(id: number, dados: Partial<InsertCliente>) {
  const db = await getDb();
  if (!db) return;
  await db.update(clientes).set(dados).where(eq(clientes.id, id));
}

export async function countClientes(opts?: { unidadeId?: number; tipo?: string }) {
  const db = await getDb();
  if (!db) return 0;
  let query = db.select({ count: sql<number>`count(*)` }).from(clientes).where(eq(clientes.ativo, true)).$dynamic();
  if (opts?.unidadeId) query = query.where(eq(clientes.unidadeId, opts.unidadeId));
  if (opts?.tipo && opts.tipo !== 'all') query = query.where(eq(clientes.tipoCliente, opts.tipo as any));
  const result = await query;
  return result[0]?.count ?? 0;
}

// ===== Atendimentos =====

export async function listAtendimentosByCliente(clienteId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(atendimentos)
    .where(and(eq(atendimentos.clienteId, clienteId), eq(atendimentos.ativo, true)))
    .orderBy(desc(atendimentos.dataAtendimento));
}

export async function createAtendimento(atendimento: InsertAtendimento) {
  const db = await getDb();
  if (!db) return;
  await db.insert(atendimentos).values(atendimento);
}

export async function updateAtendimento(id: number, dados: Partial<InsertAtendimento>) {
  const db = await getDb();
  if (!db) return;
  await db.update(atendimentos).set(dados).where(eq(atendimentos.id, id));
}

// ===== Kanban =====

export async function getKanbanOportunidades(unidadeId?: number) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select({
    atendimento: atendimentos,
    cliente: clientes,
    fase: faseVenda,
  })
    .from(atendimentos)
    .innerJoin(clientes, eq(atendimentos.clienteId, clientes.id))
    .leftJoin(faseVenda, eq(atendimentos.statusAtendimentoNew, faseVenda.codFase))
    .where(and(eq(atendimentos.ativo, true), ne(atendimentos.tipoAtendimento, 'venda_concretizada')))
    .$dynamic();

  if (unidadeId) {
    query = query.where(eq(atendimentos.unidadeId, unidadeId));
  }

  return query.orderBy(desc(atendimentos.dataAtendimento));
}

export async function moverOportunidade(atendimentoId: number, novaFaseCod: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(atendimentos)
    .set({ statusAtendimentoNew: novaFaseCod })
    .where(eq(atendimentos.id, atendimentoId));
}

export async function registrarPerda(atendimentoId: number, motivoPerda: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(atendimentos)
    .set({ motivoPerda, dataPerdido: new Date(), ativo: false })
    .where(eq(atendimentos.id, atendimentoId));
}

export async function getFasesVenda() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(faseVenda).where(eq(faseVenda.ativo, true));
}

// ===== Inbox =====

export async function listInboxConversas(opts?: {
  unidadeId?: number;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  let query = db.select().from(inboxConversas).$dynamic();

  if (opts?.unidadeId) query = query.where(eq(inboxConversas.unidadeId, opts.unidadeId));
  if (opts?.status && opts.status !== 'all') query = query.where(eq(inboxConversas.status, opts.status as any));

  return query.orderBy(desc(inboxConversas.ultimaMensagemEm)).limit(limit).offset(offset);
}

export async function getInboxConversa(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(inboxConversas).where(eq(inboxConversas.id, id)).limit(1);
  return result[0];
}

export async function getInboxMensagens(conversaId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(inboxMensagens)
    .where(eq(inboxMensagens.conversaId, conversaId))
    .orderBy(inboxMensagens.createdAt);
}

export async function upsertInboxConversa(conversa: InsertInboxConversa) {
  const db = await getDb();
  if (!db) return;
  // Try to find existing by telefone
  const existing = await db.select().from(inboxConversas)
    .where(eq(inboxConversas.telefone, conversa.telefone)).limit(1);

  if (existing.length > 0) {
    const id = existing[0].id;
    await db.update(inboxConversas).set({
      ultimaMensagemEm: new Date(),
      ultimaMensagemTexto: conversa.ultimaMensagemTexto,
      naoLidas: (existing[0].naoLidas || 0) + 1,
      nomeContato: conversa.nomeContato || existing[0].nomeContato,
      fotoUrl: conversa.fotoUrl || existing[0].fotoUrl,
    }).where(eq(inboxConversas.id, id));
    return id;
  }

  const result: any = await db.insert(inboxConversas).values(conversa);
  return Number(result?.insertId ?? result?.[0]?.insertId ?? 0);
}

export async function updateInboxConversa(id: number, dados: Partial<InsertInboxConversa>) {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxConversas).set(dados as any).where(eq(inboxConversas.id, id));
}

export async function insertInboxMensagem(mensagem: InsertInboxMensagem) {
  const db = await getDb();
  if (!db) return;
  await db.insert(inboxMensagens).values(mensagem);
}

export async function marcarConversaLida(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(inboxConversas).set({ naoLidas: 0 }).where(eq(inboxConversas.id, id));
  await db.update(inboxMensagens).set({ lida: true }).where(eq(inboxMensagens.conversaId, id));
}

export async function totalNaoLidas(unidadeId?: number) {
  const db = await getDb();
  if (!db) return 0;
  let query = db.select({ total: sql<number>`coalesce(sum(${inboxConversas.naoLidas}), 0)` }).from(inboxConversas).$dynamic();
  if (unidadeId) query = query.where(eq(inboxConversas.unidadeId, unidadeId));
  const result = await query;
  return result[0]?.total ?? 0;
}

// ===== Scripts =====

export async function listScripts(categoria?: string) {
  const db = await getDb();
  if (!db) return [];
  let query = db.select().from(scripts).where(eq(scripts.ativo, true)).$dynamic();
  if (categoria) query = query.where(eq(scripts.categoriaScript, categoria));
  return query.orderBy(desc(scripts.createdAt));
}

export async function createScript(script: InsertScript) {
  const db = await getDb();
  if (!db) return;
  await db.insert(scripts).values(script);
}

export async function registrarUsoScript(scriptId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(scriptsUso).values({ scriptId, userId });
}

// ===== Tarefas do Dia =====

export async function getTarefasDia(userId: number, data: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(tarefasDia)
    .where(and(eq(tarefasDia.userId, userId), eq(tarefasDia.data, data as any)))
    .orderBy(tarefasDia.feita);
}

export async function createTarefaDia(tarefa: InsertTarefaDia) {
  const db = await getDb();
  if (!db) return;
  await db.insert(tarefasDia).values(tarefa);
}

export async function toggleTarefaDia(id: number, feita: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(tarefasDia).set({ feita, feitaEm: feita ? new Date() : null }).where(eq(tarefasDia.id, id));
}

// ===== Audit Log =====

export async function createAuditLog(entry: {
  userId?: number;
  userNome?: string;
  userRole?: string;
  procedure: string;
  origem?: string;
  clienteId?: number;
  inputResumo?: string;
  sucesso?: boolean;
  erroMsg?: string;
  duracaoMs?: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLog).values({
    ...entry,
    origem: (entry.origem as any) || 'manual',
    sucesso: entry.sucesso ?? true,
  });
}
