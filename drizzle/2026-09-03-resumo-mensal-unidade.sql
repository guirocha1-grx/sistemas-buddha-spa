-- Histórico mensal por unidade, importado da planilha "Contabilidade
-- SSU e RBS" (aba "Resumos" + aba "Metas") -- alimenta a nova seção
-- "Visão mês a mês" dentro de Financeiro.
CREATE TABLE `resumo_mensal_unidade` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `unidadeId` INT NOT NULL,
  `mesAno` VARCHAR(7) NOT NULL,
  `totalRecebidoCaixa` DECIMAL(12,2),
  `voucherSite` DECIMAL(12,2),
  `gympassTotalpass` DECIMAL(12,2),
  `faturamentoTotal` DECIMAL(12,2),
  `atendimentosSemPlano` INT,
  `atendimentosComPlano` INT,
  `totalAtendimentos` INT,
  `planos` INT,
  `metaFaturamento` DECIMAL(12,2),
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `resumo_mensal_unidade_unidade_mes_unq` (`unidadeId`, `mesAno`)
);
