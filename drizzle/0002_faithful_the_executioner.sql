CREATE TABLE `alertas_qualificacao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clienteId` int NOT NULL,
	`atendimentoId` int,
	`conversaId` int NOT NULL,
	`consultorId` int NOT NULL,
	`gestorId` int,
	`tipo` enum('solicitacao_previa','deteccao_ia','edicao_manual') NOT NULL,
	`campos` text,
	`justificativa` text,
	`status` enum('pendente','aprovada','invalida') NOT NULL DEFAULT 'pendente',
	`resolvidoPor` int,
	`resolvidoEm` timestamp,
	`ultimoLembreteEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alertas_qualificacao_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `atendimentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`clienteId` int NOT NULL,
	`agenteId` int,
	`unidadeId` int,
	`tipoAtendimento` enum('contato_inicial','follow_up','negociacao','venda_concretizada','pos_venda','reativacao','oferta_indireta','outro') NOT NULL,
	`tipoContato` enum('whatsapp','ligacao','email','presencial','outro') DEFAULT 'whatsapp',
	`dataAtendimento` timestamp NOT NULL DEFAULT (now()),
	`observacoes` text,
	`resultado` enum('positivo','neutro','negativo','sem_resposta') DEFAULT 'neutro',
	`proxContato` date,
	`proxContatoTipo` varchar(80),
	`statusAtendimentoNew` int,
	`motivoPerda` varchar(200),
	`dataPerdido` timestamp,
	`servicoNome` varchar(200),
	`valorFechado` decimal(12,2),
	`semResposta` boolean NOT NULL DEFAULT false,
	`ativo` boolean NOT NULL DEFAULT true,
	`venda_celebrada_em` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `atendimentos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`userNome` varchar(100),
	`userRole` varchar(20),
	`procedure` varchar(150) NOT NULL,
	`origem` enum('manual','ia','sistema') NOT NULL DEFAULT 'manual',
	`clienteId` int,
	`inputResumo` text,
	`sucesso` boolean NOT NULL DEFAULT true,
	`erroMsg` text,
	`duracaoMs` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `clientes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tipo` enum('F','J') NOT NULL DEFAULT 'F',
	`nome` varchar(200) NOT NULL,
	`nomeFantasia` varchar(200),
	`sexo` enum('M','F','O'),
	`dataNascimento` date,
	`cpfCnpj` varchar(20),
	`telefone` varchar(30),
	`celular` varchar(30),
	`email` varchar(320),
	`endereco` varchar(200),
	`numeroEnd` varchar(20),
	`complemento` varchar(100),
	`bairro` varchar(100),
	`cidade` varchar(100),
	`uf` varchar(2),
	`cep` varchar(10),
	`canalCaptacao` varchar(100),
	`campanha` varchar(200),
	`leadScore` int DEFAULT 0,
	`engajamento` enum('Alto','Medio','Baixo'),
	`engajamento_manual` boolean NOT NULL DEFAULT false,
	`tipoCliente` enum('lead','cliente') DEFAULT 'lead',
	`tagClienteVip` boolean DEFAULT false,
	`tagFrequente` boolean DEFAULT false,
	`tagPremium` boolean DEFAULT false,
	`tagAniversariante` boolean DEFAULT false,
	`tagReativacao` boolean DEFAULT false,
	`observacoesGerais` text,
	`discPerfil` enum('D','I','S','C'),
	`discObservacoes` text,
	`dicasAtendimento` text,
	`codBelle` varchar(20),
	`unidadeId` int,
	`agenteCodigo` int,
	`dispensadoPor` int,
	`motivoDispensa` enum('nunca_interagiu','parou_interacao','sem_interesse','dados_invalidos','duplicado','outro'),
	`statusCliente` enum('ativo','inativo','trash') NOT NULL DEFAULT 'ativo',
	`qualificacao_celebrada_em` timestamp,
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `clientes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fase_venda` (
	`codFase` int NOT NULL,
	`faseVenda` varchar(120) NOT NULL,
	`classificacaoFase` varchar(60),
	`idClassificacao` int,
	`kanbanColuna` varchar(60),
	`controle` varchar(10),
	`proximoContato` int DEFAULT 1,
	`formulario` int DEFAULT 1,
	`ativo` boolean NOT NULL DEFAULT true,
	CONSTRAINT `fase_venda_codFase` PRIMARY KEY(`codFase`)
);
--> statement-breakpoint
CREATE TABLE `inbox_conversas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`telefone` varchar(30) NOT NULL,
	`nomeContato` varchar(200),
	`fotoUrl` text,
	`clienteId` int,
	`unidadeId` int,
	`status` enum('aberta','aguardando','respondida','encerrada') NOT NULL DEFAULT 'aberta',
	`ultimaMensagemEm` timestamp NOT NULL DEFAULT (now()),
	`ultimaMensagemTexto` text,
	`naoLidas` int NOT NULL DEFAULT 0,
	`etiquetas` text,
	`resumo_conversa` text,
	`resumo_atualizado_em` timestamp,
	`total_mensagens_processadas` int DEFAULT 0,
	`msgs_since_analise` int NOT NULL DEFAULT 0,
	`ctwa_clid` varchar(500),
	`ad_source_id` varchar(100),
	`ad_source_url` text,
	`ad_titulo` varchar(300),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inbox_conversas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inbox_mensagens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversaId` int NOT NULL,
	`direcao` enum('recebida','enviada') NOT NULL,
	`tipo` enum('texto','audio','imagem','documento','sistema','misto') NOT NULL DEFAULT 'texto',
	`conteudo` text,
	`metadados` text,
	`lida` boolean NOT NULL DEFAULT false,
	`enviadaPorUserId` int,
	`enviadaPorIa` boolean NOT NULL DEFAULT false,
	`sugestaoIa` text,
	`replyToId` int,
	`replyToTexto` text,
	`transcricao` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inbox_mensagens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scripts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoriaScript` varchar(100) NOT NULL,
	`script` text NOT NULL,
	`observacoes` text,
	`itemQualificacaoId` varchar(30),
	`ativo` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scripts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scripts_uso` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scriptId` int NOT NULL,
	`userId` int NOT NULL,
	`usadoEm` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scripts_uso_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tarefas_dia` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`tipo` enum('contato_programado','contato_atrasado','aniversario','retorno_cliente') NOT NULL,
	`referenciaId` int,
	`titulo` varchar(300) NOT NULL,
	`data` date NOT NULL,
	`feita` boolean NOT NULL DEFAULT false,
	`feitaEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tarefas_dia_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tipo_classificacao` (
	`id` int AUTO_INCREMENT NOT NULL,
	`classificacao` varchar(100) NOT NULL,
	`ativo` boolean NOT NULL DEFAULT true,
	CONSTRAINT `tipo_classificacao_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','gerente','consultor','suporte') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `nome_exibicao` varchar(50);--> statement-breakpoint
ALTER TABLE `users` ADD `assinar_mensagens` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `celular` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `gerenteId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `ativo` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `ia_inbox_ativo` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `ia_scripts_ativo` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `acesso_inbox_mobile` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `acesso_financeiro` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `unidadeId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `estilo_copiloto` text;--> statement-breakpoint
CREATE INDEX `audit_log_user_created_idx` ON `audit_log` (`userId`,`createdAt`);