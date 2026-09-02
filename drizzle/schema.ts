import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, decimal, datetime, index, bigint, boolean, uniqueIndex } from "drizzle-orm/mysql-core";

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
  // Controle de acesso por módulo (2026-08-10, ver permissoesModulo
  // abaixo) — false (padrão) mantém o comportamento de sempre: usuário
  // "user" vê todos os módulos, só "admin" muda algo. true significa
  // que essa conta está restrita EXATAMENTE aos módulos presentes em
  // permissoesModulo (pode ser zero — bloqueado por completo, sem
  // precisar excluir a conta). admin nunca é afetado por isso.
  permissoesCustomizadas: boolean("permissoesCustomizadas").default(false).notNull(),
  // Mesma ideia de permissoesCustomizadas, mas pro eixo "quais
  // unidades essa conta vê" — eixo independente do módulo/sub-seção
  // acima (ex.: sócia com acesso total a módulos, mas só nas 2
  // unidades; recepção de 1 unidade só, mas sem restrição de módulo).
  // false (padrão) = vê todas as unidades, igual sempre foi.
  unidadesCustomizadas: boolean("unidadesCustomizadas").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Módulos liberados pra uma conta com permissoesCustomizadas=true (ver
 * users acima). `modulo` é uma das chaves de shared/modulos.ts — não é
 * FK porque a lista é um enum fechado definido em código, não uma
 * tabela. Sem constraint de unicidade composta (userId+modulo): o
 * server sempre reescreve o conjunto inteiro (delete+insert) ao salvar,
 * então duplicata não é um risco real — mesmo padrão já usado noutras
 * tabelas deste projeto (uniqueness verificada em código).
 */
export const permissoesModulo = mysqlTable("permissoes_modulo", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  modulo: varchar("modulo", { length: 40 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("permissoes_modulo_user_idx").on(table.userId),
}));

/**
 * Um nível abaixo de permissoesModulo — restringe uma conta a
 * sub-seções específicas dentro de um módulo que tem mais de uma tela
 * (hoje só Financeiro, ver shared/subsecoes.ts). Presença de QUALQUER
 * linha aqui pra um módulo já concedido em permissoesModulo restringe
 * essa conta às sub-seções listadas; ausência de linhas pro módulo =
 * acesso a todas as sub-seções dele (mesmo comportamento "não
 * configurado = livre" de permissoesModulo, um nível abaixo).
 */
export const permissoesSubsecao = mysqlTable("permissoes_subsecao", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  subsecao: varchar("subsecao", { length: 60 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("permissoes_subsecao_user_idx").on(table.userId),
}));

export type PermissaoModulo = typeof permissoesModulo.$inferSelect;
export type InsertPermissaoModulo = typeof permissoesModulo.$inferInsert;

/**
 * Unidades liberadas pra uma conta com unidadesCustomizadas=true (ver
 * users acima) — mesmo molde de permissoesModulo, um nível ortogonal
 * (não aninhado): não depende de permissoesCustomizadas/módulo estar
 * ligado. `unidadeId` é FK "solta" (sem constraint) pro id real de
 * `unidades`, mesmo padrão de fk-sem-constraint já usado no projeto.
 */
export const permissoesUnidade = mysqlTable("permissoes_unidade", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  unidadeId: int("unidadeId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdx: index("permissoes_unidade_user_idx").on(table.userId),
}));

export type PermissaoUnidade = typeof permissoesUnidade.$inferSelect;
export type InsertPermissaoUnidade = typeof permissoesUnidade.$inferInsert;

/**
 * Unidades do Buddha Spa — Shopping Santa Úrsula e Ribeirão Shopping.
 * codEstab é o código usado pela API do Belle Software.
 */
export const unidades = mysqlTable("unidades", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 128 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  // Nullable pra unidade sintética do Buddha Mkt (2026-08-14) — não
  // tem estabelecimento no Belle, não é uma unidade física.
  codEstab: int("codEstab"),
  // "buddha_mkt" = a unidade sintética do número oficial de marketing
  // (WhatsApp Cloud API) — não tem credencial Z-API própria, quem
  // resolve o canal de envio é server/fluxos.ts (enviarPelaUnidade)
  // olhando esse campo. Ver getOrCreateUnidadeBuddhaMkt em db.ts.
  canal: mysqlEnum("canal", ["zapi", "buddha_mkt"]).default("zapi").notNull(),
  belleToken: text("belleToken"),
  // Liga/desliga as chamadas à API do Belle sem apagar o token — usado
  // enquanto a unidade não tem acesso liberado pelo Belle Software, pra
  // parar de tentar (e falhar) chamadas que nunca vão funcionar mesmo.
  belleAtivo: boolean("belleAtivo").default(true).notNull(),
  zapiInstanceId: text("zapiInstanceId"),
  zapiToken: text("zapiToken"),
  zapiClientToken: text("zapiClientToken"),
  // Banco Inter — credenciais OAuth e token em cache. A API do Inter
  // exige mTLS em toda chamada (inclusive a troca de token), não só
  // client_id/secret — por isso o certificado e a chave privada
  // (conteúdo PEM, texto) ficam guardados aqui também.
  interClientId: text("interClientId"),
  interClientSecret: text("interClientSecret"),
  interCertificado: text("interCertificado"), // .crt em PEM
  interChavePrivada: text("interChavePrivada"), // .key em PEM
  interContaCorrente: varchar("interContaCorrente", { length: 20 }),
  interAccessToken: text("interAccessToken"),
  interTokenExpiresAt: bigint("interTokenExpiresAt", { mode: "number" }),
  // Mercado Pago — só precisa do Access Token (self-service, sem mTLS).
  mpAccessToken: text("mpAccessToken"),
  // Endpoint público e assinatura secreta do Webhook do Mercado Pago.
  // São dados por unidade porque cada conta pode estar vinculada a uma
  // integração diferente. Nunca retornam a usuários não administradores.
  mpWebhookUrl: text("mpWebhookUrl"),
  mpWebhookSecret: text("mpWebhookSecret"),
  // Sicredi — mesmo modelo do Inter (OAuth2 client_credentials + mTLS
  // obrigatório em toda chamada). Cooperativa/agência/conta identificam
  // a conta corrente (o Sicredi não usa um único "número de conta" como
  // o Inter, é cooperativa+agência+conta).
  sicrediClientId: text("sicrediClientId"),
  sicrediClientSecret: text("sicrediClientSecret"),
  sicrediCertificado: text("sicrediCertificado"), // .crt em PEM
  sicrediChavePrivada: text("sicrediChavePrivada"), // .key em PEM
  sicrediCooperativa: varchar("sicrediCooperativa", { length: 20 }),
  sicrediAgencia: varchar("sicrediAgencia", { length: 20 }),
  sicrediConta: varchar("sicrediConta", { length: 20 }),
  sicrediAccessToken: text("sicrediAccessToken"),
  sicrediTokenExpiresAt: bigint("sicrediTokenExpiresAt", { mode: "number" }),
  corTema: varchar("corTema", { length: 32 }),
  ativa: mysqlEnum("ativa", ["true", "false"]).default("true").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Unidade = typeof unidades.$inferSelect;
export type InsertUnidade = typeof unidades.$inferInsert;

/**
 * Cobrança criada no Inbox para um cliente específico. O Link (preferência)
 * nunca é compartilhado por conversas diferentes: `chaveAberta` é única
 * enquanto a cobrança está aberta e vira null após encerramento.
 */
export const cobrancasLink = mysqlTable("cobrancas_link", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  conversaId: int("conversaId").notNull(),
  clienteId: int("clienteId"),
  clienteNome: varchar("clienteNome", { length: 200 }).notNull(),
  responsavelUserId: int("responsavelUserId").notNull(),
  responsavelAtendenteId: int("responsavelAtendenteId"),
  titulo: varchar("titulo", { length: 200 }).notNull(),
  descricao: text("descricao"),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  formaPagamentoInformada: varchar("formaPagamentoInformada", { length: 80 }),
  // Máximo de parcelas oferecido no checkout deste Link — ver
  // montarCorpoPreferenciaPagamento (server/mercadoPagoApi.ts).
  parcelas: int("parcelas").default(1).notNull(),
  status: mysqlEnum("status", ["rascunho", "criada", "enviada", "pendente", "aprovada", "rejeitada", "cancelada", "expirada", "erro"]).default("rascunho").notNull(),
  preferenceId: varchar("preferenceId", { length: 160 }),
  initPoint: text("initPoint"),
  externalReference: varchar("externalReference", { length: 160 }).notNull(),
  chaveAberta: varchar("chaveAberta", { length: 100 }).unique(),
  paymentId: varchar("paymentId", { length: 80 }),
  paymentStatus: varchar("paymentStatus", { length: 80 }),
  paymentStatusDetail: varchar("paymentStatusDetail", { length: 160 }),
  pagadorNome: varchar("pagadorNome", { length: 200 }),
  pagadorEmail: varchar("pagadorEmail", { length: 320 }),
  paymentApprovedAt: timestamp("paymentApprovedAt"),
  criadaEm: timestamp("criadaEm"),
  enviadaEm: timestamp("enviadaEm"),
  ultimoWebhookEm: timestamp("ultimoWebhookEm"),
  ultimoWebhookAcao: varchar("ultimoWebhookAcao", { length: 100 }),
  webhookAssinaturaValida: boolean("webhookAssinaturaValida").default(false).notNull(),
  alertaCriadoEm: timestamp("alertaCriadoEm"),
  alertaReconhecidoEm: timestamp("alertaReconhecidoEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadeStatusIdx: index("cobrancas_link_unidade_status_idx").on(table.unidadeId, table.status),
  conversaIdx: index("cobrancas_link_conversa_idx").on(table.conversaId),
  paymentIdx: index("cobrancas_link_payment_idx").on(table.paymentId),
  referenceIdx: uniqueIndex("cobrancas_link_external_reference_idx").on(table.externalReference),
}));

export type CobrancaLink = typeof cobrancasLink.$inferSelect;
export type InsertCobrancaLink = typeof cobrancasLink.$inferInsert;

/**
 * Último resultado exibido na Confirmação de Pagamento, por unidade e fonte.
 * Não substitui extratos ou cobranças: evita a tela vazia entre uma consulta
 * pontual e outra, mantendo apenas o snapshot operacional mais recente.
 */
export const confirmacaoPagamentosConsultas = mysqlTable("confirmacao_pagamentos_consultas", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  fonte: mysqlEnum("fonte", ["pix_inter", "links_mercado_pago"]).notNull(),
  consultaEm: timestamp("consultaEm").notNull(),
  dataInicio: varchar("dataInicio", { length: 10 }).notNull(),
  dataFim: varchar("dataFim", { length: 10 }).notNull(),
  totalConsultado: int("totalConsultado").notNull(),
  novasVendas: int("novasVendas"),
  pagamentos: json("pagamentos").$type<unknown>().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadeFonteUnica: uniqueIndex("confirmacao_pagamentos_consultas_unidade_fonte_idx").on(table.unidadeId, table.fonte),
}));

export type ConfirmacaoPagamentoConsulta = typeof confirmacaoPagamentosConsultas.$inferSelect;

/** Modelos por unidade para preencher rapidamente a cobrança, nunca Links reutilizados. */
export const cobrancasLinkModelos = mysqlTable("cobrancas_link_modelos", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  titulo: varchar("titulo", { length: 200 }).notNull(),
  descricao: text("descricao"),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  formaPagamentoInformada: varchar("formaPagamentoInformada", { length: 80 }),
  parcelas: int("parcelas").default(1).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  ordem: int("ordem").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadeAtivoOrdemIdx: index("cobrancas_link_modelos_unidade_ativo_ordem_idx").on(table.unidadeId, table.ativo, table.ordem),
}));

export type CobrancaLinkModelo = typeof cobrancasLinkModelos.$inferSelect;
export type InsertCobrancaLinkModelo = typeof cobrancasLinkModelos.$inferInsert;

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
 * Log de auditoria — toda mutation autenticada (protectedProcedure/
 * adminProcedure), gravada por um middleware genérico em
 * server/_core/trpc.ts, sem precisar instrumentar cada procedure. Trazido
 * do mobai-crm (2026-08-08) e adaptado: sem `clienteId`/`origem` ia — não
 * cruza com a tabela `clientes` (mesmo ela existindo) nem distingue
 * mutation de IA, já que este app não tem esse tipo de ação.
 */
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  userNome: varchar("userNome", { length: 100 }),
  userRole: varchar("userRole", { length: 20 }),
  // Quem realmente agiu, distinto de userId/userNome acima (a conta
  // Google/Manus logada na máquina) — ver atendentes abaixo. Null pra
  // toda mutation registrada antes dessa coluna existir, ou fora do
  // gate (login ainda não passou pelo seletor de atendente).
  atendenteId: int("atendenteId"),
  atendenteNome: varchar("atendenteNome", { length: 100 }),
  procedure: varchar("procedure", { length: 150 }).notNull(),
  inputResumo: text("inputResumo"),
  sucesso: boolean("sucesso").notNull().default(true),
  erroMsg: text("erroMsg"),
  duracaoMs: int("duracaoMs"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userCreatedIdx: index("audit_log_user_created_idx").on(table.userId, table.createdAt),
  atendenteCreatedIdx: index("audit_log_atendente_created_idx").on(table.atendenteId, table.createdAt),
}));

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type InsertAuditLogEntry = typeof auditLog.$inferInsert;

/**
 * Tabela TEMPORÁRIA de debug (2026-08-15) — investigação em andamento
 * sobre @lid não resolvido no webhook Z-API. Log de arquivo não se
 * mostrou confiável (dev vs produção); grava direto no banco, que já
 * provou ser consultável via SQL pelo Manus. Remover (DROP TABLE)
 * depois de capturar um payload real e decidir o próximo passo.
 */
export const webhookDebugLog = mysqlTable("webhook_debug_log", {
  id: int("id").autoincrement().primaryKey(),
  origem: varchar("origem", { length: 50 }).notNull(),
  payloadBruto: text("payloadBruto").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WebhookDebugLog = typeof webhookDebugLog.$inferSelect;
export type InsertWebhookDebugLog = typeof webhookDebugLog.$inferInsert;

/**
 * Atendente = pessoa física da recepção, distinta da conta Google/Manus
 * usada pra logar no computador compartilhado (2026-08-10). Um PIN de
 * 4 dígitos identifica quem está atendendo, sem precisar de conta
 * Google individual — ver server/atendenteAuth.ts (hash do PIN) e
 * atendenteSessoes abaixo (sessão própria, cookie separado do login).
 * Escopado por unidade porque a equipe de recepção é uma por unidade.
 */
export const atendentes = mysqlTable("atendentes", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  nome: varchar("nome", { length: 100 }).notNull(),
  pinHash: varchar("pinHash", { length: 255 }).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadeIdx: index("atendentes_unidade_idx").on(table.unidadeId),
}));

export type Atendente = typeof atendentes.$inferSelect;
export type InsertAtendente = typeof atendentes.$inferInsert;

/** Cadastro dos profissionais (massagistas/terapeutas) de cada unidade — hoje só referência (nome/contato), sem login. */
export const terapeutas = mysqlTable("terapeutas", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  nomeCompleto: varchar("nomeCompleto", { length: 200 }).notNull(),
  nomeAbreviado: varchar("nomeAbreviado", { length: 100 }).notNull(),
  celular: varchar("celular", { length: 20 }),
  whatsappParticipanteId: varchar("whatsappParticipanteId", { length: 100 }),
  cpf: varchar("cpf", { length: 14 }),
  vinculo: mysqlEnum("vinculo", ["fixo", "freelancer"]).default("fixo").notNull(),
  // Símbolo por nível (só na exibição, ver TerapeutasSection.tsx): 💎
  // diamante, 🥇 ouro, 🥈 prata, 🥉 bronze — compacto o bastante pra
  // não poluir relatório/lista.
  nivel: mysqlEnum("nivel", ["diamante", "ouro", "prata", "bronze"]).default("bronze").notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadeIdx: index("terapeutas_unidade_idx").on(table.unidadeId),
  // Único quando preenchido — MySQL/TiDB não conta NULL como duplicata
  // em índice único, então vários terapeutas sem CPF cadastrado convivem bem.
  cpfIdx: uniqueIndex("terapeutas_cpf_idx").on(table.cpf),
}));

export type Terapeuta = typeof terapeutas.$inferSelect;
export type InsertTerapeuta = typeof terapeutas.$inferInsert;

/** Relação operacional entre terapeuta e terapia liberada, isolada por unidade. */
export const terapeutasLiberacoes = mysqlTable("terapeutas_liberacoes", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  terapeutaId: int("terapeutaId").notNull(),
  servicoCodigo: int("servicoCodigo").notNull(),
  servicoNome: varchar("servicoNome", { length: 250 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadeTerapeutaServicoUnico: uniqueIndex("terapeutas_liberacoes_unidade_terapeuta_servico_idx").on(table.unidadeId, table.terapeutaId, table.servicoCodigo),
  unidadeTerapeutaIdx: index("terapeutas_liberacoes_unidade_terapeuta_idx").on(table.unidadeId, table.terapeutaId),
}));

export type TerapeutaLiberacao = typeof terapeutasLiberacoes.$inferSelect;
export type InsertTerapeutaLiberacao = typeof terapeutasLiberacoes.$inferInsert;

/**
 * Sessão do atendente após validar o PIN — token opaco (não é o JWT do
 * login, cookie separado), com expiração curta (um turno). DB-backed
 * em vez de assinado: permite invalidar na hora (ex: trocar de
 * atendente) sem precisar de blocklist de token.
 */
export const atendenteSessoes = mysqlTable("atendente_sessoes", {
  id: int("id").autoincrement().primaryKey(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  atendenteId: int("atendenteId").notNull(),
  expiraEm: timestamp("expiraEm").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  tokenIdx: index("atendente_sessoes_token_idx").on(table.token),
}));

export type AtendenteSessao = typeof atendenteSessoes.$inferSelect;
export type InsertAtendenteSessao = typeof atendenteSessoes.$inferInsert;

/**
 * Base local de clientes do Belle — passou a existir porque o acesso via
 * API foi negado (franqueador precisa autorizar, 2026-08-08). Alimentada
 * por importação manual da planilha "[Buddha] Clientes" que cada unidade
 * já exporta de lá (ver server/clientesXlsxParser.ts). `belleId` é o "ID"
 * da planilha — estável, único, usado pra casar reimportações (upsert)
 * sem duplicar. `clienteSsu`/`clienteRbs`: um cliente pode atender nas
 * duas unidades, então cada import (de uma unidade por vez) liga a flag
 * correspondente sem desligar a outra que já estivesse true. CPF não é
 * unique — a própria planilha já tem CPFs duplicados (recadastros no
 * Belle), preservados aqui de propósito.
 *
 * mobai-crm mora num banco separado (confirmado 2026-08-08) — a suspeita
 * anterior de colisão de nome de tabela era equivocada; o `clientes_belle`
 * temporário foi revertido de volta pra `clientes`.
 */
export const clientes = mysqlTable("clientes", {
  id: int("id").autoincrement().primaryKey(),
  belleId: bigint("belleId", { mode: "number" }).notNull().unique(),
  nome: varchar("nome", { length: 200 }).notNull(),
  rg: varchar("rg", { length: 30 }),
  cpf: varchar("cpf", { length: 20 }),
  dataNascimento: varchar("dataNascimento", { length: 10 }), // AAAA-MM-DD
  sexo: mysqlEnum("sexo", ["Feminino", "Masculino", "Outros"]),
  endereco: varchar("endereco", { length: 300 }),
  bairro: varchar("bairro", { length: 120 }),
  cidade: varchar("cidade", { length: 120 }),
  uf: varchar("uf", { length: 2 }),
  telefone: varchar("telefone", { length: 30 }),
  celular: varchar("celular", { length: 30 }),
  celular2: varchar("celular2", { length: 30 }),
  email: varchar("email", { length: 200 }),
  dataCadastro: varchar("dataCadastro", { length: 10 }), // AAAA-MM-DD
  primeiroAtendimento: varchar("primeiroAtendimento", { length: 10 }), // AAAA-MM-DD
  ultimoAtendimento: varchar("ultimoAtendimento", { length: 10 }), // AAAA-MM-DD
  qtdAtendimentosFinalizados: int("qtdAtendimentosFinalizados").default(0).notNull(),
  qtdServicosFinalizados: int("qtdServicosFinalizados").default(0).notNull(),
  clienteSsu: boolean("clienteSsu").default(false).notNull(),
  clienteRbs: boolean("clienteRbs").default(false).notNull(),
  // "lead": criado manualmente pelo Inbox (botões de cliente rápido),
  // ainda sem belleId real — usa um sintético negativo (nunca colide,
  // Belle não usa negativo). "cliente": veio de fato da planilha do
  // Belle. Ao reimportar, se o telefone de um "lead" bater com uma
  // linha da planilha, esse MESMO registro é promovido pra "cliente"
  // (belleId trocado pelo real) em vez de duplicar — ver
  // upsertClientesImportados.
  tipoCliente: mysqlEnum("tipoCliente", ["lead", "cliente"]).default("cliente").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  cpfIdx: index("clientes_cpf_idx").on(table.cpf),
  nomeIdx: index("clientes_nome_idx").on(table.nome),
}));

export type Cliente = typeof clientes.$inferSelect;
export type InsertCliente = typeof clientes.$inferInsert;

/** Preferência de terapeuta por cliente e unidade. O nome é mantido junto
 * ao ID para preservar o histórico do cliente se o cadastro mudar depois. */
export const clientesPreferenciasTerapeuta = mysqlTable("clientes_preferencias_terapeuta", {
  id: int("id").autoincrement().primaryKey(),
  clienteId: int("clienteId").notNull(),
  unidadeId: int("unidadeId").notNull(),
  terapeutaId: int("terapeutaId"),
  terapeutaNome: varchar("terapeutaNome", { length: 200 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  clienteUnidadeUnico: uniqueIndex("clientes_pref_terapeuta_cliente_unidade_idx").on(table.clienteId, table.unidadeId),
  unidadeIdx: index("clientes_pref_terapeuta_unidade_idx").on(table.unidadeId),
}));
export type ClientePreferenciaTerapeuta = typeof clientesPreferenciasTerapeuta.$inferSelect;
export type InsertClientePreferenciaTerapeuta = typeof clientesPreferenciasTerapeuta.$inferInsert;

/** Opções operacionais que podem ser alteradas pelo administrador sem
 * mexer no formulário do chamado. */
export const chamadosParametros = mysqlTable("chamados_parametros", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  tipo: mysqlEnum("tipo", ["aguardando", "sala", "taa"]).notNull(),
  nome: varchar("nome", { length: 200 }).notNull(),
  descricao: varchar("descricao", { length: 300 }),
  ordem: int("ordem").default(0).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadeTipoOrdemIdx: index("chamados_parametros_unidade_tipo_ordem_idx").on(table.unidadeId, table.tipo, table.ordem),
}));
export type ChamadoParametro = typeof chamadosParametros.$inferSelect;
export type InsertChamadoParametro = typeof chamadosParametros.$inferInsert;

/**
 * Ajustes operacionais da recepção para a visão de próximos atendimentos.
 * Não substitui a agenda oficial do Belle: apenas define a organização local
 * de terapeuta/sala e permite ocultar uma linha depois do chamado.
 */
export const atendimentosOperacional = mysqlTable("atendimentos_operacional", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  atendimentoBelleId: int("atendimentoBelleId").notNull(),
  terapeutaId: int("terapeutaId"),
  terapeutaNome: varchar("terapeutaNome", { length: 100 }),
  sala: varchar("sala", { length: 200 }),
  preferencial: boolean("preferencial").notNull().default(false),
  chamadoEm: timestamp("chamadoEm"),
  inicioEm: timestamp("inicioEm"),
  fimEm: timestamp("fimEm"),
  comandaAba: varchar("comandaAba", { length: 40 }),
  comandaLinha: int("comandaLinha"),
  comandaPreenchidaEm: timestamp("comandaPreenchidaEm"),
  removidoEm: timestamp("removidoEm"),
  removidoPorUserId: int("removidoPorUserId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadeAtendimentoUnico: uniqueIndex("atendimentos_operacional_unidade_atendimento_idx").on(table.unidadeId, table.atendimentoBelleId),
  unidadeRemovidoIdx: index("atendimentos_operacional_unidade_removido_idx").on(table.unidadeId, table.removidoEm),
}));
export type AtendimentoOperacional = typeof atendimentosOperacional.$inferSelect;

/**
 * Espelho local de atendimentos exportados do Belle. Diferente de
 * `atendimentos`, que registra a atuação comercial interna, esta tabela
 * preserva a agenda/histórico operacional da unidade para consulta do perfil
 * e contexto dos agentes. A chave externa é estável por unidade, permitindo
 * reimportar um relatório sem duplicar sessões.
 */
export const belleAtendimentos = mysqlTable("belle_atendimentos", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  atendimentoBelleId: bigint("atendimentoBelleId", { mode: "number" }).notNull(),
  clienteId: int("clienteId"),
  clienteNome: varchar("clienteNome", { length: 200 }).notNull(),
  telefone: varchar("telefone", { length: 30 }),
  dataAtendimento: varchar("dataAtendimento", { length: 10 }).notNull(),
  horario: varchar("horario", { length: 8 }),
  servicoCodigo: int("servicoCodigo"),
  servicoNome: varchar("servicoNome", { length: 250 }),
  duracaoMinutos: int("duracaoMinutos"),
  profissionalNome: varchar("profissionalNome", { length: 200 }),
  temPreferencia: boolean("temPreferencia").default(false).notNull(),
  planoBelleId: bigint("planoBelleId", { mode: "number" }),
  areaAplicacao: text("areaAplicacao"),
  tipo: varchar("tipo", { length: 80 }),
  status: varchar("status", { length: 80 }).notNull(),
  importadoEm: timestamp("importadoEm").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadeAtendimentoUnico: uniqueIndex("belle_atendimentos_unidade_externo_idx").on(table.unidadeId, table.atendimentoBelleId),
  unidadeClienteDataIdx: index("belle_atendimentos_unidade_cliente_data_idx").on(table.unidadeId, table.clienteId, table.dataAtendimento),
  unidadeDataIdx: index("belle_atendimentos_unidade_data_idx").on(table.unidadeId, table.dataAtendimento),
}));

export type BelleAtendimento = typeof belleAtendimentos.$inferSelect;
export type InsertBelleAtendimento = typeof belleAtendimentos.$inferInsert;

/**
 * Relatório "Registros Financeiros" do Belle (import manual, .xlsx) —
 * um lançamento por transação (Cód. único), usado só pra conciliação
 * financeira Comanda x Belle (Conciliação PDV, Fase 2). dataVencimento
 * vem da coluna "Vcto." — o dia que o dinheiro de fato entrou, não a
 * data do atendimento nem "Lcto." (data de lançamento/digitação, que
 * diverge do vencimento sempre que a venda precisa ser reaberta pra
 * correção dias depois — confirmado pelo usuário 2026-08-29 comparando
 * contra o "vencimentos" do Belle). Agendamento não garante pagamento
 * no dia (pendente, antecipado, plano/voucher sem atendimento
 * vinculado), então a conciliação é só por dia+forma de pagamento,
 * nunca por atendimento individual.
 */
export const belleRegistrosFinanceiros = mysqlTable("belle_registros_financeiros", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  codigo: bigint("codigo", { mode: "number" }).notNull(),
  dataVencimento: varchar("dataVencimento", { length: 10 }).notNull(),
  clienteNome: varchar("clienteNome", { length: 200 }),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  // true quando "Recebido" veio zerado no relatório do Belle pra essa
  // parcela — o valor somado é o "Valor" contratado (tem Vcto real),
  // mas o Belle ainda não confirmou o recebimento no momento da
  // exportação (comum em cartão ainda não liquidado). Só pra avisar na
  // tela (2026-09-01), não muda a soma do dia.
  pendenteConfirmacao: boolean("pendenteConfirmacao").default(false).notNull(),
  formaPagamento: varchar("formaPagamento", { length: 40 }).notNull(),
  // Extraído de "Agendamento #NNNNN" na Observação quando existe — não
  // usado na conciliação por dia (ver comentário acima), guardado só
  // como referência bruta pra investigação manual pontual.
  atendimentoBelleId: bigint("atendimentoBelleId", { mode: "number" }),
  observacao: varchar("observacao", { length: 300 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  unidadeCodigoUnico: uniqueIndex("belle_registros_financeiros_unidade_codigo_idx").on(table.unidadeId, table.codigo),
  unidadeDataIdx: index("belle_registros_financeiros_unidade_data_idx").on(table.unidadeId, table.dataVencimento),
}));

export type BelleRegistroFinanceiro = typeof belleRegistrosFinanceiros.$inferSelect;
export type InsertBelleRegistroFinanceiro = typeof belleRegistrosFinanceiros.$inferInsert;

/** Cabeçalho de cada plano exportado pelo Belle, isolado por unidade. */
export const bellePlanosClientes = mysqlTable("belle_planos_clientes", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  planoBelleId: bigint("planoBelleId", { mode: "number" }).notNull(),
  clienteId: int("clienteId"),
  clienteBelleId: bigint("clienteBelleId", { mode: "number" }),
  vinculoOrigem: mysqlEnum("vinculoOrigem", ["nome", "id_belle", "manual"]),
  vinculadoEm: timestamp("vinculadoEm"),
  clienteNome: varchar("clienteNome", { length: 200 }).notNull(),
  pagadorNome: varchar("pagadorNome", { length: 200 }),
  status: varchar("status", { length: 80 }).notNull(),
  dataVenda: varchar("dataVenda", { length: 10 }),
  validade: varchar("validade", { length: 10 }),
  valor: decimal("valor", { precision: 12, scale: 2 }),
  desconto: decimal("desconto", { precision: 12, scale: 2 }),
  valorFinal: decimal("valorFinal", { precision: 12, scale: 2 }),
  tipo: varchar("tipo", { length: 100 }),
  origem: varchar("origem", { length: 120 }),
  campanha: varchar("campanha", { length: 200 }),
  vendedorNome: varchar("vendedorNome", { length: 200 }),
  importadoEm: timestamp("importadoEm").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadePlanoUnico: uniqueIndex("belle_planos_clientes_unidade_externo_idx").on(table.unidadeId, table.planoBelleId),
  unidadeClienteValidadeIdx: index("belle_planos_clientes_unidade_cliente_validade_idx").on(table.unidadeId, table.clienteId, table.validade),
  unidadeClienteBelleIdx: index("belle_planos_clientes_unidade_cliente_belle_idx").on(table.unidadeId, table.clienteBelleId),
}));

export type BellePlanoCliente = typeof bellePlanosClientes.$inferSelect;
export type InsertBellePlanoCliente = typeof bellePlanosClientes.$inferInsert;

/** Sessões e saldo por serviço dentro de cada plano espelhado. */
export const bellePlanosServicos = mysqlTable("belle_planos_servicos", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  planoBelleId: bigint("planoBelleId", { mode: "number" }).notNull(),
  servicoCodigo: int("servicoCodigo").notNull(),
  servicoNome: varchar("servicoNome", { length: 250 }).notNull(),
  sessoes: int("sessoes").default(0).notNull(),
  restantes: int("restantes").default(0).notNull(),
  agendados: int("agendados").default(0).notNull(),
  importadoEm: timestamp("importadoEm").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadePlanoServicoUnico: uniqueIndex("belle_planos_servicos_unidade_plano_servico_idx").on(table.unidadeId, table.planoBelleId, table.servicoCodigo),
  unidadePlanoIdx: index("belle_planos_servicos_unidade_plano_idx").on(table.unidadeId, table.planoBelleId),
}));

export type BellePlanoServico = typeof bellePlanosServicos.$inferSelect;
export type InsertBellePlanoServico = typeof bellePlanosServicos.$inferInsert;

/**
 * Índice de telefones em forma canônica (55+DDD+9+número, ver
 * shared/telefone.ts:telefoneCanonico) — um cliente pode ter até 3
 * entradas (celular/celular2/telefone). Populado no write-time (import
 * do Belle e criação manual pelo Inbox), não por backfill em massa;
 * existe pra permitir lookup direto por igualdade em vez da cadeia de
 * REPLACE() em SQL usada em buscarClientesPorTelefone hoje — troca de
 * fato o caminho de leitura fica pra depois de um relatório de
 * auditoria (ver conversa 2026-08-15).
 */
export const clienteTelefones = mysqlTable("cliente_telefones", {
  id: int("id").autoincrement().primaryKey(),
  clienteId: int("clienteId").notNull(),
  numeroCanonico: varchar("numeroCanonico", { length: 20 }).notNull(),
  origem: mysqlEnum("origem", ["celular", "celular2", "telefone"]).notNull(),
}, (table) => ({
  clienteNumeroUnico: uniqueIndex("cliente_telefones_cliente_numero_idx").on(table.clienteId, table.numeroCanonico),
  numeroIdx: index("cliente_telefones_numero_idx").on(table.numeroCanonico),
}));

export type ClienteTelefone = typeof clienteTelefones.$inferSelect;
export type InsertClienteTelefone = typeof clienteTelefones.$inferInsert;

/**
 * Mapeamento proativo telefone→lid do WhatsApp (2026-08-15) — resolve
 * o problema de conversas @lid não identificadas (Belle manda
 * confirmação de agendamento, WhatsApp mascara o número real como
 * @lid). A conversão @lid→telefone não é suportada pela Z-API, mas o
 * caminho inverso (telefone→lid) é, via zapiApi.phoneExistsBatch —
 * como já se conhece o telefone de todo cliente cadastrado, resolve-se
 * o lid de cada um ANTES de qualquer mensagem chegar, e casa via
 * lookup reverso (lid→telefone) quando o webhook chegar mascarado. Por
 * unidade porque cada uma tem sua própria instância/conta Z-API.
 */
export const lidMapping = mysqlTable("lid_mapping", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  telefoneCanonico: varchar("telefoneCanonico", { length: 20 }).notNull(),
  lid: varchar("lid", { length: 64 }).notNull(),
  resolvedAt: timestamp("resolvedAt").defaultNow().notNull(),
}, (table) => ({
  unidadeTelefoneUnico: uniqueIndex("lid_mapping_unidade_telefone_idx").on(table.unidadeId, table.telefoneCanonico),
  lidIdx: index("lid_mapping_lid_idx").on(table.lid),
}));

export type LidMapping = typeof lidMapping.$inferSelect;
export type InsertLidMapping = typeof lidMapping.$inferInsert;

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

/**
 * Conversas de WhatsApp (Inbox). Dois canais: zapi (uma instância por
 * unidade) e buddha_mkt (API oficial WhatsApp Cloud, conta única para
 * as duas unidades — unidadeId fica null até ser resolvida via cliente
 * Belle).
 */
/**
 * Estrutura clonada da tabela homônima do mobai-crm (bancos são
 * separados — DATABASE_URL própria — mas o schema foi copiado por
 * pedido explícito de trazer o inbox de lá, ver
 * /mobai-crm/drizzle/schema.ts). `canal`/`chatLid`/`isLidPendente` são
 * as únicas colunas próprias do buddha-spa, adicionadas depois; o
 * resto (fotoUrl, clienteId, etiquetas, resumo_conversa, ad_*, etc.)
 * já veio pronto do clone e fica disponível pra uso futuro mesmo que
 * o buddha-spa ainda não escreva nesses campos.
 */
export const inboxConversas = mysqlTable("inbox_conversas", {
  id: int("id").autoincrement().primaryKey(),
  telefone: varchar("telefone", { length: 30 }).notNull(),
  // Distingue uma linha do buddha-spa (sempre preenchida) de uma
  // eventual linha nativa do mobai-crm/clone antigo sem canal.
  canal: mysqlEnum("canal", ["zapi", "buddha_mkt"]).notNull(),
  nomeContato: varchar("nomeContato", { length: 200 }),
  fotoUrl: text("fotoUrl"),
  clienteId: int("clienteId"),
  unidadeId: int("unidadeId"),
  // Primeiro consultor que abriu a conversa. As sugestões assistidas só
  // ficam disponíveis para ele, exceto para administradores.
  atendenteResponsavelId: int("atendenteResponsavelId"),
  status: mysqlEnum("status", ["aberta", "aguardando", "respondida", "encerrada"]).default("aberta").notNull(),
  // Controle individual da geração automática de sugestões: a suspensão
  // temporária é resolvida por data no próprio webhook, sem job recorrente.
  automacaoAgentes: mysqlEnum("automacaoAgentes", ["ativa", "bloqueada_temporariamente", "bloqueada_permanentemente"]).default("ativa").notNull(),
  automacaoAgentesBloqueadaAte: timestamp("automacaoAgentesBloqueadaAte"),
  // Marco de reinício da memória operacional dos agentes. As mensagens
  // anteriores continuam visíveis no Inbox, mas deixam de compor o contexto
  // enviado ao modelo depois de um bloqueio permanente.
  automacaoAgentesContextoAPartirDe: timestamp("automacaoAgentesContextoAPartirDe"),
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
  // Identificador estável de chat que a Z-API sempre envia, mesmo quando
  // o telefone real vem ofuscado como "@lid" (contato via anúncio
  // "clique para WhatsApp"). A Z-API consegue resolver a maioria pro
  // telefone real via GET /contacts/{lid} (zapiApi.resolveLid, chamado
  // no webhook) — só cai no fallback abaixo quando essa resolução falha
  // de verdade. Nesse caso telefone fica com o valor "@lid" recebido
  // (serve pra enviar mensagem de volta) e chatLid guarda o mesmo valor
  // pra indexação/exibição, com isLidPendente marcando que o número real
  // ainda é desconhecido.
  chatLid: varchar("chatLid", { length: 64 }),
  isLidPendente: mysqlEnum("isLidPendente", ["true", "false"]).default("false").notNull(),
  // Grupo do WhatsApp em vez de conversa 1:1 (telefone = ID do grupo,
  // sufixo "-group"; nomeContato = nome do grupo). Nunca regride depois
  // de criada — mesmo espírito de isLidPendente.
  isGrupo: mysqlEnum("isGrupo", ["true", "false"]).default("false").notNull(),
  // Guarda de dedup do aviso "10min sem retorno" do roteador do Buddha
  // Mkt (2026-08-14, ver server/fluxosScheduled.ts) — evita repetir o
  // aviso no Telegram a cada tick do cron pra mesma rodada de
  // roteamento.
  buddhaMktAlertadoEm: timestamp("buddhaMktAlertadoEm"),
  // Forma canônica de `telefone` (shared/telefone.ts:telefoneCanonico),
  // pré-computada no insert — populada só pra conversas criadas depois
  // dessa coluna existir (2026-08-15); linhas antigas ficam null até um
  // backfill futuro, não usada como fonte primária de matching ainda.
  telefoneNormalizado: varchar("telefoneNormalizado", { length: 20 }),
}, (table) => ({
  telefoneCanalIdx: index("inbox_conversas_telefone_canal_idx").on(table.telefone, table.canal),
  unidadeIdx: index("inbox_conversas_unidade_idx").on(table.unidadeId),
  atendenteResponsavelIdx: index("inbox_conversas_atendente_responsavel_idx").on(table.atendenteResponsavelId),
  chatLidIdx: index("inbox_conversas_chat_lid_idx").on(table.chatLid),
  telefoneNormalizadoIdx: index("inbox_conversas_telefone_normalizado_idx").on(table.telefoneNormalizado),
}));

export type InboxConversa = typeof inboxConversas.$inferSelect;
export type InsertInboxConversa = typeof inboxConversas.$inferInsert;

/**
 * Mensagens trocadas dentro de uma conversa do Inbox — mesma origem
 * (clone do mobai-crm) da tabela acima; só enviadaPorAtendenteId é
 * própria do buddha-spa (migração 2026-08-10-atendentes.sql).
 */
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
  // Quem realmente digitou/enviou, distinto de enviadaPorUserId (a
  // conta Google/Manus compartilhada da recepção) — ver atendentes
  // abaixo. Alimenta o "enviada por" mostrado em cada balão no Inbox.
  enviadaPorAtendenteId: int("enviadaPorAtendenteId"),
  // messageId da Z-API — pra mensagem enviada pelo CRM, usado pra
  // deduplicar contra o webhook fromMe (recepção respondendo direto
  // pelo app do WhatsApp Business, fora do CRM); migração
  // 2026-08-11-inbox-zapi-message-id.sql. A partir de 2026-08-16
  // também é gravado pra mensagem RECEBIDA — precisa disso pra casar
  // uma reação (payload.reaction.referencedMessage.messageId) com a
  // mensagem original, nos dois sentidos (ver reacaoEmoji abaixo).
  zapiMessageId: varchar("zapiMessageId", { length: 100 }),
  // Emoji da reação mais recente sobre essa mensagem (WhatsApp só
  // permite 1 reação por pessoa, mas aqui guardamos só a última pra
  // manter simples — não é uma lista de quem reagiu). Atualizado pelo
  // webhook (payload.reaction) ou pelo próprio envio de reação via CRM
  // (inbox.mensagens.reagir). "" ou reação removida vira NULL.
  reacaoEmoji: varchar("reacaoEmoji", { length: 16 }),
  // Quem DENTRO de um grupo mandou essa mensagem específica (null pra
  // conversa 1:1) — muda a cada mensagem, por isso mora aqui e não na
  // conversa. Contraparte de enviadaPorAtendenteId (que é "quem da
  // nossa equipe mandou").
  participanteTelefone: varchar("participanteTelefone", { length: 30 }),
  participanteLid: varchar("participanteLid", { length: 100 }),
  participanteNome: varchar("participanteNome", { length: 200 }),
  // Tick de entrega estilo WhatsApp (1 cinza / 2 cinza / 2 azul), só
  // relevante pra direcao="enviada" — vem do MessageStatusCallback da
  // Z-API (webhooks.ts), casado por zapiMessageId. "Nunca regride"
  // (server/db.ts, atualizarStatusEntregaMensagens): READ não volta pra
  // RECEIVED se os eventos chegarem fora de ordem.
  statusEntrega: mysqlEnum("statusEntrega", ["enviada", "entregue", "lida"]).default("enviada").notNull(),
}, (table) => ({
  conversaCreatedIdx: index("inbox_mensagens_conversa_created_idx").on(table.conversaId, table.createdAt),
}));

export type InboxMensagem = typeof inboxMensagens.$inferSelect;
export type InsertInboxMensagem = typeof inboxMensagens.$inferInsert;

/** Eventos candidatos de início/fim persistidos antes do pareamento. */
export const atendimentoTempoEventos = mysqlTable("atendimento_tempo_eventos", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  conversaId: int("conversaId"),
  mensagemId: int("mensagemId"),
  zapiMessageId: varchar("zapiMessageId", { length: 100 }),
  evento: mysqlEnum("evento", ["inicio", "fim"]).notNull(),
  participanteTelefone: varchar("participanteTelefone", { length: 30 }),
  participanteLid: varchar("participanteLid", { length: 100 }),
  participanteNome: varchar("participanteNome", { length: 200 }),
  conteudo: text("conteudo"),
  ocorridoEm: timestamp("ocorridoEm").notNull(),
  atendimentoBelleId: int("atendimentoBelleId"),
  status: mysqlEnum("status", ["pendente", "associado", "ambigua"]).default("pendente").notNull(),
  motivo: varchar("motivo", { length: 250 }),
  processadoEm: timestamp("processadoEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  zapiMessageIdx: uniqueIndex("atendimento_tempo_eventos_zapi_message_idx").on(table.zapiMessageId),
  mensagemIdx: uniqueIndex("atendimento_tempo_eventos_mensagem_idx").on(table.mensagemId),
  pendentesIdx: index("atendimento_tempo_eventos_pendentes_idx").on(table.unidadeId, table.status, table.createdAt),
  atendimentoIdx: index("atendimento_tempo_eventos_atendimento_idx").on(table.unidadeId, table.atendimentoBelleId),
}));

export type AtendimentoTempoEvento = typeof atendimentoTempoEventos.$inferSelect;
export type InsertAtendimentoTempoEvento = typeof atendimentoTempoEventos.$inferInsert;

/**
 * Contas bancárias/de caixa nomeáveis por unidade. A conta do Banco
 * Inter (tipo "inter_oauth") é auto-provisionada pela aplicação na
 * primeira vez que é necessária — não precisa de seed manual. Contas
 * "manual" só recebem extrato por importação (OFX/CSV/PDF) por enquanto.
 */
export const contas = mysqlTable("contas", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  nome: varchar("nome", { length: 128 }).notNull(),
  // "manual" fica só de legado (linhas antigas já reclassificadas na
  // migração 2026-08-12-contas-grupos.sql) — toda conta nova usa um
  // dos tipos específicos, nunca mais "manual" genérico.
  tipo: mysqlEnum("tipo", ["inter_oauth", "sicredi_oauth", "manual", "cartao_credito", "conta_corrente", "caixa_fisico"]).default("conta_corrente").notNull(),
  // Ag/conta/CNPJ — identifica a conta pra bater contra
  // cpfCnpjOrigem/cpfCnpjDestino do extrato e detectar transferência
  // entre contas próprias automaticamente (sem depender de texto).
  agencia: varchar("agencia", { length: 20 }),
  numeroConta: varchar("numeroConta", { length: 20 }),
  cnpj: varchar("cnpj", { length: 20 }),
  // Âncora pro saldo corrido (coluna Saldo na tabela): saldo real numa
  // data conhecida + soma das transações a partir dali.
  saldoInicial: decimal("saldoInicial", { precision: 12, scale: 2 }),
  saldoInicialEm: varchar("saldoInicialEm", { length: 10 }), // AAAA-MM-DD
  // Saldo extraído do <LEDGERBAL> na última importação de OFX — só
  // usado por contas "manual" (sem API própria pra consultar saldo ao
  // vivo, tipo o inter_oauth já tem via inter.saldo).
  saldoImportado: decimal("saldoImportado", { precision: 12, scale: 2 }),
  saldoImportadoEm: varchar("saldoImportadoEm", { length: 10 }), // AAAA-MM-DD (data de apuração do OFX, não da importação)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadeIdx: index("contas_unidade_idx").on(table.unidadeId),
}));

export type Conta = typeof contas.$inferSelect;
export type InsertConta = typeof contas.$inferInsert;

/**
 * Transações do extrato Banco Inter sincronizadas por unidade.
 * Fonte: GET /banking/v2/extrato/completo
 */
export const interExtratos = mysqlTable("inter_extratos", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  contaId: int("contaId"), // null = linha legada, antes do conceito de conta existir
  idTransacao: varchar("idTransacao", { length: 128 }),
  dataEntrada: varchar("dataEntrada", { length: 10 }).notNull(),
  dataTransacao: varchar("dataTransacao", { length: 10 }),
  tipoTransacao: varchar("tipoTransacao", { length: 64 }),
  tipoOperacao: mysqlEnum("tipoOperacao", ["D", "C"]).notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  titulo: varchar("titulo", { length: 256 }),
  descricao: text("descricao"),
  detalhe: text("detalhe"),
  nomeOrigem: varchar("nomeOrigem", { length: 256 }),
  nomeDestino: varchar("nomeDestino", { length: 256 }),
  cpfCnpjOrigem: varchar("cpfCnpjOrigem", { length: 20 }),
  cpfCnpjDestino: varchar("cpfCnpjDestino", { length: 20 }),
  contaOrigem: varchar("contaOrigem", { length: 32 }),
  contaDestino: varchar("contaDestino", { length: 32 }),
  cpmf: varchar("cpmf", { length: 64 }),
  origem: mysqlEnum("origem", ["inter", "csv", "pdf", "ofx", "mercadopago", "caixa_fisico", "sicredi"]).default("inter").notNull(),
  dreDescricaoId: int("dreDescricaoId"), // null = pendente (ainda não categorizado)
  // pendente = sem descrição; sugerida = regra bateu sozinha, ainda não
  // confirmada por humano; confirmada = humano escolheu ou confirmou.
  categorizacaoStatus: mysqlEnum("categorizacaoStatus", ["pendente", "sugerida", "confirmada"]).default("pendente").notNull(),
  // Nota livre, separada da categoria — a categoria agrupa (ex.: "Custos
  // Terapeutas"), a nota esclarece o caso específico (ex.: "Repasse Ana
  // Paula") sem precisar criar categoria nova pra cada pessoa/situação.
  nota: text("nota"),
  // Aviso não-bloqueante (ex.: "já tem outra 'Limpeza' este mês, confira
  // duplicidade") — null = sem aviso.
  alerta: text("alerta"),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
}, (table) => ({
  unidadeDataIdx: index("inter_extratos_unidade_data_idx").on(table.unidadeId, table.dataEntrada),
  idTransacaoIdx: index("inter_extratos_id_transacao_idx").on(table.idTransacao),
}));

export type InterExtrato = typeof interExtratos.$inferSelect;
export type InsertInterExtrato = typeof interExtratos.$inferInsert;

/**
 * Vendas de adquirente (maquininha) — diferente de inter_extratos: aqui é
 * a venda no ponto de venda (data/hora exata, bandeira, parcela, taxa),
 * não o crédito agregado que cai na conta depois (esse já aparece em
 * inter_extratos como DOMICILIO_CARTAO). Serve pra conferir as comandas
 * da recepção contra o que a maquininha realmente processou.
 *
 * "interpag" chega só por CSV (sem API pública confirmada, ver
 * server/mercadoPagoApi.ts e conversa no histórico do projeto) —
 * "mercadopago" chega via API (/v1/payments/search).
 *
 * Dedup: Interpag repete o mesmo idTransacaoExterno pra cada parcela de
 * uma venda parcelada (linhas idênticas exceto o campo parcela) — por
 * isso a chave de dedup é adquirente+idTransacaoExterno+parcela, não só
 * idTransacaoExterno.
 */
export const adquirenteVendas = mysqlTable("adquirente_vendas", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  adquirente: mysqlEnum("adquirente", ["mercadopago", "interpag"]).notNull(),
  idTransacaoExterno: varchar("idTransacaoExterno", { length: 128 }).notNull(),
  // "AAAA-MM-DD HH:mm:ss" — string, mesmo padrão comparável usado em
  // dataEntrada (varchar) no resto do projeto.
  dataHora: varchar("dataHora", { length: 19 }).notNull(),
  // Texto livre, varia por adquirente — pode ser curto ("Débito", "Pix")
  // ou uma descrição longa de cobrança de taxa ("155 - DÉBITO COBRANÇA
  // REFERENTE A UTILIZAÇÃO DO CHIP DE TELEFONIA", confirmado em CSV
  // real do Interpag) — por isso text, não varchar.
  tipo: text("tipo"),
  status: varchar("status", { length: 64 }), // Pago/Em Processamento/Cancelado — texto livre
  parcela: varchar("parcela", { length: 8 }), // "1/3"
  bandeira: varchar("bandeira", { length: 32 }), // Mastercard/Visa/Elo/Pix
  // Só preenchida na inserção quando o payload atual do Mercado Pago
  // apresentar sinal inequívoco. Linhas históricas permanecem NULL.
  origemPagamento: mysqlEnum("origemPagamento", ["link_pagamento", "maquininha_point", "online", "indefinido"]),
  valorBruto: decimal("valorBruto", { precision: 12, scale: 2 }),
  valorTaxa: decimal("valorTaxa", { precision: 12, scale: 2 }),
  valorAntecipacao: decimal("valorAntecipacao", { precision: 12, scale: 2 }),
  valorLiquido: decimal("valorLiquido", { precision: 12, scale: 2 }),
  dataPagamento: varchar("dataPagamento", { length: 10 }), // AAAA-MM-DD — quando o valor efetivamente cai na conta
  // Atribuído de forma determinística no sync (não precisa de match de
  // texto — `tipo` já diz se é débito/crédito/pix) pra uma das 4
  // Descrições de "Receitas de Vendas". Null quando `tipo` não é
  // reconhecido (ex.: linha de taxa avulsa do Interpag).
  dreDescricaoId: int("dreDescricaoId"),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
}, (table) => ({
  unidadeDataIdx: index("adquirente_vendas_unidade_data_idx").on(table.unidadeId, table.dataHora),
  dedupIdx: index("adquirente_vendas_dedup_idx").on(table.adquirente, table.idTransacaoExterno, table.parcela),
}));

export type AdquirenteVenda = typeof adquirenteVendas.$inferSelect;
export type InsertAdquirenteVenda = typeof adquirenteVendas.$inferInsert;

/**
 * Snapshot diário da "Comanda (Recepção)" — valores por forma de
 * pagamento que a recepção lançou no dia, sincronizados da planilha
 * "Consolidado comanda" (Google Sheets, uma aba por mês, linhas
 * Dinheiro/Cartão de débito/Cartão de crédito/Pix). Serve de lado
 * esquerdo da conciliação semanal; o lado direito ("Contas bancárias")
 * é sempre calculado ao vivo a partir do que já está sincronizado em
 * inter_extratos/adquirente_vendas, sem tabela própria.
 */
export const comandaDiaria = mysqlTable("comanda_diaria", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  data: varchar("data", { length: 10 }).notNull(), // AAAA-MM-DD
  dinheiro: decimal("dinheiro", { precision: 12, scale: 2 }).default("0").notNull(),
  cartaoDebito: decimal("cartaoDebito", { precision: 12, scale: 2 }).default("0").notNull(),
  cartaoCredito: decimal("cartaoCredito", { precision: 12, scale: 2 }).default("0").notNull(),
  pix: decimal("pix", { precision: 12, scale: 2 }).default("0").notNull(),
  syncedAt: timestamp("syncedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadeDataIdx: index("comanda_diaria_unidade_data_idx").on(table.unidadeId, table.data),
}));

export type ComandaDiaria = typeof comandaDiaria.$inferSelect;
export type InsertComandaDiaria = typeof comandaDiaria.$inferInsert;

/**
 * Item a item da "Comanda virtual" — planilha que a recepção preenche
 * em tempo real, uma aba por dia (nome "DDMMYYYY"), um lançamento por
 * linha (cliente, terapia, terapeuta, forma de pagamento). Alimenta o
 * drill-down (hover) da linha "Comanda (Recepção)" e, desde 2026-09-02,
 * também tem prioridade sobre comanda_diaria no número agregado (ver
 * listComandaDiaria em server/db.ts) — é a fonte mais viva, então evita
 * ficar zerado só porque a aba mensal do "Consolidado comanda" ainda
 * não foi preenchida pro mês corrente. comanda_diaria vira fallback,
 * usado só em dias sem nenhum item aqui (histórico anterior a
 * 2026-08-09 ou falha pontual de sync).
 *
 * Duas portas de entrada, mesma tabela: import de xlsx (carga
 * histórica, uma vez — server/comandaVirtualXlsxParser.ts) e
 * sincronização via Google Sheets (dia a dia — server/googleSheets.ts).
 * idLinha é o "ID" sequencial que já existe na própria planilha, dentro
 * de cada dia — junto com unidadeId+data é a chave natural de upsert
 * (checada em código, mesmo padrão de adquirente_vendas/clientes — sem
 * unique constraint composto no banco).
 */
export const comandaItens = mysqlTable("comanda_itens", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  data: varchar("data", { length: 10 }).notNull(), // AAAA-MM-DD
  idLinha: int("idLinha").notNull(), // "ID" da planilha, sequencial dentro do dia
  cliente: varchar("cliente", { length: 200 }),
  aberturaResponsavel: varchar("aberturaResponsavel", { length: 100 }),
  visitasAnteriores: varchar("visitasAnteriores", { length: 60 }),
  canalCaptacao: varchar("canalCaptacao", { length: 100 }),
  terapiaProduto: varchar("terapiaProduto", { length: 150 }),
  terapeuta: varchar("terapeuta", { length: 100 }),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 }),
  desconto: decimal("desconto", { precision: 12, scale: 2 }),
  motivoDesconto: varchar("motivoDesconto", { length: 100 }),
  total: decimal("total", { precision: 12, scale: 2 }),
  dinheiro: decimal("dinheiro", { precision: 12, scale: 2 }),
  pix: decimal("pix", { precision: 12, scale: 2 }),
  cartaoDebito: decimal("cartaoDebito", { precision: 12, scale: 2 }),
  cartaoCredito: decimal("cartaoCredito", { precision: 12, scale: 2 }),
  totalPagtos: decimal("totalPagtos", { precision: 12, scale: 2 }),
  observacao: varchar("observacao", { length: 300 }),
  fechamentoResponsavel: varchar("fechamentoResponsavel", { length: 100 }),
  campoGerente: text("campoGerente"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadeDataIdx: index("comanda_itens_unidade_data_idx").on(table.unidadeId, table.data),
}));

export type ComandaItem = typeof comandaItens.$inferSelect;
export type InsertComandaItem = typeof comandaItens.$inferInsert;

/**
 * Plano de contas do DRE (estrutura definida em 2026-08-04, revisão
 * pendente pra Receitas/Pronampe/alguns itens sem exemplo real ainda —
 * ver comentário em server/dreCategorizacao.ts). "excluido" é uma seção
 * especial pra transações que não são receita/despesa de verdade
 * (transferência entre contas, aporte em aplicação, retirada de sócio).
 */
export const dreCategorias = mysqlTable("dre_categorias", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 128 }).notNull().unique(),
  secao: mysqlEnum("secao", [
    "receitas",
    "impostos",
    "custos_diretos",
    "despesas_pessoal",
    "marketing",
    "despesas_administrativas",
    "despesas_financeiras",
    "devolucoes",
    "excluido",
  ]).notNull(),
  ordem: int("ordem").default(0).notNull(),
}, (table) => ({
  secaoIdx: index("dre_categorias_secao_idx").on(table.secao),
}));

export type DreCategoria = typeof dreCategorias.$inferSelect;
export type InsertDreCategoria = typeof dreCategorias.$inferInsert;

/**
 * Nível intermediário entre Categoria e lançamento: toda transação
 * categorizada aponta pra uma Descrição (ex.: "Yamada Contabilidade",
 * "Receita C. Débito"), nunca direto pra Categoria — a Categoria é
 * sempre herdada daqui. Uma Descrição pertence a exatamente 1 Categoria;
 * uma Categoria agrupa N Descrições. Modelo definido com o usuário em
 * 2026-08-07 (áudio) — antes disso a "descrição" era só um rótulo livre
 * opcional em cima da regra, sem estrutura própria, o que não dava pra
 * saber "quanto é de cada contraparte" dentro de uma categoria que
 * agrupa várias (ex.: "Consultoria/Assessoria" com vários escritórios).
 */
export const dreDescricoes = mysqlTable("dre_descricoes", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 256 }).notNull(),
  dreCategoriaId: int("dreCategoriaId").notNull(),
  // Chave estável usada internamente pelo código (Comanda Recepção,
  // classificação de adquirente, exclusão automática de liquidação MP,
  // proteção contra exclusão) pra achar as Descrições especiais sem
  // depender do nome de exibição — o usuário pode renomear a Descrição
  // à vontade (ex.: "Receita C. Débito" → "Receita Cartão de Débito")
  // sem quebrar nada, porque o código nunca compara por `nome`. Null =
  // Descrição comum, sem papel especial no sistema.
  chave: varchar("chave", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  categoriaIdx: index("dre_descricoes_categoria_idx").on(table.dreCategoriaId),
  chaveIdx: index("dre_descricoes_chave_idx").on(table.chave),
}));

export type DreDescricao = typeof dreDescricoes.$inferSelect;
export type InsertDreDescricao = typeof dreDescricoes.$inferInsert;

/**
 * Regras de categorização automática: se `padrao` aparece (case-
 * insensitive) no histórico+descrição da transação, sugere
 * `dreDescricaoId` (a Categoria vem por herança da Descrição). Fica em
 * tabela (não hardcoded) pra dar pra adicionar regra nova sem deploy —
 * mesmo espírito da planilha antiga, mas sem ficar preso a fórmula
 * quebrada.
 */
export const dreRegras = mysqlTable("dre_regras", {
  id: int("id").autoincrement().primaryKey(),
  padrao: varchar("padrao", { length: 256 }).notNull(),
  dreDescricaoId: int("dreDescricaoId").notNull(),
  // Faixa de valor opcional — mesma contraparte pode significar coisas
  // diferentes dependendo do valor (ex.: MDS Serviços até R$1.600 é
  // limpeza, acima é lavanderia). Null = sem restrição de valor.
  valorMin: decimal("valorMin", { precision: 12, scale: 2 }),
  valorMax: decimal("valorMax", { precision: 12, scale: 2 }),
  // Se true, alerta quando já existir outra transação da mesma regra
  // no mesmo mês/conta — pensado pra despesa mensal única (se duplicar,
  // pode ser erro de import ou mudança real que merece revisão).
  alertaSeRepetirNoMes: mysqlEnum("alertaSeRepetirNoMes", ["true", "false"]).default("false").notNull(),
  // seed = cadastrada por mim; aprendida = criada automaticamente
  // quando o usuário categoriza uma transação manualmente; manual =
  // criada direto na tela de Parâmetros.
  origem: mysqlEnum("origem", ["seed", "aprendida", "manual"]).default("aprendida").notNull(),
  ativa: mysqlEnum("ativa", ["true", "false"]).default("true").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DreRegra = typeof dreRegras.$inferSelect;
export type InsertDreRegra = typeof dreRegras.$inferInsert;

/**
 * Split de lançamento: quando uma transação do extrato (ex.: fatura de
 * cartão paga de uma vez, mas na real é várias categorias diferentes)
 * é dividida em N partes, cada parte vira 1 linha aqui, com sua
 * própria Descrição e (opcionalmente) unidade dona daquela parte —
 * diferente da unidade do lançamento original quando o gasto é
 * rateado entre unidades (ver `transacoesEntreUnidades`). Enquanto uma
 * transação tem linhas aqui, `inter_extratos.dreDescricaoId` fica null
 * (a Descrição "mora" nos splits, não na linha-mãe).
 */
export const lancamentoSplits = mysqlTable("lancamento_splits", {
  id: int("id").autoincrement().primaryKey(),
  interExtratoId: int("interExtratoId").notNull(),
  dreDescricaoId: int("dreDescricaoId").notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  unidadeId: int("unidadeId").notNull(),
  observacao: varchar("observacao", { length: 256 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  extratoIdx: index("lancamento_splits_extrato_idx").on(table.interExtratoId),
}));

export type LancamentoSplit = typeof lancamentoSplits.$inferSelect;
export type InsertLancamentoSplit = typeof lancamentoSplits.$inferInsert;

/**
 * "Conta corrente" entre as 2 unidades (RBS/Satori e SSU/Agama) —
 * junta 2 eventos diferentes na mesma tabela: rateio de despesa
 * (nasce de uma linha de `lancamentoSplits` com unidade diferente da
 * do lançamento, ex.: assistência administrativa paga por uma unidade
 * mas devida em parte pela outra) e transferência bancária real entre
 * as contas das duas unidades (ex.: RBS manda dinheiro pro SSU cobrir
 * uma conta — detectada por CNPJ, ver CHAVE_TRANSACAO_ENTRE_UNIDADES
 * em server/dreCategorizacao.ts). `unidadeCredora` é quem "pagou"/tem
 * a receber; `unidadeDevedora` é quem deve. O saldo líquido entre as
 * duas é `SUM(credora=A,devedora=B) - SUM(credora=B,devedora=A)`.
 */
export const transacoesEntreUnidades = mysqlTable("transacoes_entre_unidades", {
  id: int("id").autoincrement().primaryKey(),
  data: varchar("data", { length: 10 }).notNull(), // AAAA-MM-DD
  tipo: mysqlEnum("tipo", ["rateio_despesa", "transferencia_real", "manual"]).notNull(),
  unidadeCredora: int("unidadeCredora").notNull(),
  unidadeDevedora: int("unidadeDevedora").notNull(),
  valor: decimal("valor", { precision: 12, scale: 2 }).notNull(),
  descricao: varchar("descricao", { length: 256 }).notNull(),
  lancamentoSplitId: int("lancamentoSplitId"), // origem = rateio_despesa
  interExtratoId: int("interExtratoId"), // origem = transferencia_real
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  credoraIdx: index("transacoes_unidades_credora_idx").on(table.unidadeCredora),
  devedoraIdx: index("transacoes_unidades_devedora_idx").on(table.unidadeDevedora),
}));

export type TransacaoEntreUnidades = typeof transacoesEntreUnidades.$inferSelect;
export type InsertTransacaoEntreUnidades = typeof transacoesEntreUnidades.$inferInsert;

/**
 * Biblioteca de mensagens prontas do Inbox (mesmo conceito do
 * "Mensagens e Scripts" do mobai-crm) — agrupadas por categoriaScript
 * livre (texto, não FK — evita precisar de uma tabela de categorias só
 * pra isso; a lista de categorias visível na UI vem de um DISTINCT).
 * Exclusão é soft (ativo=false) pra não quebrar scriptsUso histórico.
 */
export const scripts = mysqlTable("scripts", {
  id: int("id").autoincrement().primaryKey(),
  categoriaScript: varchar("categoriaScript", { length: 100 }).notNull(),
  // Título curto para a equipe localizar o recurso e descrição de intenção
  // para os agentes decidirem quando o Script é aplicável.
  titulo: varchar("titulo", { length: 200 }),
  descricao: varchar("descricao", { length: 500 }),
  // Chaves dos especialistas que podem receber este Script no contexto de IA.
  // A equipe continua vendo todos os Scripts no Inbox; esta seleção é apenas
  // para reduzir contexto e evitar sugestão fora da especialidade.
  agentesPermitidos: json("agentesPermitidos").$type<Array<"bianca" | "fabricia" | "estela" | "carol" | "diana">>(),
  // Null quando tipo="fluxo" — o conteúdo vem do fluxo referenciado,
  // não de texto próprio.
  script: text("script"),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  // "fluxo" dispara um Fluxo pronto (server/fluxos.ts) em vez de
  // inserir texto na caixa — permite script com imagem/áudio sem
  // duplicar upload de mídia aqui (2026-08-13, ver ScriptPicker.tsx).
  tipo: mysqlEnum("tipo", ["texto", "fluxo"]).default("texto").notNull(),
  fluxoId: int("fluxoId"), // soft-ref a fluxos.id, só usado quando tipo="fluxo"
}, (table) => ({
  categoriaIdx: index("scripts_categoria_idx").on(table.categoriaScript),
}));

export type Script = typeof scripts.$inferSelect;
export type InsertScript = typeof scripts.$inferInsert;

/** Registro de uso — alimenta a aba "Recentes" do seletor de scripts. */
export const scriptsUso = mysqlTable("scripts_uso", {
  id: int("id").autoincrement().primaryKey(),
  scriptId: int("scriptId").notNull(),
  userId: int("userId").notNull(),
  usadoEm: timestamp("usadoEm").defaultNow().notNull(),
}, (table) => ({
  scriptIdx: index("scripts_uso_script_idx").on(table.scriptId),
  userIdx: index("scripts_uso_user_idx").on(table.userId),
}));

export type ScriptUso = typeof scriptsUso.$inferSelect;
export type InsertScriptUso = typeof scriptsUso.$inferInsert;

/**
 * Fluxos de automação de WhatsApp (porte do mobai-crm, 2026-08-13) —
 * sequências configuráveis de nó em nó (mensagem/aguardar/condicional/
 * etc.), estilo BotConversa/n8n, em vez de cada automação exigir código
 * novo. Escopado por unidade (mobai-crm não tem esse conceito — lá é
 * uma agência só). Só os 9 tipos de nó "mecânicos" por enquanto — os
 * nós de IA multi-turno do mobai (agente/assistente) ficam de fora
 * porque o prompt/escalonamento deles é hard-coded pro contexto de
 * agência de viagens e precisa de decisão de produto própria pro spa.
 * Gatilho "mudanca_fase" do mobai também não existe aqui — buddha-spa
 * não tem funil de vendas (clientes não tem fase/etapa).
 */
export type FluxoGatilhoConfig =
  | Record<string, never> // manual
  | Record<string, never> // mensagem_recebida (v1 sem filtro extra)
  | { dias: number } // dias_sem_contato
  | { canalCaptacao?: string }; // cliente_novo (filtro opcional, mantido por paridade)

export const fluxos = mysqlTable("fluxos", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  nome: varchar("nome", { length: 150 }).notNull(),
  descricao: text("descricao"),
  ativo: boolean("ativo").default(true).notNull(),
  entradaNoOrdem: int("entradaNoOrdem"), // soft-reference a fluxo_nos.ordem — null = usa o nó de menor ordem
  gatilhoTipo: mysqlEnum("gatilhoTipo", ["manual", "mensagem_recebida", "dias_sem_contato", "cliente_novo"]).default("manual").notNull(),
  gatilhoConfig: json("gatilhoConfig").$type<FluxoGatilhoConfig>(),
  // Menu "Executar fluxo" no Inbox — oculto por padrão, admin decide
  // quais fluxos qualquer atendente pode disparar manualmente pro
  // cliente da conversa aberta. O botão "Testar com um cliente" no
  // editor continua admin-only e não depende desse campo.
  visivelNoInbox: boolean("visivelNoInbox").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadeIdx: index("fluxos_unidade_idx").on(table.unidadeId),
}));

export type Fluxo = typeof fluxos.$inferSelect;
export type InsertFluxo = typeof fluxos.$inferInsert;

export type FluxoNoConfig =
  | { texto: string } // mensagem
  | {
      valor: number;
      unidade: "segundos" | "minutos" | "horas" | "dias";
      // Mostra "Digitando..." pro cliente logo antes do próximo passo
      // "mensagem" ser enviado (Z-API /send-text, parâmetro delayTyping —
      // aceita só 1-15s; o motor usa min(valor em segundos, 15)). Não se
      // aplica a "aguardar" seguido de outro tipo de passo.
      mostrarDigitando?: boolean;
    } // aguardar
  | {
      logica: "E" | "OU";
      condicoes: Array<{
        variavel: string;
        operador: "igual" | "diferente" | "contem" | "existe" | "nao_existe";
        valor?: string;
      }>;
      ordemSeVerdadeiro: number | null;
      ordemSeFalso: number | null;
    } // condicional
  | { nome: string; origem: "fixo" | "ia"; valorFixo?: string; promptIa?: string } // salvar_variavel
  | Record<string, never> // fim
  | { ramos: Array<{ pesoPercentual: number; ordemDestino: number | null }> } // randomizador
  | {
      url: string;
      variavelResposta?: string;
      campoResposta?: string; // path simples tipo "data.status"
      ordemSeErro: number | null;
    } // webhook
  | {
      // midia: envia imagem/áudio/documento — sem vídeo (Z-API não tem
      // endpoint de vídeo). Upload acontece uma vez ao configurar o nó
      // (nos.uploadMidia), não por execução; no envio, o motor baixa o
      // arquivo do storage e manda em Base64 direto pra Z-API (mesmo
      // caminho que inbox.mensagens.enviarMidia já usa pra imagem/
      // documento — URL assinada direto pra Z-API se mostrou não-
      // confiável nesse projeto).
      tipoMidia: "imagem" | "audio" | "documento";
      storageKey: string;
      nomeArquivo?: string;
      legenda?: string;
    } // midia
  | {
      // menu: manda o texto + opções e espera a resposta do cliente pra
      // ramificar. `estilo` ausente = "texto" (opções numeradas no
      // corpo da mensagem); "botoes"/"lista" usam os formatos nativos
      // do WhatsApp (zapiApi.sendButtonList/sendOptionList) —
      // `descricao` só é usada em "lista".
      texto: string;
      opcoes: Array<{ label: string; ordemDestino: number | null; descricao?: string }>;
      ordemSeNaoEntendeu: number | null;
      diasTimeoutSemResposta?: number;
      estilo?: "texto" | "botoes" | "lista";
    }; // menu

export const fluxoNos = mysqlTable("fluxo_nos", {
  id: int("id").autoincrement().primaryKey(),
  fluxoId: int("fluxoId").notNull(),
  tipo: mysqlEnum("tipo", ["mensagem", "aguardar", "condicional", "salvar_variavel", "fim", "randomizador", "webhook", "midia", "menu"]).notNull(),
  ordem: int("ordem").notNull(), // chave interna do motor — identidade visual/canvas usa o `id`
  config: json("config").$type<FluxoNoConfig>().notNull(),
  proximoNoOrdem: int("proximoNoOrdem"), // próximo passo padrão — null = encerra o fluxo (exceto condicional/fim)
  posX: int("posX"), // posição no canvas — null = ainda não posicionado, roda auto-layout
  posY: int("posY"),
  // Contador de disparo do nó "menu" (2026-08-14) — quantas vezes esse
  // passo foi enviado, pra calcular CTR por opção junto de
  // fluxoNoOpcaoCliques abaixo. Sempre 0 pros outros tipos de nó.
  enviados: int("enviados").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  fluxoOrdemUnique: uniqueIndex("fluxo_nos_fluxo_ordem_unique").on(table.fluxoId, table.ordem),
}));

export type FluxoNo = typeof fluxoNos.$inferSelect;
export type InsertFluxoNo = typeof fluxoNos.$inferInsert;

/**
 * Clique por opção do nó "menu" (2026-08-14) — CTR pra campanha de
 * disparo, mesma métrica que o BotConversa já mostrava (enviado/
 * clicado por opção). `opcaoIndex` é o índice dentro de
 * FluxoNoConfig.opcoes — aceitável pra v1, campanha em andamento não
 * costuma reordenar opção de um nó já disparando.
 */
export const fluxoNoOpcaoCliques = mysqlTable("fluxo_no_opcao_cliques", {
  id: int("id").autoincrement().primaryKey(),
  fluxoNoId: int("fluxoNoId").notNull(),
  opcaoIndex: int("opcaoIndex").notNull(),
  cliques: int("cliques").default(0).notNull(),
}, (table) => ({
  unico: uniqueIndex("fluxo_no_opcao_cliques_unico").on(table.fluxoNoId, table.opcaoIndex),
}));

export type FluxoNoOpcaoClique = typeof fluxoNoOpcaoCliques.$inferSelect;
export type InsertFluxoNoOpcaoClique = typeof fluxoNoOpcaoCliques.$inferInsert;

/**
 * Espelho local dos Message Templates da Meta (2026-08-14) — evita
 * round-trip na Graph API toda vez que a tela de Disparos precisa
 * listar templates aprovados. `status` é sincronizado sob demanda
 * (botão "Sincronizar status", ver server/metaTemplatesApi.ts) porque
 * a revisão da Meta é assíncrona (minutos a horas).
 */
export const buddhaMktTemplates = mysqlTable("buddha_mkt_templates", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 512 }).notNull(), // nome técnico exigido pela Meta (snake_case, único por WABA+idioma)
  idioma: varchar("idioma", { length: 10 }).notNull().default("pt_BR"),
  categoria: mysqlEnum("categoria", ["MARKETING", "UTILITY"]).default("MARKETING").notNull(),
  corpo: text("corpo").notNull(),
  // Valor de exemplo pra cada {{N}} do corpo, na ordem (índice 0 =
  // {{1}}) — a Meta exige um exemplo por variável pra sequer aceitar o
  // template pra revisão (2026-08-14, ver server/metaTemplatesApi.ts).
  corpoExemplos: json("corpoExemplos").$type<string[]>(),
  cabecalho: varchar("cabecalho", { length: 60 }),
  // Só existe se `cabecalho` tiver {{1}} — a Meta permite no máximo 1
  // variável no cabeçalho.
  cabecalhoExemplo: varchar("cabecalhoExemplo", { length: 60 }),
  rodape: varchar("rodape", { length: 60 }),
  botoes: json("botoes").$type<Array<
    | { tipo: "QUICK_REPLY"; texto: string }
    | { tipo: "URL"; texto: string; url: string; exemploVariavel?: string }
  >>(),
  metaTemplateId: varchar("metaTemplateId", { length: 64 }), // id devolvido pela Meta ao criar
  status: mysqlEnum("status", ["rascunho", "pendente", "aprovado", "rejeitado"]).default("rascunho").notNull(),
  motivoRejeicao: text("motivoRejeicao"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BuddhaMktTemplate = typeof buddhaMktTemplates.$inferSelect;
export type InsertBuddhaMktTemplate = typeof buddhaMktTemplates.$inferInsert;

/**
 * Disparo em massa (2026-08-14) — dispara um Template aprovado pra
 * lista de clientes selecionada; `fluxoRespostaId` é o fluxo-roteador
 * fixo que trata quem responder (v1: um só pra todo disparo, não
 * por-campanha — decisão já confirmada com o usuário).
 */
export const disparos = mysqlTable("disparos", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 150 }).notNull(),
  templateId: int("templateId").notNull(),
  fluxoRespostaId: int("fluxoRespostaId"),
  // Origem de cada variável {{N}} do template pro envio em massa, na
  // ordem — "nome_cliente" personaliza por destinatário (puxa da base
  // de clientes), "fixo" usa o mesmo texto pra todo mundo (ex.: nome
  // da promoção). Índice 0 = {{1}} do corpo.
  variaveisConfig: json("variaveisConfig").$type<Array<{ fonte: "nome_cliente" | "fixo"; valor?: string }>>(),
  status: mysqlEnum("status", ["rascunho", "enviando", "concluido", "erro"]).default("rascunho").notNull(),
  totalDestinatarios: int("totalDestinatarios").default(0).notNull(),
  totalEnviados: int("totalEnviados").default(0).notNull(),
  totalErros: int("totalErros").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  iniciadoEm: timestamp("iniciadoEm"),
  concluidoEm: timestamp("concluidoEm"),
});

export type Disparo = typeof disparos.$inferSelect;
export type InsertDisparo = typeof disparos.$inferInsert;

export const disparoDestinatarios = mysqlTable("disparo_destinatarios", {
  id: int("id").autoincrement().primaryKey(),
  disparoId: int("disparoId").notNull(),
  clienteId: int("clienteId").notNull(),
  telefone: varchar("telefone", { length: 20 }).notNull(),
  status: mysqlEnum("status", ["pendente", "enviado", "erro"]).default("pendente").notNull(),
  erroMsg: text("erroMsg"),
  enviadoEm: timestamp("enviadoEm"),
}, (table) => ({
  disparoIdx: index("disparo_destinatarios_disparo_idx").on(table.disparoId),
}));

export type DisparoDestinatario = typeof disparoDestinatarios.$inferSelect;
export type InsertDisparoDestinatario = typeof disparoDestinatarios.$inferInsert;

export const fluxoExecucoes = mysqlTable("fluxo_execucoes", {
  id: int("id").autoincrement().primaryKey(),
  fluxoId: int("fluxoId").notNull(),
  // Âncora é a conversa, não o cliente (diferente do mobai-crm) — o
  // Inbox do buddha-spa trata conversa como identidade primária, muita
  // conversa não tem clienteId ainda (lead novo, ver
  // criarClienteRapidoDeConversa em db.ts).
  conversaId: int("conversaId").notNull(),
  clienteId: int("clienteId"),
  status: mysqlEnum("status", ["ativo", "pausado", "concluido", "cancelado", "erro", "aguardando_resposta"]).default("ativo").notNull(),
  noAtualOrdem: int("noAtualOrdem").notNull(),
  variaveis: json("variaveis").$type<Record<string, string>>().default({}).notNull(),
  proximaExecucaoEm: timestamp("proximaExecucaoEm"), // quando o cron deve retomar (nó "aguardar")
  erroMsg: text("erroMsg"),
  iniciadoEm: timestamp("iniciadoEm").defaultNow().notNull(),
  atualizadoEm: timestamp("atualizadoEm").defaultNow().onUpdateNow().notNull(),
  concluidoEm: timestamp("concluidoEm"),
}, (table) => ({
  fluxoIdx: index("fluxo_execucoes_fluxo_idx").on(table.fluxoId),
  conversaIdx: index("fluxo_execucoes_conversa_idx").on(table.conversaId),
  statusIdx: index("fluxo_execucoes_status_idx").on(table.status),
}));

export type FluxoExecucao = typeof fluxoExecucoes.$inferSelect;
export type InsertFluxoExecucao = typeof fluxoExecucoes.$inferInsert;

/** Catálogo configurável dos agentes de atendimento assistido. */
export const agentesAtendimento = mysqlTable("agentes_atendimento", {
  id: int("id").autoincrement().primaryKey(),
  chave: varchar("chave", { length: 64 }).notNull().unique(),
  nome: varchar("nome", { length: 120 }).notNull(),
  descricao: text("descricao"),
  tipo: mysqlEnum("tipo", ["receptor", "especialista"]).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  modoOperacao: mysqlEnum("modoOperacao", ["assistido", "automatico"]).default("assistido").notNull(),
  modelo: varchar("modelo", { length: 80 }).default("gpt-5-mini").notNull(),
  ordem: int("ordem").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tipoAtivoIdx: index("agentes_atendimento_tipo_ativo_idx").on(table.tipo, table.ativo),
}));
export type AgenteAtendimento = typeof agentesAtendimento.$inferSelect;
export type InsertAgenteAtendimento = typeof agentesAtendimento.$inferInsert;

/** Configuração operacional por agente e por unidade. */
export const agentesConfiguracoes = mysqlTable("agentes_configuracoes", {
  id: int("id").autoincrement().primaryKey(),
  agenteId: int("agenteId").notNull(),
  unidadeId: int("unidadeId").notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  modoOperacao: mysqlEnum("modoOperacao", ["assistido", "automatico"]).default("assistido").notNull(),
  modelo: varchar("modelo", { length: 80 }).default("gpt-5-mini").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  agenteUnidadeUnica: uniqueIndex("agentes_configuracoes_agente_unidade_idx").on(table.agenteId, table.unidadeId),
  unidadeAtivoIdx: index("agentes_configuracoes_unidade_ativo_idx").on(table.unidadeId, table.ativo),
}));
export type AgenteConfiguracao = typeof agentesConfiguracoes.$inferSelect;
export type InsertAgenteConfiguracao = typeof agentesConfiguracoes.$inferInsert;

/** Histórico de prompts, isolado por unidade e agente. */
export const agentesPromptVersoes = mysqlTable("agentes_prompt_versoes", {
  id: int("id").autoincrement().primaryKey(),
  agenteId: int("agenteId").notNull(),
  unidadeId: int("unidadeId"),
  versao: int("versao").notNull(),
  conteudo: text("conteudo").notNull(),
  status: mysqlEnum("status", ["rascunho", "ativo", "arquivado"]).default("rascunho").notNull(),
  criadoPorUserId: int("criadoPorUserId"),
  criadoPorNome: varchar("criadoPorNome", { length: 120 }),
  ativadoEm: timestamp("ativadoEm"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  agenteUnidadeVersaoUnica: uniqueIndex("agentes_prompt_versoes_agente_unidade_versao_idx").on(table.agenteId, table.unidadeId, table.versao),
  agenteStatusIdx: index("agentes_prompt_versoes_agente_unidade_status_idx").on(table.agenteId, table.unidadeId, table.status),
}));
export type AgentePromptVersao = typeof agentesPromptVersoes.$inferSelect;
export type InsertAgentePromptVersao = typeof agentesPromptVersoes.$inferInsert;

/** Estado persistido da conversa sob atendimento assistido. */
export const agentesConversas = mysqlTable("agentes_conversas", {
  id: int("id").autoincrement().primaryKey(),
  conversaId: int("conversaId").notNull(),
  unidadeId: int("unidadeId").notNull(),
  agenteAtualId: int("agenteAtualId"),
  proximaRota: varchar("proximaRota", { length: 64 }),
  etapa: varchar("etapa", { length: 96 }),
  resumo: text("resumo"),
  variaveis: json("variaveis").$type<Record<string, string | number | boolean | null>>(),
  tentativasQualificacao: int("tentativasQualificacao").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  conversaUnica: uniqueIndex("agentes_conversas_conversa_idx").on(table.conversaId),
  unidadeAtualIdx: index("agentes_conversas_unidade_atual_idx").on(table.unidadeId, table.agenteAtualId),
}));
export type AgenteConversa = typeof agentesConversas.$inferSelect;
export type InsertAgenteConversa = typeof agentesConversas.$inferInsert;

/** Conteúdo comercial aprovado e limitado à unidade. */
export const agentesRecursos = mysqlTable("agentes_recursos", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  chave: varchar("chave", { length: 96 }).notNull(),
  tipo: mysqlEnum("tipo", ["preco", "promocao", "conteudo", "midia", "modelo_voucher"]).notNull(),
  titulo: varchar("titulo", { length: 256 }).notNull(),
  conteudo: text("conteudo"),
  url: text("url"),
  vigenciaInicio: timestamp("vigenciaInicio"),
  vigenciaFim: timestamp("vigenciaFim"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadeChaveUnica: uniqueIndex("agentes_recursos_unidade_chave_idx").on(table.unidadeId, table.chave),
  unidadeTipoAtivoIdx: index("agentes_recursos_unidade_tipo_ativo_idx").on(table.unidadeId, table.tipo, table.ativo),
}));
export type AgenteRecurso = typeof agentesRecursos.$inferSelect;
export type InsertAgenteRecurso = typeof agentesRecursos.$inferInsert;

/** Tabela comercial consultável pelo especialista de preços. */
export const agentesTabelaPrecos = mysqlTable("agentes_tabela_precos", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId").notNull(),
  servico: varchar("servico", { length: 200 }).notNull(),
  categoria: varchar("categoria", { length: 80 }).notNull(),
  duracaoMinutos: int("duracaoMinutos"),
  precoSemana: decimal("precoSemana", { precision: 10, scale: 2 }).notNull(),
  precoDomingo: decimal("precoDomingo", { precision: 10, scale: 2 }),
  ativo: boolean("ativo").default(true).notNull(),
  origem: varchar("origem", { length: 120 }).default("Tabela administrativa"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  unidadeServicoUnico: uniqueIndex("agentes_tabela_precos_unidade_servico_idx").on(table.unidadeId, table.servico),
  unidadeCategoriaIdx: index("agentes_tabela_precos_unidade_categoria_idx").on(table.unidadeId, table.categoria),
}));
export type AgenteTabelaPreco = typeof agentesTabelaPrecos.$inferSelect;
export type InsertAgenteTabelaPreco = typeof agentesTabelaPrecos.$inferInsert;

/** Impede o reenvio de um mesmo material ou ação em uma conversa. */
export const agentesAcoesConversa = mysqlTable("agentes_acoes_conversa", {
  id: int("id").autoincrement().primaryKey(),
  conversaId: int("conversaId").notNull(),
  chaveAcao: varchar("chaveAcao", { length: 128 }).notNull(),
  sugestaoId: int("sugestaoId"),
  executadaEm: timestamp("executadaEm").defaultNow().notNull(),
}, (table) => ({
  conversaAcaoUnica: uniqueIndex("agentes_acoes_conversa_conversa_acao_idx").on(table.conversaId, table.chaveAcao),
}));
export type AgenteAcaoConversa = typeof agentesAcoesConversa.$inferSelect;
export type InsertAgenteAcaoConversa = typeof agentesAcoesConversa.$inferInsert;

/** Rastreia o roteamento e a execução de cada mensagem recebida. */
export const agentesExecucoes = mysqlTable("agentes_execucoes", {
  id: int("id").autoincrement().primaryKey(),
  conversaId: int("conversaId").notNull(),
  mensagemEntradaId: int("mensagemEntradaId").notNull(),
  agenteReceptorId: int("agenteReceptorId"),
  agenteEspecialistaId: int("agenteEspecialistaId"),
  promptReceptorId: int("promptReceptorId"),
  promptEspecialistaId: int("promptEspecialistaId"),
  classificacao: varchar("classificacao", { length: 64 }),
  intencao: varchar("intencao", { length: 64 }),
  detalheIntencao: varchar("detalheIntencao", { length: 320 }),
  origemIntencao: varchar("origemIntencao", { length: 32 }),
  confianca: int("confianca"),
  rastro: json("rastro").$type<Record<string, unknown>>(),
  status: mysqlEnum("status", ["pendente", "concluida", "ignorada", "erro"]).default("pendente").notNull(),
  erroMsg: text("erroMsg"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  concludedAt: timestamp("concludedAt"),
}, (table) => ({
  mensagemEntradaUnica: uniqueIndex("agentes_execucoes_mensagem_entrada_idx").on(table.mensagemEntradaId),
  conversaCriadaIdx: index("agentes_execucoes_conversa_criada_idx").on(table.conversaId, table.createdAt),
  especialistaIdx: index("agentes_execucoes_especialista_idx").on(table.agenteEspecialistaId),
  intencaoCriadaIdx: index("agentes_execucoes_intencao_criada_idx").on(table.intencao, table.createdAt),
}));
export type AgenteExecucao = typeof agentesExecucoes.$inferSelect;
export type InsertAgenteExecucao = typeof agentesExecucoes.$inferInsert;

/** Janela durável de silêncio antes de enviar mensagens consecutivas à Áurea. */
export const agentesAgrupamentosMensagens = mysqlTable("agentes_agrupamentos_mensagens", {
  id: int("id").autoincrement().primaryKey(),
  conversaId: int("conversaId").notNull(),
  unidadeId: int("unidadeId").notNull(),
  primeiraMensagemId: int("primeiraMensagemId").notNull(),
  ultimaMensagemId: int("ultimaMensagemId").notNull(),
  versao: int("versao").default(1).notNull(),
  processarApos: timestamp("processarApos").notNull(),
  status: mysqlEnum("status", ["pendente", "processando", "processado", "erro"]).default("pendente").notNull(),
  processandoEm: timestamp("processandoEm"),
  processadoEm: timestamp("processadoEm"),
  ultimoErro: text("ultimoErro"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  conversaUnica: uniqueIndex("agentes_agrupamentos_conversa_unica_idx").on(table.conversaId),
  filaIdx: index("agentes_agrupamentos_fila_idx").on(table.status, table.processarApos),
}));
export type AgenteAgrupamentoMensagem = typeof agentesAgrupamentosMensagens.$inferSelect;
export type InsertAgenteAgrupamentoMensagem = typeof agentesAgrupamentosMensagens.$inferInsert;

/** Sugestões geradas para avaliação explícita do consultor. */
export const agentesSugestoes = mysqlTable("agentes_sugestoes", {
  id: int("id").autoincrement().primaryKey(),
  execucaoId: int("execucaoId").notNull(),
  agenteId: int("agenteId").notNull(),
  conversaId: int("conversaId").notNull(),
  sugestao: text("sugestao").notNull(),
  contexto: json("contexto").$type<{ ultimaMensagem: string; nomeContato?: string | null; unidadeId?: number | null }>(),
  statusAgente: varchar("statusAgente", { length: 64 }),
  variaveis: json("variaveis").$type<Record<string, unknown>>(),
  acaoPendente: varchar("acaoPendente", { length: 128 }),
  // "obsoleta" não é uma rejeição humana: registra uma sugestão descartada
  // porque uma mensagem posterior do mesmo cliente substituiu o contexto.
  avaliacao: mysqlEnum("avaliacao", ["pendente", "aprovada", "reprovada", "obsoleta"]).default("pendente").notNull(),
  tipoRevisao: mysqlEnum("tipoRevisao", ["aceita_como_esta", "editada", "rejeitada", "substituida_por_contexto", "expirada"]),
  textoFinal: text("textoFinal"),
  motivoAvaliacao: mysqlEnum("motivoAvaliacao", ["informacao", "tom", "roteamento", "contexto", "comercial", "operacional", "outro"]),
  comentarioAvaliacao: text("comentarioAvaliacao"),
  avaliadaPorUserId: int("avaliadaPorUserId"),
  avaliadaPorAtendenteId: int("avaliadaPorAtendenteId"),
  avaliadaEm: timestamp("avaliadaEm"),
  enviadaEm: timestamp("enviadaEm"),
  enviadaAutomaticamente: boolean("enviadaAutomaticamente").default(false).notNull(),
  erroEnvio: text("erroEnvio"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  execucaoUnica: uniqueIndex("agentes_sugestoes_execucao_idx").on(table.execucaoId),
  filaIdx: index("agentes_sugestoes_fila_idx").on(table.avaliacao, table.enviadaEm, table.createdAt),
  agenteCriadaIdx: index("agentes_sugestoes_agente_criada_idx").on(table.agenteId, table.createdAt),
  conversaIdx: index("agentes_sugestoes_conversa_idx").on(table.conversaId),
}));
export type AgenteSugestao = typeof agentesSugestoes.$inferSelect;

/**
 * Lote 2 do plano de qualidade dos agentes (proposto pelo Manus, 28/08):
 * casos reais de regressão, extraídos de erros já observados. Cada caso
 * referencia uma conversa REAL e um corte de data/hora — o contexto é
 * reconstruído a partir das mensagens de verdade até aquele ponto (ver
 * agentesDb.obterContextoConversa com ateDataHora), sem depender de
 * fabricar uma conversa sintética à mão.
 */
export const agentesCasosRegressao = mysqlTable("agentes_casos_regressao", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 200 }).notNull(),
  chaveAgente: mysqlEnum("chaveAgente", ["bianca", "fabricia", "estela", "carol", "diana"]).notNull(),
  conversaId: int("conversaId").notNull(),
  ateDataHora: timestamp("ateDataHora").notNull(),
  // Frases que a sugestão NUNCA pode conter (checagem por substring, case-insensitive).
  regrasProibidas: json("regrasProibidas").$type<string[]>().notNull(),
  // Quando true, a única resposta aceitável é a saída silenciosa (message vazio).
  mensagemDeveSerVazia: boolean("mensagemDeveSerVazia").default(false).notNull(),
  descricaoEsperada: text("descricaoEsperada"),
  ativo: boolean("ativo").default(true).notNull(),
  criadoPorUserId: int("criadoPorUserId"),
  criadoPorNome: varchar("criadoPorNome", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  ativoIdx: index("agentes_casos_regressao_ativo_idx").on(table.ativo),
}));
export type AgenteCasoRegressao = typeof agentesCasosRegressao.$inferSelect;
export type InsertAgenteCasoRegressao = typeof agentesCasosRegressao.$inferInsert;

export const agentesRegressaoExecucoes = mysqlTable("agentes_regressao_execucoes", {
  id: int("id").autoincrement().primaryKey(),
  casoId: int("casoId").notNull(),
  executadoEm: timestamp("executadoEm").defaultNow().notNull(),
  promptVersao: int("promptVersao"),
  mensagem: text("mensagem"),
  status: varchar("status", { length: 32 }),
  summary: text("summary"),
  violacoes: json("violacoes").$type<string[]>(),
  erro: text("erro"),
  notaHumana: int("notaHumana"),
  comentarioHumano: text("comentarioHumano"),
  avaliadoPorUserId: int("avaliadoPorUserId"),
  avaliadoPorNome: varchar("avaliadoPorNome", { length: 120 }),
  avaliadoEm: timestamp("avaliadoEm"),
}, (table) => ({
  casoExecutadoIdx: index("agentes_regressao_execucoes_caso_idx").on(table.casoId, table.executadoEm),
}));
export type AgenteRegressaoExecucao = typeof agentesRegressaoExecucoes.$inferSelect;
export type InsertAgenteRegressaoExecucao = typeof agentesRegressaoExecucoes.$inferInsert;

/**
 * Rastreia quais arquivos de `drizzle/*.sql` já foram aplicados no banco
 * compartilhado — histórico ficava só na memória de quem aplicou (ver
 * migrações "IF NOT EXISTS" adicionadas depois de mais de uma quebra por
 * coluna faltando em produção, 2026-08-29/30). A própria tabela é criada
 * sob demanda pelo runner (server/migracoesRunner.ts), não depende de
 * alguém rodar essa migração manualmente primeiro.
 */
export const migracoesAplicadas = mysqlTable("_migracoes_aplicadas", {
  id: int("id").autoincrement().primaryKey(),
  nomeArquivo: varchar("nomeArquivo", { length: 255 }).notNull(),
  aplicadaEm: timestamp("aplicadaEm").defaultNow().notNull(),
  aplicadaPorUserId: int("aplicadaPorUserId"),
  aplicadaPorNome: varchar("aplicadaPorNome", { length: 200 }),
  apenasRegistrada: boolean("apenasRegistrada").default(false).notNull(),
}, (table) => ({
  nomeArquivoIdx: uniqueIndex("migracoes_aplicadas_nome_idx").on(table.nomeArquivo),
}));
export type MigracaoAplicada = typeof migracoesAplicadas.$inferSelect;
export type InsertAgenteSugestao = typeof agentesSugestoes.$inferInsert;
