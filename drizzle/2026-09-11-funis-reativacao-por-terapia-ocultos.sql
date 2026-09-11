-- Grupo "por terapia" (2026-09-11) e mecanismo de ocultar item de grupo virtual.
ALTER TABLE `funis_reativacao`
  MODIFY COLUMN `grupo` ENUM('estrategica', 'por_terapeuta', 'por_data', 'por_terapia') NOT NULL DEFAULT 'estrategica';

CREATE TABLE `funis_reativacao_ocultos` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `unidadeId` INT NOT NULL,
  `grupo` ENUM('por_terapeuta', 'por_data', 'por_terapia') NOT NULL,
  `itemId` VARCHAR(255) NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `funis_reativacao_ocultos_unico_idx` (`unidadeId`, `grupo`, `itemId`)
);
