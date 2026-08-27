CREATE TABLE `clientes_preferencias_terapeuta` (
  `id` int AUTO_INCREMENT NOT NULL,
  `clienteId` int NOT NULL,
  `unidadeId` int NOT NULL,
  `terapeutaId` int,
  `terapeutaNome` varchar(200),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `clientes_pref_terapeuta_cliente_unidade_idx` UNIQUE(`clienteId`,`unidadeId`),
  KEY `clientes_pref_terapeuta_unidade_idx` (`unidadeId`)
);

CREATE TABLE `chamados_parametros` (
  `id` int AUTO_INCREMENT NOT NULL,
  `unidadeId` int NOT NULL,
  `tipo` enum('aguardando','sala','taa') NOT NULL,
  `nome` varchar(200) NOT NULL,
  `descricao` varchar(300),
  `ordem` int NOT NULL DEFAULT 0,
  `ativo` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `chamados_parametros_unidade_tipo_ordem_idx` (`unidadeId`,`tipo`,`ordem`)
);
