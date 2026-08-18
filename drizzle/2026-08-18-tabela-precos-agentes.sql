CREATE TABLE `agentes_tabela_precos` (
  `id` int AUTO_INCREMENT NOT NULL,
  `unidadeId` int NOT NULL,
  `servico` varchar(200) NOT NULL,
  `categoria` varchar(80) NOT NULL,
  `duracaoMinutos` int,
  `precoSemana` decimal(10,2) NOT NULL,
  `precoDomingo` decimal(10,2),
  `ativo` boolean NOT NULL DEFAULT true,
  `origem` varchar(120) DEFAULT 'Tabela administrativa',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `agentes_tabela_precos_id` PRIMARY KEY(`id`),
  CONSTRAINT `agentes_tabela_precos_unidade_servico_idx` UNIQUE(`unidadeId`,`servico`)
);
CREATE INDEX `agentes_tabela_precos_unidade_categoria_idx` ON `agentes_tabela_precos` (`unidadeId`,`categoria`);
