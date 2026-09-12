-- Meta diária de contatos e conversão do Funil de Reativação (2026-09-11).
CREATE TABLE `reativacao_contatos` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `unidadeId` INT NOT NULL,
  `atendenteId` INT NOT NULL,
  `clienteId` INT NOT NULL,
  `funilOrigem` VARCHAR(200) NULL,
  `data` VARCHAR(10) NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `reativacao_contatos_unico_idx` (`atendenteId`, `clienteId`, `data`),
  KEY `reativacao_contatos_unidade_data_idx` (`unidadeId`, `data`)
);

CREATE TABLE `reativacao_metas` (
  `unidadeId` INT PRIMARY KEY,
  `metaDiaria` INT NOT NULL DEFAULT 0,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
