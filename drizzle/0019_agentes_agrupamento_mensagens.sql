CREATE TABLE IF NOT EXISTS `agentes_agrupamentos_mensagens` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `conversaId` INT NOT NULL,
  `unidadeId` INT NOT NULL,
  `primeiraMensagemId` INT NOT NULL,
  `ultimaMensagemId` INT NOT NULL,
  `versao` INT NOT NULL DEFAULT 1,
  `processarApos` TIMESTAMP NOT NULL,
  `status` ENUM('pendente', 'processando', 'processado', 'erro') NOT NULL DEFAULT 'pendente',
  `processandoEm` TIMESTAMP NULL,
  `processadoEm` TIMESTAMP NULL,
  `ultimoErro` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `agentes_agrupamentos_conversa_unica_idx` (`conversaId`),
  KEY `agentes_agrupamentos_fila_idx` (`status`, `processarApos`)
);
