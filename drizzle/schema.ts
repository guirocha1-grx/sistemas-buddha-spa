import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, decimal, datetime } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Unidades do Buddha Spa — Shopping Santa Úrsula e Ribeirão Shopping.
 * codEstab é o código usado pela API do Belle Software.
 */
export const unidades = mysqlTable("unidades", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 128 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  codEstab: int("codEstab").notNull(),
  belleToken: text("belleToken"),
  corTema: varchar("corTema", { length: 32 }),
  ativa: mysqlEnum("ativa", ["true", "false"]).default("true").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Unidade = typeof unidades.$inferSelect;
export type InsertUnidade = typeof unidades.$inferInsert;

/**
 * Configurações gerais do sistema (chave-valor).
 */
export const configuracoes = mysqlTable("configuracoes", {
  id: int("id").autoincrement().primaryKey(),
  chave: varchar("chave", { length: 128 }).notNull().unique(),
  valor: text("valor"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Configuracao = typeof configuracoes.$inferSelect;
export type InsertConfiguracao = typeof configuracoes.$inferInsert;

/**
 * Leads capturados pelo sistema e enviados ao Belle Software.
 */
export const leads = mysqlTable("leads", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  nome: varchar("nome", { length: 256 }).notNull(),
  celular: varchar("celular", { length: 32 }),
  email: varchar("email", { length: 320 }),
  cpf: varchar("cpf", { length: 20 }),
  dataNascimento: varchar("dataNascimento", { length: 20 }),
  genero: varchar("genero", { length: 32 }),
  profissao: varchar("profissao", { length: 128 }),
  observacao: text("observacao"),
  tipoOrigem: varchar("tipoOrigem", { length: 64 }),
  codOrigem: varchar("codOrigem", { length: 64 }),
  belleCodigo: int("belleCodigo"),
  statusEnvioBelle: mysqlEnum("statusEnvioBelle", ["pendente", "enviado", "erro"]).default("pendente").notNull(),
  erroBelle: text("erroBelle"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Lead = typeof leads.$inferSelect;
export type InsertLead = typeof leads.$inferInsert;

/**
 * Metas financeiras por unidade e período.
 */
export const metas = mysqlTable("metas", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  mes: int("mes").notNull(),
  ano: int("ano").notNull(),
  valorFaturamento: decimal("valorFaturamento", { precision: 12, scale: 2 }),
  valorRecebimento: decimal("valorRecebimento", { precision: 12, scale: 2 }),
  numAgendamentos: int("numAgendamentos"),
  numNovosClientes: int("numNovosClientes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Meta = typeof metas.$inferSelect;
export type InsertMeta = typeof metas.$inferInsert;

/**
 * Lâminas de divulgação geradas pelo sistema.
 */
export const laminas = mysqlTable("laminas", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  titulo: varchar("titulo", { length: 256 }).notNull(),
  template: varchar("template", { length: 64 }).notNull(),
  conteudo: json("conteudo"),
  imagemUrl: text("imagemUrl"),
  status: mysqlEnum("status", ["rascunho", "pronto", "publicado"]).default("rascunho").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Lamina = typeof laminas.$inferSelect;
export type InsertLamina = typeof laminas.$inferInsert;

/**
 * Log de sincronização com a API do Belle Software.
 */
export const syncLogs = mysqlTable("syncLogs", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  tipo: varchar("tipo", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["sucesso", "erro", "parcial"]).notNull(),
  registrosProcessados: int("registrosProcessados").default(0).notNull(),
  detalhes: text("detalhes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type SyncLog = typeof syncLogs.$inferSelect;
export type InsertSyncLog = typeof syncLogs.$inferInsert;

/**
 * Conversas do Copilot de atendimento.
 */
export const copilotConversas = mysqlTable("copilotConversas", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  userId: int("userId"),
  clienteCpf: varchar("clienteCpf", { length: 20 }),
  clienteNome: varchar("clienteNome", { length: 256 }),
  mensagens: json("mensagens"),
  status: mysqlEnum("status", ["ativa", "encerrada"]).default("ativa").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CopilotConversa = typeof copilotConversas.$inferSelect;
export type InsertCopilotConversa = typeof copilotConversas.$inferInsert;
