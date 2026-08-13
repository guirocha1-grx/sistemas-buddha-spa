-- Controle de acesso por unidade, eixo independente do controle por
-- módulo/sub-seção que já existe (permissoes_modulo/permissoes_subsecao).
-- unidadesCustomizadas=false (padrão) = conta vê todas as unidades,
-- igual sempre foi.
ALTER TABLE users
  ADD COLUMN unidadesCustomizadas BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE permissoes_unidade (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  unidadeId INT NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX permissoes_unidade_user_idx (userId)
);
