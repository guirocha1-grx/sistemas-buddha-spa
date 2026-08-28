CREATE TABLE `confirmacao_pagamentos_consultas` (
  `id` INT AUTO_INCREMENT NOT NULL,
  `unidadeId` INT NOT NULL,
  `fonte` ENUM('pix_inter', 'links_mercado_pago') NOT NULL,
  `consultaEm` TIMESTAMP NOT NULL,
  `dataInicio` VARCHAR(10) NOT NULL,
  `dataFim` VARCHAR(10) NOT NULL,
  `totalConsultado` INT NOT NULL,
  `novasVendas` INT,
  `pagamentos` JSON NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `confirmacao_pagamentos_consultas_unidade_fonte_idx` (`unidadeId`, `fonte`)
);
