CREATE TABLE `lancamentos_manuais_dre` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `unidadeId` INT NOT NULL,
  `dreDescricaoId` INT NOT NULL,
  `mesReferencia` VARCHAR(7) NOT NULL,
  `valor` DECIMAL(12,2) NOT NULL,
  `observacao` VARCHAR(256),
  `criadoPor` VARCHAR(256),
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX `lancamentos_manuais_dre_unidade_mes_idx` ON `lancamentos_manuais_dre` (`unidadeId`, `mesReferencia`);
