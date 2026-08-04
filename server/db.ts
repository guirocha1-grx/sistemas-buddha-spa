import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, unidades, leads, metas, laminas, syncLogs, copilotConversas, configuracoes, type Unidade, type InsertUnidade, type Lead, type InsertLead, type Meta, type InsertMeta, type Lamina, type InsertLamina, type SyncLog, type InsertSyncLog, type CopilotConversa, type InsertCopilotConversa, type Configuracao } from "../drizzle/schema";
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
