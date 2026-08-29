-- Relatório "Registros Financeiros" do Belle (import manual) — usado
-- na Conciliação PDV Fase 2 (Comanda x Belle).
CREATE TABLE IF NOT EXISTS `belle_registros_financeiros` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `unidadeId` INT NOT NULL,
  `codigo` BIGINT NOT NULL,
  `dataLancamento` VARCHAR(10) NOT NULL,
  `clienteNome` VARCHAR(200),
  `valor` DECIMAL(12,2) NOT NULL,
  `formaPagamento` VARCHAR(40) NOT NULL,
  `atendimentoBelleId` BIGINT,
  `observacao` VARCHAR(300),
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `belle_registros_financeiros_unidade_codigo_idx` (`unidadeId`, `codigo`),
  KEY `belle_registros_financeiros_unidade_data_idx` (`unidadeId`, `dataLancamento`)
);
