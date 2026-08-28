-- Liberações de terapias por terapeuta e unidade.
-- Migration aditiva: não altera nem remove dados existentes.
-- IF NOT EXISTS mantém a migração segura quando a tabela foi aplicada manualmente
-- com a mesma estrutura antes do código desta seção chegar ao repositório.
CREATE TABLE IF NOT EXISTS terapeutas_liberacoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unidadeId INT NOT NULL,
  terapeutaId INT NOT NULL,
  servicoCodigo INT NOT NULL,
  servicoNome VARCHAR(250) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX terapeutas_liberacoes_unidade_terapeuta_servico_idx (unidadeId, terapeutaId, servicoCodigo),
  INDEX terapeutas_liberacoes_unidade_terapeuta_idx (unidadeId, terapeutaId)
);
