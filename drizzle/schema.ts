import {
  boolean,
  date,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

// ─── Users (extending Mobai-style roles) ─────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  nomeExibicao: varchar("nome_exibicao", { length: 50 }),
  assinarMensagens: boolean("assinar_mensagens").default(false).notNull(),
  email: varchar("email", { length: 320 }),
  celular: varchar("celular", { length: 20 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "gerente", "consultor", "suporte"]).default("user").notNull(),
  gerenteId: int("gerenteId"),
  ativo: boolean("ativo").default(true).notNull(),
  iaInboxAtivo: boolean("ia_inbox_ativo").default(false).notNull(),
  iaScriptsAtivo: boolean("ia_scripts_ativo").default(false).notNull(),
  acessoInboxMobile: boolean("acesso_inbox_mobile").default(false).notNull(),
  acessoFinanceiro: boolean("acesso_financeiro").default(false).notNull(),
  unidadeId: int("unidadeId"), // FK unidades.id — unidade padrão do usuário
  estiloCopiloto: text("estilo_copiloto"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Unidades do Buddha Spa ──────────────────────────────────────────────────
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

// ─── Configurações gerais (chave-valor) ──────────────────────────────────────
export const configuracoes = mysqlTable("configuracoes", {
  id: int("id").autoincrement().primaryKey(),
  chave: varchar("chave", { length: 128 }).notNull().unique(),
  valor: text("valor"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Configuracao = typeof configuracoes.$inferSelect;
export type InsertConfiguracao = typeof configuracoes.$inferInsert;

// ─── Tipo Classificação (lookup) ────────────────────────────────────────────
export const tipoClassificacao = mysqlTable("tipo_classificacao", {
  id: int("id").autoincrement().primaryKey(),
  classificacao: varchar("classificacao", { length: 100 }).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
});

export type TipoClassificacao = typeof tipoClassificacao.$inferSelect;

// ─── Fase Venda (lookup — Kanban) ────────────────────────────────────────────
export const faseVenda = mysqlTable("fase_venda", {
  codFase: int("codFase").primaryKey(),
  faseVenda: varchar("faseVenda", { length: 120 }).notNull(),
  classificacaoFase: varchar("classificacaoFase", { length: 60 }),
  idClassificacao: int("idClassificacao"),
  kanbanColuna: varchar("kanbanColuna", { length: 60 }),
  controle: varchar("controle", { length: 10 }),
  proximoContato: int("proximoContato").default(1),
  formulario: int("formulario").default(1),
  ativo: boolean("ativo").default(true).notNull(),
});

export type FaseVenda = typeof faseVenda.$inferSelect;

// ─── Clientes (adaptado do Mobai — sem tags de viagem) ──────────────────────
export const clientes = mysqlTable("clientes", {
  id: int("id").autoincrement().primaryKey(),
  // Identificação
  tipo: mysqlEnum("tipo", ["F", "J"]).default("F").notNull(),
  nome: varchar("nome", { length: 200 }).notNull(),
  nomeFantasia: varchar("nomeFantasia", { length: 200 }),
  sexo: mysqlEnum("sexo", ["M", "F", "O"]),
  dataNascimento: date("dataNascimento"),
  cpfCnpj: varchar("cpfCnpj", { length: 20 }),
  // Contato
  telefone: varchar("telefone", { length: 30 }),
  celular: varchar("celular", { length: 30 }),
  email: varchar("email", { length: 320 }),
  // Endereço
  endereco: varchar("endereco", { length: 200 }),
  numeroEnd: varchar("numeroEnd", { length: 20 }),
  complemento: varchar("complemento", { length: 100 }),
  bairro: varchar("bairro", { length: 100 }),
  cidade: varchar("cidade", { length: 100 }),
  uf: varchar("uf", { length: 2 }),
  cep: varchar("cep", { length: 10 }),
  // Captação e qualificação
  canalCaptacao: varchar("canalCaptacao", { length: 100 }),
  campanha: varchar("campanha", { length: 200 }),
  leadScore: int("leadScore").default(0),
  engajamento: mysqlEnum("engajamento", ["Alto", "Medio", "Baixo"]),
  engajamentoManual: boolean("engajamento_manual").default(false).notNull(),
  tipoCliente: mysqlEnum("tipoCliente", ["lead", "cliente"]).default("lead"),
  tagClienteVip: boolean("tagClienteVip").default(false),
  // Tags de perfil (spa — simplificado)
  tagFrequente: boolean("tagFrequente").default(false),
  tagPremium: boolean("tagPremium").default(false),
  tagAniversariante: boolean("tagAniversariante").default(false),
  tagReativacao: boolean("tagReativacao").default(false),
  // Observações
  observacoesGerais: text("observacoesGerais"),
  // Perfil comportamental DISC
  discPerfil: mysqlEnum("discPerfil", ["D", "I", "S", "C"]),
  discObservacoes: text("discObservacoes"),
  // Dicas de atendimento geradas por IA
  dicasAtendimento: text("dicasAtendimento"),
  // Integração Belle Software
  codBelle: varchar("codBelle", { length: 20 }),
  unidadeId: int("unidadeId"), // FK unidades.id — unidade padrão do cliente
  // Responsável e status
  agenteCodigo: int("agenteCodigo"), // FK users.id
  dispensadoPor: int("dispensadoPor"),
  motivoDispensa: mysqlEnum("motivoDispensa", [
    "nunca_interagiu", "parou_interacao", "sem_interesse",
    "dados_invalidos", "duplicado", "outro",
  ]),
  statusCliente: mysqlEnum("statusCliente", ["ativo", "inativo", "trash"]).default("ativo").notNull(),
  qualificacaoCelebradaEm: timestamp("qualificacao_celebrada_em"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Cliente = typeof clientes.$inferSelect;
export type InsertCliente = typeof clientes.$inferInsert;

// ─── Atendimentos (adaptado — sem campos de viagem) ─────────────────────────
export const atendimentos = mysqlTable("atendimentos", {
  id: int("id").autoincrement().primaryKey(),
  clienteId: int("clienteId").notNull(),
  agenteId: int("agenteId"),
  unidadeId: int("unidadeId"), // FK unidades.id
  // Classificação
  tipoAtendimento: mysqlEnum("tipoAtendimento", [
    "contato_inicial", "follow_up", "negociacao",
    "venda_concretizada", "pos_venda", "reativacao",
    "oferta_indireta", "outro",
  ]).notNull(),
  tipoContato: mysqlEnum("tipoContato", [
    "whatsapp", "ligacao", "email", "presencial", "outro",
  ]).default("whatsapp"),
  // Conteúdo
  dataAtendimento: timestamp("dataAtendimento").defaultNow().notNull(),
  observacoes: text("observacoes"),
  resultado: mysqlEnum("resultado", [
    "positivo", "neutro", "negativo", "sem_resposta",
  ]).default("neutro"),
  // Programação de próximo contato
  proxContato: date("proxContato"),
  proxContatoTipo: varchar("proxContatoTipo", { length: 80 }),
  // Status de oportunidade
  statusAtendimentoNew: int("statusAtendimentoNew"), // FK fase_venda.codFase
  motivoPerda: varchar("motivoPerda", { length: 200 }),
  dataPerdido: timestamp("dataPerdido"),
  // Serviço contratado (quando venda concretizada)
  servicoNome: varchar("servicoNome", { length: 200 }),
  valorFechado: decimal("valorFechado", { precision: 12, scale: 2 }),
  // Flags
  semResposta: boolean("semResposta").default(false).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  vendaCelebradaEm: timestamp("venda_celebrada_em"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Atendimento = typeof atendimentos.$inferSelect;
export type InsertAtendimento = typeof atendimentos.$inferInsert;

// ─── Scripts de Atendimento ──────────────────────────────────────────────────
export const scripts = mysqlTable("scripts", {
  id: int("id").autoincrement().primaryKey(),
  categoriaScript: varchar("categoriaScript", { length: 100 }).notNull(),
  script: text("script").notNull(),
  observacoes: text("observacoes"),
  itemQualificacaoId: varchar("itemQualificacaoId", { length: 30 }),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Script = typeof scripts.$inferSelect;
export type InsertScript = typeof scripts.$inferInsert;

export const scriptsUso = mysqlTable("scripts_uso", {
  id: int("id").autoincrement().primaryKey(),
  scriptId: int("scriptId").notNull(),
  userId: int("userId").notNull(),
  usadoEm: timestamp("usadoEm").defaultNow().notNull(),
});
export type ScriptUso = typeof scriptsUso.$inferSelect;

// ─── Tarefas do Dia ──────────────────────────────────────────────────────────
export const tarefasDia = mysqlTable("tarefas_dia", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tipo: mysqlEnum("tipo", [
    "contato_programado", "contato_atrasado",
    "aniversario", "retorno_cliente",
  ]).notNull(),
  referenciaId: int("referenciaId"),
  titulo: varchar("titulo", { length: 300 }).notNull(),
  data: date("data").notNull(),
  feita: boolean("feita").default(false).notNull(),
  feitaEm: timestamp("feitaEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TarefaDia = typeof tarefasDia.$inferSelect;
export type InsertTarefaDia = typeof tarefasDia.$inferInsert;

// ─── Inbox WhatsApp ──────────────────────────────────────────────────────────
export const inboxConversas = mysqlTable("inbox_conversas", {
  id: int("id").autoincrement().primaryKey(),
  telefone: varchar("telefone", { length: 30 }).notNull(),
  nomeContato: varchar("nomeContato", { length: 200 }),
  fotoUrl: text("fotoUrl"),
  clienteId: int("clienteId"),
  unidadeId: int("unidadeId"), // FK unidades.id
  status: mysqlEnum("status", ["aberta", "aguardando", "respondida", "encerrada"]).default("aberta").notNull(),
  ultimaMensagemEm: timestamp("ultimaMensagemEm").defaultNow().notNull(),
  ultimaMensagemTexto: text("ultimaMensagemTexto"),
  naoLidas: int("naoLidas").default(0).notNull(),
  etiquetas: text("etiquetas"),
  resumoConversa: text("resumo_conversa"),
  resumoAtualizadoEm: timestamp("resumo_atualizado_em"),
  totalMensagensProcessadas: int("total_mensagens_processadas").default(0),
  msgsSinceAnalise: int("msgs_since_analise").default(0).notNull(),
  ctwaClid: varchar("ctwa_clid", { length: 500 }),
  adSourceId: varchar("ad_source_id", { length: 100 }),
  adSourceUrl: text("ad_source_url"),
  adTitulo: varchar("ad_titulo", { length: 300 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InboxConversa = typeof inboxConversas.$inferSelect;
export type InsertInboxConversa = typeof inboxConversas.$inferInsert;

export const inboxMensagens = mysqlTable("inbox_mensagens", {
  id: int("id").autoincrement().primaryKey(),
  conversaId: int("conversaId").notNull(),
  direcao: mysqlEnum("direcao", ["recebida", "enviada"]).notNull(),
  tipo: mysqlEnum("tipo", ["texto", "audio", "imagem", "documento", "sistema", "misto"]).default("texto").notNull(),
  conteudo: text("conteudo"),
  metadados: text("metadados"),
  lida: boolean("lida").default(false).notNull(),
  enviadaPorUserId: int("enviadaPorUserId"),
  enviadaPorIa: boolean("enviadaPorIa").default(false).notNull(),
  sugestaoIa: text("sugestaoIa"),
  replyToId: int("replyToId"),
  replyToTexto: text("replyToTexto"),
  transcricao: text("transcricao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type InboxMensagem = typeof inboxMensagens.$inferSelect;
export type InsertInboxMensagem = typeof inboxMensagens.$inferInsert;

// ─── Alertas de Qualificação ────────────────────────────────────────────────
export const alertasQualificacao = mysqlTable("alertas_qualificacao", {
  id: int("id").autoincrement().primaryKey(),
  clienteId: int("clienteId").notNull(),
  atendimentoId: int("atendimentoId"),
  conversaId: int("conversaId").notNull(),
  consultorId: int("consultorId").notNull(),
  gestorId: int("gestorId"),
  tipo: mysqlEnum("tipo", ["solicitacao_previa", "deteccao_ia", "edicao_manual"]).notNull(),
  campos: text("campos"),
  justificativa: text("justificativa"),
  status: mysqlEnum("status", ["pendente", "aprovada", "invalida"]).default("pendente").notNull(),
  resolvidoPor: int("resolvidoPor"),
  resolvidoEm: timestamp("resolvidoEm"),
  ultimoLembreteEm: timestamp("ultimoLembreteEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type AlertaQualificacao = typeof alertasQualificacao.$inferSelect;

// ─── Audit Log ──────────────────────────────────────────────────────────────
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  userNome: varchar("userNome", { length: 100 }),
  userRole: varchar("userRole", { length: 20 }),
  procedure: varchar("procedure", { length: 150 }).notNull(),
  origem: mysqlEnum("origem", ["manual", "ia", "sistema"]).notNull().default("manual"),
  clienteId: int("clienteId"),
  inputResumo: text("inputResumo"),
  sucesso: boolean("sucesso").notNull().default(true),
  erroMsg: text("erroMsg"),
  duracaoMs: int("duracaoMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userCreatedIdx: index("audit_log_user_created_idx").on(table.userId, table.createdAt),
}));
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type InsertAuditLogEntry = typeof auditLog.$inferInsert;

// ─── Leads (Buddha Spa — envio ao Belle) ─────────────────────────────────────
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

// ─── Metas financeiras por unidade ───────────────────────────────────────────
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

// ─── Lâminas de divulgação ───────────────────────────────────────────────────
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

// ─── Log de sincronização com Belle ──────────────────────────────────────────
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

// ─── Conversas do Copilot ────────────────────────────────────────────────────
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
