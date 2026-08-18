CREATE TABLE `adquirente_vendas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unidadeId` int NOT NULL,
	`adquirente` enum('mercadopago','interpag') NOT NULL,
	`idTransacaoExterno` varchar(128) NOT NULL,
	`dataHora` varchar(19) NOT NULL,
	`tipo` text,
	`status` varchar(64),
	`parcela` varchar(8),
	`bandeira` varchar(32),
	`valorBruto` decimal(12,2),
	`valorTaxa` decimal(12,2),
	`valorAntecipacao` decimal(12,2),
	`valorLiquido` decimal(12,2),
	`dataPagamento` varchar(10),
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `adquirente_vendas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `caixa_fisico` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unidadeId` int NOT NULL,
	`data` varchar(10) NOT NULL,
	`tipoOperacao` enum('C','D') NOT NULL,
	`ocorrencia` varchar(256) NOT NULL,
	`valor` decimal(12,2) NOT NULL,
	`saldo` decimal(12,2),
	`conferidoPor` varchar(256),
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `caixa_fisico_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unidadeId` int NOT NULL,
	`nome` varchar(128) NOT NULL,
	`tipo` enum('inter_oauth','manual') NOT NULL DEFAULT 'manual',
	`agencia` varchar(20),
	`numeroConta` varchar(20),
	`cnpj` varchar(20),
	`saldoInicial` decimal(12,2),
	`saldoInicialEm` varchar(10),
	`saldoImportado` decimal(12,2),
	`saldoImportadoEm` varchar(10),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dre_categorias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(128) NOT NULL,
	`secao` enum('receitas','impostos','custos_diretos','despesas_pessoal','marketing','despesas_administrativas','despesas_financeiras','devolucoes','excluido') NOT NULL,
	`ordem` int NOT NULL DEFAULT 0,
	CONSTRAINT `dre_categorias_id` PRIMARY KEY(`id`),
	CONSTRAINT `dre_categorias_nome_unique` UNIQUE(`nome`)
);
--> statement-breakpoint
CREATE TABLE `dre_regras` (
	`id` int AUTO_INCREMENT NOT NULL,
	`descricao` varchar(256),
	`padrao` varchar(256) NOT NULL,
	`dreCategoriaId` int NOT NULL,
	`valorMin` decimal(12,2),
	`valorMax` decimal(12,2),
	`alertaSeRepetirNoMes` enum('true','false') NOT NULL DEFAULT 'false',
	`origem` enum('seed','aprendida','manual') NOT NULL DEFAULT 'aprendida',
	`ativa` enum('true','false') NOT NULL DEFAULT 'true',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `dre_regras_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inbox_conversas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unidadeId` int,
	`canal` enum('zapi','buddha_mkt') NOT NULL,
	`telefone` varchar(30) NOT NULL,
	`nomeContato` varchar(256),
	`clienteBelleCodigo` int,
	`status` enum('aberta','encerrada') NOT NULL DEFAULT 'aberta',
	`naoLidas` int NOT NULL DEFAULT 0,
	`ultimaMensagemEm` timestamp,
	`ultimaMensagemTexto` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inbox_conversas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inbox_mensagens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversaId` int NOT NULL,
	`direcao` enum('recebida','enviada') NOT NULL,
	`tipo` enum('texto','imagem','audio','documento','sistema') NOT NULL,
	`conteudo` text,
	`metadados` text,
	`transcricao` text,
	`enviadaPorUserId` int,
	`lida` enum('true','false') NOT NULL DEFAULT 'false',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inbox_mensagens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inter_extratos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`unidadeId` int NOT NULL,
	`contaId` int,
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
	`contaOrigem` varchar(32),
	`contaDestino` varchar(32),
	`cpmf` varchar(64),
	`origem` enum('inter','csv','pdf','ofx','mercadopago') NOT NULL DEFAULT 'inter',
	`dreCategoriaId` int,
	`categorizacaoStatus` enum('pendente','sugerida','confirmada') NOT NULL DEFAULT 'pendente',
	`nota` text,
	`alerta` text,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inter_extratos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `unidades` ADD `zapiInstanceId` text;--> statement-breakpoint
ALTER TABLE `unidades` ADD `zapiToken` text;--> statement-breakpoint
ALTER TABLE `unidades` ADD `zapiClientToken` text;--> statement-breakpoint
ALTER TABLE `unidades` ADD `interClientId` text;--> statement-breakpoint
ALTER TABLE `unidades` ADD `interClientSecret` text;--> statement-breakpoint
ALTER TABLE `unidades` ADD `interCertificado` text;--> statement-breakpoint
ALTER TABLE `unidades` ADD `interChavePrivada` text;--> statement-breakpoint
ALTER TABLE `unidades` ADD `interContaCorrente` varchar(20);--> statement-breakpoint
ALTER TABLE `unidades` ADD `interAccessToken` text;--> statement-breakpoint
ALTER TABLE `unidades` ADD `interTokenExpiresAt` bigint;--> statement-breakpoint
ALTER TABLE `unidades` ADD `mpAccessToken` text;--> statement-breakpoint
CREATE INDEX `adquirente_vendas_unidade_data_idx` ON `adquirente_vendas` (`unidadeId`,`dataHora`);--> statement-breakpoint
CREATE INDEX `adquirente_vendas_dedup_idx` ON `adquirente_vendas` (`adquirente`,`idTransacaoExterno`,`parcela`);--> statement-breakpoint
CREATE INDEX `contas_unidade_idx` ON `contas` (`unidadeId`);--> statement-breakpoint
CREATE INDEX `dre_categorias_secao_idx` ON `dre_categorias` (`secao`);--> statement-breakpoint
CREATE INDEX `inbox_conversas_telefone_canal_idx` ON `inbox_conversas` (`telefone`,`canal`);--> statement-breakpoint
CREATE INDEX `inbox_conversas_unidade_idx` ON `inbox_conversas` (`unidadeId`);--> statement-breakpoint
CREATE INDEX `inbox_mensagens_conversa_created_idx` ON `inbox_mensagens` (`conversaId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `inter_extratos_unidade_data_idx` ON `inter_extratos` (`unidadeId`,`dataEntrada`);--> statement-breakpoint
CREATE INDEX `inter_extratos_id_transacao_idx` ON `inter_extratos` (`idTransacao`);