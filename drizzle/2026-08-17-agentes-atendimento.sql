CREATE TABLE `agentes_atendimento` (
  `id` int AUTO_INCREMENT NOT NULL,
  `chave` varchar(64) NOT NULL,
  `nome` varchar(120) NOT NULL,
  `descricao` text,
  `tipo` enum('receptor','especialista') NOT NULL,
  `ativo` boolean NOT NULL DEFAULT true,
  `modoOperacao` enum('assistido','automatico') NOT NULL DEFAULT 'assistido',
  `modelo` varchar(80) NOT NULL DEFAULT 'gpt-5-mini',
  `ordem` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `agentes_atendimento_id` PRIMARY KEY(`id`),
  CONSTRAINT `agentes_atendimento_chave_unique` UNIQUE(`chave`)
);
-->
CREATE INDEX `agentes_atendimento_tipo_ativo_idx` ON `agentes_atendimento` (`tipo`,`ativo`);
-->
CREATE TABLE `agentes_prompt_versoes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `agenteId` int NOT NULL,
  `versao` int NOT NULL,
  `conteudo` text NOT NULL,
  `status` enum('rascunho','ativo','arquivado') NOT NULL DEFAULT 'rascunho',
  `criadoPorUserId` int,
  `criadoPorNome` varchar(120),
  `ativadoEm` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `agentes_prompt_versoes_id` PRIMARY KEY(`id`),
  CONSTRAINT `agentes_prompt_versoes_agente_versao_idx` UNIQUE(`agenteId`,`versao`)
);
-->
CREATE INDEX `agentes_prompt_versoes_agente_status_idx` ON `agentes_prompt_versoes` (`agenteId`,`status`);
-->
CREATE TABLE `agentes_execucoes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `conversaId` int NOT NULL,
  `mensagemEntradaId` int NOT NULL,
  `agenteReceptorId` int,
  `agenteEspecialistaId` int,
  `classificacao` varchar(64),
  `confianca` int,
  `status` enum('pendente','concluida','ignorada','erro') NOT NULL DEFAULT 'pendente',
  `erroMsg` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `concludedAt` timestamp NULL,
  CONSTRAINT `agentes_execucoes_id` PRIMARY KEY(`id`),
  CONSTRAINT `agentes_execucoes_mensagem_entrada_idx` UNIQUE(`mensagemEntradaId`)
);
-->
CREATE INDEX `agentes_execucoes_conversa_criada_idx` ON `agentes_execucoes` (`conversaId`,`createdAt`);
-->
CREATE INDEX `agentes_execucoes_especialista_idx` ON `agentes_execucoes` (`agenteEspecialistaId`);
-->
CREATE TABLE `agentes_sugestoes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `execucaoId` int NOT NULL,
  `agenteId` int NOT NULL,
  `conversaId` int NOT NULL,
  `sugestao` text NOT NULL,
  `contexto` json,
  `avaliacao` enum('pendente','aprovada','reprovada') NOT NULL DEFAULT 'pendente',
  `comentarioAvaliacao` text,
  `avaliadaPorUserId` int,
  `avaliadaPorAtendenteId` int,
  `avaliadaEm` timestamp NULL,
  `enviadaEm` timestamp NULL,
  `enviadaAutomaticamente` boolean NOT NULL DEFAULT false,
  `erroEnvio` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `agentes_sugestoes_id` PRIMARY KEY(`id`),
  CONSTRAINT `agentes_sugestoes_execucao_idx` UNIQUE(`execucaoId`)
);
-->
CREATE INDEX `agentes_sugestoes_fila_idx` ON `agentes_sugestoes` (`avaliacao`,`enviadaEm`,`createdAt`);
-->
CREATE INDEX `agentes_sugestoes_agente_criada_idx` ON `agentes_sugestoes` (`agenteId`,`createdAt`);
-->
CREATE INDEX `agentes_sugestoes_conversa_idx` ON `agentes_sugestoes` (`conversaId`);
