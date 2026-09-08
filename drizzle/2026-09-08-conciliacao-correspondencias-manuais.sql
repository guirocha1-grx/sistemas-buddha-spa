-- Correção manual de item da Comanda pra Conciliação PDV Fase 3
-- (Terapeutas) — quando o casamento automático por nome não acha o
-- atendimento certo no Belle (ou acha o errado), a recepção escolhe à
-- mão. belleAtendimentoId NULL = "confirmado manualmente que não tem
-- correspondência mesmo".
CREATE TABLE `conciliacao_correspondencias_manuais` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `comandaItemId` INT NOT NULL,
  `belleAtendimentoId` INT NULL,
  `criadoPorUserId` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `conciliacao_correspondencias_comanda_item_idx` (`comandaItemId`)
);
