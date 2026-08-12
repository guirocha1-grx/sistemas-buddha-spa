import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, decimal, datetime, index, bigint, boolean } from "drizzle-orm/mysql-core";

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
 * Unidades do Buddha Spa — Shopping Santa Úrsula e Ribeirão Shopping.
 * codEstab é o código usado pela API do Belle Software.
 */
export const unidades = mysqlTable("unidades", {
  id: int("id").autoincrement().primaryKey(),
  nome: varchar("nome", { length: 128 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  codEstab: int("codEstab").notNull(),
  belleToken: text("belleToken"),
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
}, (table) => ({
  telefoneCanalIdx: index("inbox_conversas_telefone_canal_idx").on(table.telefone, table.canal),
  unidadeIdx: index("inbox_conversas_unidade_idx").on(table.unidadeId),
  chatLidIdx: index("inbox_conversas_chat_lid_idx").on(table.chatLid),
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
  // messageId devolvido pela Z-API ao enviar pelo CRM — usado só pra
  // deduplicar contra o webhook fromMe (recepção respondendo direto
  // pelo app do WhatsApp Business, fora do CRM). Própria do
  // buddha-spa, migração 2026-08-11-inbox-zapi-message-id.sql.
  zapiMessageId: varchar("zapiMessageId", { length: 100 }),
}, (table) => ({
  conversaCreatedIdx: index("inbox_mensagens_conversa_created_idx").on(table.conversaId, table.createdAt),
}));

export type InboxMensagem = typeof inboxMensagens.$inferSelect;
export type InsertInboxMensagem = typeof inboxMensagens.$inferInsert;

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
  tipo: mysqlEnum("tipo", ["inter_oauth", "sicredi_oauth", "manual", "cartao_credito"]).default("manual").notNull(),
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
 * linha (cliente, terapia, terapeuta, forma de pagamento). Alimenta só
 * o drill-down (hover) da linha "Comanda (Recepção)" na tela de Comanda
 * Recepção (2026-08-09) — o número agregado ali continua vindo de
 * comanda_diaria, sem mudança; esta tabela é uma camada de auditoria
 * por cima, não substitui nada.
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
 * Biblioteca de mensagens prontas do Inbox (mesmo conceito do
 * "Mensagens e Scripts" do mobai-crm) — agrupadas por categoriaScript
 * livre (texto, não FK — evita precisar de uma tabela de categorias só
 * pra isso; a lista de categorias visível na UI vem de um DISTINCT).
 * Exclusão é soft (ativo=false) pra não quebrar scriptsUso histórico.
 */
export const scripts = mysqlTable("scripts", {
  id: int("id").autoincrement().primaryKey(),
  categoriaScript: varchar("categoriaScript", { length: 100 }).notNull(),
  script: text("script").notNull(),
  observacoes: text("observacoes"),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
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

