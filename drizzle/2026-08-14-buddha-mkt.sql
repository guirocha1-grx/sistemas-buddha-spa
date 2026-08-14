ALTER TABLE unidades
  MODIFY COLUMN codEstab INT NULL,
  ADD COLUMN canal ENUM('zapi', 'buddha_mkt') NOT NULL DEFAULT 'zapi';

ALTER TABLE inbox_conversas
  ADD COLUMN buddhaMktAlertadoEm TIMESTAMP NULL;

ALTER TABLE fluxo_nos
  ADD COLUMN enviados INT NOT NULL DEFAULT 0;

CREATE TABLE fluxo_no_opcao_cliques (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fluxoNoId INT NOT NULL,
  opcaoIndex INT NOT NULL,
  cliques INT NOT NULL DEFAULT 0,
  UNIQUE KEY fluxo_no_opcao_cliques_unico (fluxoNoId, opcaoIndex)
);

CREATE TABLE buddha_mkt_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(512) NOT NULL,
  idioma VARCHAR(10) NOT NULL DEFAULT 'pt_BR',
  categoria ENUM('MARKETING', 'UTILITY') NOT NULL DEFAULT 'MARKETING',
  corpo TEXT NOT NULL,
  cabecalho VARCHAR(60),
  rodape VARCHAR(60),
  botoes JSON,
  metaTemplateId VARCHAR(64),
  status ENUM('rascunho', 'pendente', 'aprovado', 'rejeitado') NOT NULL DEFAULT 'rascunho',
  motivoRejeicao TEXT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE disparos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  templateId INT NOT NULL,
  fluxoRespostaId INT NULL,
  status ENUM('rascunho', 'enviando', 'concluido', 'erro') NOT NULL DEFAULT 'rascunho',
  totalDestinatarios INT NOT NULL DEFAULT 0,
  totalEnviados INT NOT NULL DEFAULT 0,
  totalErros INT NOT NULL DEFAULT 0,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  iniciadoEm TIMESTAMP NULL,
  concluidoEm TIMESTAMP NULL
);

CREATE TABLE disparo_destinatarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  disparoId INT NOT NULL,
  clienteId INT NOT NULL,
  telefone VARCHAR(20) NOT NULL,
  status ENUM('pendente', 'enviado', 'erro') NOT NULL DEFAULT 'pendente',
  erroMsg TEXT,
  enviadoEm TIMESTAMP NULL,
  INDEX disparo_destinatarios_disparo_idx (disparoId)
);
