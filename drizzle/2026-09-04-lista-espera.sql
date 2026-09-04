-- Lista de espera por dia (2026-09-04) — sessão do dia lotado. Plano ativo é
-- calculado na hora (Belle), não guardado aqui, pra nunca ficar desatualizado.
CREATE TABLE `lista_espera` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `unidadeId` INT NOT NULL,
  `clienteId` INT NOT NULL,
  `conversaId` INT NULL,
  `data` VARCHAR(10) NOT NULL,
  `horarioDesejado` VARCHAR(60) NULL,
  `terapiaDesejada` VARCHAR(250) NULL,
  `status` ENUM('aguardando', 'convertido', 'cancelado') NOT NULL DEFAULT 'aguardando',
  `criadoPorUserId` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `lista_espera_unidade_data_status_idx` (`unidadeId`, `data`, `status`)
);
