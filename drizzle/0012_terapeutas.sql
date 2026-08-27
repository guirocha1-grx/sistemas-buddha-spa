-- Cadastro de terapeutas por unidade (2026-08-26).
-- Aplicado manualmente ao TiDB porque a geração Drizzle detectou uma
-- ambiguidade preexistente e não relacionada entre tabelas legadas.
CREATE TABLE terapeutas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unidadeId INT NOT NULL,
  nomeCompleto VARCHAR(200) NOT NULL,
  nomeAbreviado VARCHAR(100) NOT NULL,
  celular VARCHAR(20),
  cpf VARCHAR(14),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX terapeutas_unidade_idx (unidadeId),
  UNIQUE INDEX terapeutas_cpf_idx (cpf)
);
