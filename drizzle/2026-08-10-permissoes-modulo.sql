-- Controle de acesso por módulo, por usuário (2026-08-10). Roda uma
-- vez, em produção, via webdev_execute_sql.

ALTER TABLE users
  ADD COLUMN permissoesCustomizadas BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE permissoes_modulo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  modulo VARCHAR(40) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX permissoes_modulo_user_idx ON permissoes_modulo (userId);
