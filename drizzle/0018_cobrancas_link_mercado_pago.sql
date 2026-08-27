-- Cobrança individual por Link Mercado Pago. Não altera movimentos financeiros
-- históricos nem cria cobranças: apenas estrutura operacional vazia.
ALTER TABLE unidades ADD COLUMN mpWebhookUrl TEXT NULL;
ALTER TABLE unidades ADD COLUMN mpWebhookSecret TEXT NULL;

CREATE TABLE cobrancas_link (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unidadeId INT NOT NULL,
  conversaId INT NOT NULL,
  clienteId INT NULL,
  clienteNome VARCHAR(200) NOT NULL,
  responsavelUserId INT NOT NULL,
  responsavelAtendenteId INT NULL,
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT NULL,
  valor DECIMAL(12,2) NOT NULL,
  formaPagamentoInformada VARCHAR(80) NULL,
  status ENUM('rascunho','criada','enviada','pendente','aprovada','rejeitada','cancelada','expirada','erro') NOT NULL DEFAULT 'rascunho',
  preferenceId VARCHAR(160) NULL,
  initPoint TEXT NULL,
  externalReference VARCHAR(160) NOT NULL,
  chaveAberta VARCHAR(100) NULL,
  paymentId VARCHAR(80) NULL,
  paymentStatus VARCHAR(80) NULL,
  paymentStatusDetail VARCHAR(160) NULL,
  pagadorNome VARCHAR(200) NULL,
  pagadorEmail VARCHAR(320) NULL,
  paymentApprovedAt TIMESTAMP NULL,
  criadaEm TIMESTAMP NULL,
  enviadaEm TIMESTAMP NULL,
  ultimoWebhookEm TIMESTAMP NULL,
  ultimoWebhookAcao VARCHAR(100) NULL,
  webhookAssinaturaValida BOOLEAN NOT NULL DEFAULT FALSE,
  alertaCriadoEm TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY cobrancas_link_chave_aberta_unique (chaveAberta),
  UNIQUE KEY cobrancas_link_external_reference_idx (externalReference),
  INDEX cobrancas_link_unidade_status_idx (unidadeId, status),
  INDEX cobrancas_link_conversa_idx (conversaId),
  INDEX cobrancas_link_payment_idx (paymentId)
);

CREATE TABLE cobrancas_link_modelos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unidadeId INT NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  descricao TEXT NULL,
  valor DECIMAL(12,2) NOT NULL,
  formaPagamentoInformada VARCHAR(80) NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ordem INT NOT NULL DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX cobrancas_link_modelos_unidade_ativo_ordem_idx (unidadeId, ativo, ordem)
);
