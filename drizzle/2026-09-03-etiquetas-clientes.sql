-- Etiqueta manual de cliente (2026-09-03) — base pro construtor de
-- segmentação de Disparos: filtrar por algo que não vem do Belle
-- (ex.: "veio pelo Instagram"), junto com unidade, dias desde a
-- última visita, terapia já feita e quantidade de atendimentos.
CREATE TABLE `etiquetas` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nome` VARCHAR(60) NOT NULL,
  `cor` VARCHAR(20) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `etiquetas_nome_unique` (`nome`)
);

CREATE TABLE `cliente_etiquetas` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `clienteId` INT NOT NULL,
  `etiquetaId` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `cliente_etiquetas_cliente_etiqueta_idx` (`clienteId`, `etiquetaId`),
  KEY `cliente_etiquetas_etiqueta_idx` (`etiquetaId`)
);
