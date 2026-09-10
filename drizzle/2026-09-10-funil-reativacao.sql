-- Funil de Reativação (2026-09-10) — preset salvo de filtros (mesmo
-- construtor da Segmentação de Disparos) + etapa por cliente/unidade.
CREATE TABLE `funis_reativacao` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `unidadeId` INT NOT NULL,
  `nome` VARCHAR(120) NOT NULL,
  `filtros` TEXT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `funis_reativacao_unidade_idx` (`unidadeId`)
);

CREATE TABLE `reativacao_status` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `clienteId` INT NOT NULL,
  `unidadeId` INT NOT NULL,
  `status` ENUM('inativo', 'mensagem_enviada', 'qualificado', 'agendado', 'atendido') NOT NULL DEFAULT 'inativo',
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `reativacao_status_cliente_unidade_idx` (`clienteId`, `unidadeId`)
);
