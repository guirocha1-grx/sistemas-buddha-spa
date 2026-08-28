ALTER TABLE `agentes_execucoes`
  ADD COLUMN `intencao` varchar(64) NULL;

ALTER TABLE `agentes_execucoes`
  ADD COLUMN `detalheIntencao` varchar(320) NULL;

ALTER TABLE `agentes_execucoes`
  ADD COLUMN `origemIntencao` varchar(32) NULL;

CREATE INDEX `agentes_execucoes_intencao_criada_idx`
  ON `agentes_execucoes` (`intencao`, `createdAt`);
