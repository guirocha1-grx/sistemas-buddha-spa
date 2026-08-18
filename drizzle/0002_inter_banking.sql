-- Migration: adiciona campos de integração Banco Inter na tabela unidades
-- e cria tabela inter_extratos para armazenar transações sincronizadas

ALTER TABLE `unidades`
  ADD COLUMN `interClientId` text,
  ADD COLUMN `interClientSecret` text,
  ADD COLUMN `interContaCorrente` varchar(20),
  ADD COLUMN `interAccessToken` text,
  ADD COLUMN `interTokenExpiresAt` bigint;
--> statement-breakpoint

CREATE TABLE `inter_extratos` (
  `id` int AUTO_INCREMENT NOT NULL,
  `unidadeId` int NOT NULL,
  `idTransacao` varchar(128),
  `dataEntrada` varchar(10) NOT NULL,
  `dataTransacao` varchar(10),
  `tipoTransacao` varchar(64),
  `tipoOperacao` enum('D','C') NOT NULL,
  `valor` decimal(12,2) NOT NULL,
  `titulo` varchar(256),
  `descricao` text,
  `detalhe` text,
  `nomeOrigem` varchar(256),
  `nomeDestino` varchar(256),
  `cpfCnpjOrigem` varchar(20),
  `cpfCnpjDestino` varchar(20),
  `cpmf` varchar(64),
  `syncedAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `inter_extratos_id` PRIMARY KEY(`id`),
  INDEX `inter_extratos_unidade_data_idx` (`unidadeId`, `dataEntrada`),
  INDEX `inter_extratos_id_transacao_idx` (`idTransacao`)
);
