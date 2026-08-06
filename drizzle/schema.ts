import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, json, decimal, datetime, index, bigint } from "drizzle-orm/mysql-core";

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

/**
 * Conversas de WhatsApp (Inbox). Dois canais: zapi (uma instância por
 * unidade) e buddha_mkt (API oficial WhatsApp Cloud, conta única para
 * as duas unidades — unidadeId fica null até ser resolvida via cliente
 * Belle).
 */
export const inboxConversas = mysqlTable("inbox_conversas", {
  id: int("id").autoincrement().primaryKey(),
  unidadeId: int("unidadeId"),
  canal: mysqlEnum("canal", ["zapi", "buddha_mkt"]).notNull(),
  telefone: varchar("telefone", { length: 30 }).notNull(),
  nomeContato: varchar("nomeContato", { length: 256 }),
  clienteBelleCodigo: int("clienteBelleCodigo"),
  status: mysqlEnum("status", ["aberta", "encerrada"]).default("aberta").notNull(),
  naoLidas: int("naoLidas").default(0).notNull(),
  ultimaMensagemEm: timestamp("ultimaMensagemEm"),
  ultimaMensagemTexto: text("ultimaMensagemTexto"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  telefoneCanalIdx: index("inbox_conversas_telefone_canal_idx").on(table.telefone, table.canal),
  unidadeIdx: index("inbox_conversas_unidade_idx").on(table.unidadeId),
}));

export type InboxConversa = typeof inboxConversas.$inferSelect;
export type InsertInboxConversa = typeof inboxConversas.$inferInsert;

/**
 * Mensagens trocadas dentro de uma conversa do Inbox.
 */
export const inboxMensagens = mysqlTable("inbox_mensagens", {
  id: int("id").autoincrement().primaryKey(),
  conversaId: int("conversaId").notNull(),
  direcao: mysqlEnum("direcao", ["recebida", "enviada"]).notNull(),
  tipo: mysqlEnum("tipo", ["texto", "imagem", "audio", "documento", "sistema"]).notNull(),
  conteudo: text("conteudo"),
  metadados: text("metadados"),
  transcricao: text("transcricao"),
  enviadaPorUserId: int("enviadaPorUserId"),
  lida: mysqlEnum("lida", ["true", "false"]).default("false").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
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
  tipo: mysqlEnum("tipo", ["inter_oauth", "manual"]).default("manual").notNull(),
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
  origem: mysqlEnum("origem", ["inter", "csv", "pdf", "ofx"]).default("inter").notNull(),
  dreCategoriaId: int("dreCategoriaId"), // null = pendente (ainda não categorizado)
  // pendente = sem categoria; sugerida = regra bateu sozinha, ainda não
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
  tipo: varchar("tipo", { length: 64 }), // Débito/Crédito/Pix/Pagamento Instantâneo — texto livre, varia por adquirente
  status: varchar("status", { length: 64 }), // Pago/Em Processamento/Cancelado — texto livre
  parcela: varchar("parcela", { length: 8 }), // "1/3"
  bandeira: varchar("bandeira", { length: 32 }), // Mastercard/Visa/Elo/Pix
  valorBruto: decimal("valorBruto", { precision: 12, scale: 2 }),
  valorTaxa: decimal("valorTaxa", { precision: 12, scale: 2 }),
  valorAntecipacao: decimal("valorAntecipacao", { precision: 12, scale: 2 }),
  valorLiquido: decimal("valorLiquido", { precision: 12, scale: 2 }),
  dataPagamento: varchar("dataPagamento", { length: 10 }), // AAAA-MM-DD — quando o valor efetivamente cai na conta
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
}, (table) => ({
  unidadeDataIdx: index("adquirente_vendas_unidade_data_idx").on(table.unidadeId, table.dataHora),
  dedupIdx: index("adquirente_vendas_dedup_idx").on(table.adquirente, table.idTransacaoExterno, table.parcela),
}));

export type AdquirenteVenda = typeof adquirenteVendas.$inferSelect;
export type InsertAdquirenteVenda = typeof adquirenteVendas.$inferInsert;

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
 * Regras de categorização automática: se `padrao` aparece (case-
 * insensitive) no histórico+descrição da transação, sugere
 * `dreCategoriaId`. Fica em tabela (não hardcoded) pra dar pra adicionar
 * regra nova sem deploy — mesmo espírito da planilha antiga, mas sem
 * ficar preso a fórmula quebrada.
 */
export const dreRegras = mysqlTable("dre_regras", {
  id: int("id").autoincrement().primaryKey(),
  // Rótulo legível pra essa regra específica (ex.: "Escritório de
  // advocacia Herdade Martini") — null = mostra o nome da categoria
  // como fallback. Diferente do padrão (texto técnico de match) e da
  // categoria (agrupa várias regras); a descrição esclarece o caso.
  descricao: varchar("descricao", { length: 256 }),
  padrao: varchar("padrao", { length: 256 }).notNull(),
  dreCategoriaId: int("dreCategoriaId").notNull(),
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
