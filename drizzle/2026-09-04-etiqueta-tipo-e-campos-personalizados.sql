-- Fase 1 do pedido "diferenciar etiqueta de recepção vs de sistema, e poder
-- criar campo numérico" (2026-09-04). tipo default 'manual' preserva as
-- etiquetas já existentes como estavam.
ALTER TABLE `etiquetas`
  ADD COLUMN `tipo` ENUM('manual', 'sistema') NOT NULL DEFAULT 'manual';

CREATE TABLE `campos_personalizados` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nome` VARCHAR(60) NOT NULL,
  `tipo` ENUM('numero') NOT NULL DEFAULT 'numero',
  `descricao` VARCHAR(300) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `campos_personalizados_nome_unique` (`nome`)
);

CREATE TABLE `cliente_campos_valores` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `clienteId` INT NOT NULL,
  `campoId` INT NOT NULL,
  `valorNumero` DECIMAL(14, 2) NULL,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `cliente_campos_valores_cliente_campo_idx` (`clienteId`, `campoId`),
  KEY `cliente_campos_valores_campo_idx` (`campoId`)
);
