ALTER TABLE `agentes_prompt_versoes` ADD COLUMN `unidadeId` int;
ALTER TABLE `agentes_execucoes` ADD COLUMN `promptReceptorId` int;
ALTER TABLE `agentes_execucoes` ADD COLUMN `promptEspecialistaId` int;
ALTER TABLE `agentes_execucoes` ADD COLUMN `rastro` json;
ALTER TABLE `agentes_sugestoes` ADD COLUMN `statusAgente` varchar(64);
ALTER TABLE `agentes_sugestoes` ADD COLUMN `variaveis` json;
ALTER TABLE `agentes_sugestoes` ADD COLUMN `acaoPendente` varchar(128);
ALTER TABLE `agentes_sugestoes` ADD COLUMN `motivoAvaliacao` enum('informacao','tom','roteamento','contexto','comercial','operacional','outro');

CREATE TABLE `agentes_configuracoes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `agenteId` int NOT NULL,
  `unidadeId` int NOT NULL,
  `ativo` boolean NOT NULL DEFAULT true,
  `modoOperacao` enum('assistido','automatico') NOT NULL DEFAULT 'assistido',
  `modelo` varchar(80) NOT NULL DEFAULT 'gpt-5-mini',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `agentes_configuracoes_id` PRIMARY KEY(`id`),
  CONSTRAINT `agentes_configuracoes_agente_unidade_idx` UNIQUE(`agenteId`,`unidadeId`)
);
CREATE INDEX `agentes_configuracoes_unidade_ativo_idx` ON `agentes_configuracoes` (`unidadeId`,`ativo`);

CREATE TABLE `agentes_conversas` (
  `id` int AUTO_INCREMENT NOT NULL,
  `conversaId` int NOT NULL,
  `unidadeId` int NOT NULL,
  `agenteAtualId` int,
  `proximaRota` varchar(64),
  `etapa` varchar(96),
  `resumo` text,
  `variaveis` json,
  `tentativasQualificacao` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `agentes_conversas_id` PRIMARY KEY(`id`),
  CONSTRAINT `agentes_conversas_conversa_idx` UNIQUE(`conversaId`)
);
CREATE INDEX `agentes_conversas_unidade_atual_idx` ON `agentes_conversas` (`unidadeId`,`agenteAtualId`);

CREATE TABLE `agentes_recursos` (
  `id` int AUTO_INCREMENT NOT NULL,
  `unidadeId` int NOT NULL,
  `chave` varchar(96) NOT NULL,
  `tipo` enum('preco','promocao','conteudo','midia','modelo_voucher') NOT NULL,
  `titulo` varchar(256) NOT NULL,
  `conteudo` text,
  `url` text,
  `vigenciaInicio` timestamp,
  `vigenciaFim` timestamp,
  `ativo` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `agentes_recursos_id` PRIMARY KEY(`id`),
  CONSTRAINT `agentes_recursos_unidade_chave_idx` UNIQUE(`unidadeId`,`chave`)
);
CREATE INDEX `agentes_recursos_unidade_tipo_ativo_idx` ON `agentes_recursos` (`unidadeId`,`tipo`,`ativo`);

CREATE TABLE `agentes_acoes_conversa` (
  `id` int AUTO_INCREMENT NOT NULL,
  `conversaId` int NOT NULL,
  `chaveAcao` varchar(128) NOT NULL,
  `sugestaoId` int,
  `executadaEm` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `agentes_acoes_conversa_id` PRIMARY KEY(`id`),
  CONSTRAINT `agentes_acoes_conversa_conversa_acao_idx` UNIQUE(`conversaId`,`chaveAcao`)
);
