-- Controle de acesso por sub-seção (um nível abaixo de permissoes_modulo)
-- — ver shared/subsecoes.ts. Hoje só Financeiro tem sub-seções
-- (Visão Geral/Contas/Comanda Recepção/Adquirentes/Parâmetros).

CREATE TABLE permissoes_subsecao (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  subsecao VARCHAR(60) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX permissoes_subsecao_user_idx ON permissoes_subsecao (userId);
