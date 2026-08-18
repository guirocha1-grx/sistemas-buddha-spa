-- Identidade por PIN da recepção (atendentes), distinta da conta
-- Google/Manus compartilhada usada pra logar no computador. Roda uma
-- vez, em produção, via webdev_execute_sql.

CREATE TABLE atendentes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unidadeId INT NOT NULL,
  nome VARCHAR(100) NOT NULL,
  pinHash VARCHAR(255) NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX atendentes_unidade_idx ON atendentes (unidadeId);

CREATE TABLE atendente_sessoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(64) NOT NULL UNIQUE,
  atendenteId INT NOT NULL,
  expiraEm TIMESTAMP NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX atendente_sessoes_token_idx ON atendente_sessoes (token);

ALTER TABLE audit_log
  ADD COLUMN atendenteId INT NULL,
  ADD COLUMN atendenteNome VARCHAR(100) NULL;

CREATE INDEX audit_log_atendente_created_idx ON audit_log (atendenteId, createdAt);

ALTER TABLE inbox_mensagens
  ADD COLUMN enviadaPorAtendenteId INT NULL;
