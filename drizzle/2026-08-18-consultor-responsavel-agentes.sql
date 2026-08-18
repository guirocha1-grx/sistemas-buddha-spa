ALTER TABLE `inbox_conversas` ADD COLUMN `atendenteResponsavelId` int;
CREATE INDEX `inbox_conversas_atendente_responsavel_idx` ON `inbox_conversas` (`atendenteResponsavelId`);
