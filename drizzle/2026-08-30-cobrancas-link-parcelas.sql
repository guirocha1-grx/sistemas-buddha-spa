-- Máximo de parcelas oferecido no checkout de cada Link de cobrança.
ALTER TABLE `cobrancas_link`
  ADD COLUMN IF NOT EXISTS `parcelas` INT NOT NULL DEFAULT 1;

ALTER TABLE `cobrancas_link_modelos`
  ADD COLUMN IF NOT EXISTS `parcelas` INT NOT NULL DEFAULT 1;
