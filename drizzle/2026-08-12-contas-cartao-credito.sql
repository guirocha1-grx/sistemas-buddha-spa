ALTER TABLE `contas` MODIFY COLUMN `tipo` ENUM('inter_oauth', 'sicredi_oauth', 'manual', 'cartao_credito') NOT NULL DEFAULT 'manual';
