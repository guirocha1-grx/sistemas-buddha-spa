CREATE TABLE atendimentos_operacional (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unidadeId INT NOT NULL,
  atendimentoBelleId INT NOT NULL,
  terapeutaNome VARCHAR(100) NULL,
  sala VARCHAR(200) NULL,
  removidoEm TIMESTAMP NULL,
  removidoPorUserId INT NULL,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX atendimentos_operacional_unidade_atendimento_idx (unidadeId, atendimentoBelleId),
  INDEX atendimentos_operacional_unidade_removido_idx (unidadeId, removidoEm)
);
