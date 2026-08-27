-- Origem da venda é dado prospectivo. Esta migração não faz UPDATE nem
-- backfill: os registros existentes permanecem NULL para não receberem
-- classificação retroativa sem o payload de origem preservado.
ALTER TABLE `adquirente_vendas`
  ADD COLUMN `origemPagamento` ENUM('link_pagamento', 'maquininha_point', 'online', 'indefinido') NULL AFTER `bandeira`;
