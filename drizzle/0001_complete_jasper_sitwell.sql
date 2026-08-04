CREATE TABLE `configuracoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chave` varchar(128) NOT NULL,
	`valor` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `configuracoes_id` PRIMARY KEY(`id`),
	CONSTRAINT `configuracoes_chave_unique` UNIQUE(`chave`)
);
--> statement-breakpoint
CREATE TABLE `copilotConversas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unidadeId` int NOT NULL,
	`userId` int,
	`clienteCpf` varchar(20),
	`clienteNome` varchar(256),
	`mensagens` json,
	`status` enum('ativa','encerrada') NOT NULL DEFAULT 'ativa',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `copilotConversas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `laminas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unidadeId` int NOT NULL,
	`titulo` varchar(256) NOT NULL,
	`template` varchar(64) NOT NULL,
	`conteudo` json,
	`imagemUrl` text,
	`status` enum('rascunho','pronto','publicado') NOT NULL DEFAULT 'rascunho',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `laminas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unidadeId` int NOT NULL,
	`nome` varchar(256) NOT NULL,
	`celular` varchar(32),
	`email` varchar(320),
	`cpf` varchar(20),
	`dataNascimento` varchar(20),
	`genero` varchar(32),
	`profissao` varchar(128),
	`observacao` text,
	`tipoOrigem` varchar(64),
	`codOrigem` varchar(64),
	`belleCodigo` int,
	`statusEnvioBelle` enum('pendente','enviado','erro') NOT NULL DEFAULT 'pendente',
	`erroBelle` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `metas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unidadeId` int NOT NULL,
	`mes` int NOT NULL,
	`ano` int NOT NULL,
	`valorFaturamento` decimal(12,2),
	`valorRecebimento` decimal(12,2),
	`numAgendamentos` int,
	`numNovosClientes` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `metas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `syncLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unidadeId` int NOT NULL,
	`tipo` varchar(64) NOT NULL,
	`status` enum('sucesso','erro','parcial') NOT NULL,
	`registrosProcessados` int NOT NULL DEFAULT 0,
	`detalhes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `syncLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `unidades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(128) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`codEstab` int NOT NULL,
	`belleToken` text,
	`corTema` varchar(32),
	`ativa` enum('true','false') NOT NULL DEFAULT 'true',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `unidades_id` PRIMARY KEY(`id`),
	CONSTRAINT `unidades_slug_unique` UNIQUE(`slug`)
);
