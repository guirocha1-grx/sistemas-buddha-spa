-- Identidade WhatsApp e fila durável de eventos operacionais.
-- Migration aditiva: não altera nem remove dados existentes.
ALTER TABLE `atendimentos_operacional`
  ADD COLUMN `terapeutaId` INT NULL;

ALTER TABLE `terapeutas`
  ADD COLUMN `whatsappParticipanteId` VARCHAR(100) NULL;

ALTER TABLE `inbox_mensagens`
  ADD COLUMN `participanteLid` VARCHAR(100) NULL;

CREATE TABLE `atendimento_tempo_eventos` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `unidadeId` INT NOT NULL,
  `conversaId` INT NULL,
  `mensagemId` INT NULL,
  `zapiMessageId` VARCHAR(100) NULL,
  `evento` ENUM('inicio', 'fim') NOT NULL,
  `participanteTelefone` VARCHAR(30) NULL,
  `participanteLid` VARCHAR(100) NULL,
  `participanteNome` VARCHAR(200) NULL,
  `conteudo` TEXT NULL,
  `ocorridoEm` TIMESTAMP NOT NULL,
  `atendimentoBelleId` INT NULL,
  `status` ENUM('pendente', 'associado', 'ambigua') NOT NULL DEFAULT 'pendente',
  `motivo` VARCHAR(250) NULL,
  `processadoEm` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `atendimento_tempo_eventos_zapi_message_idx` (`zapiMessageId`),
  UNIQUE KEY `atendimento_tempo_eventos_mensagem_idx` (`mensagemId`),
  KEY `atendimento_tempo_eventos_pendentes_idx` (`unidadeId`, `status`, `createdAt`),
  KEY `atendimento_tempo_eventos_atendimento_idx` (`unidadeId`, `atendimentoBelleId`)
);
