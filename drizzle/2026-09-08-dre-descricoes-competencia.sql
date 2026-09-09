-- Regime de competência por categoria (não por transação) — toda
-- transação categorizada com essa Descrição, de qualquer origem
-- (Inter, Sicredi, Caixa Físico, CSV/OFX), conta pro mês do próprio
-- lançamento ou pro mês anterior. Default mantém o comportamento atual
-- (mês do próprio lançamento) pra toda Descrição já existente.
ALTER TABLE `dre_descricoes`
  ADD COLUMN `competencia` ENUM('mes_lancamento','mes_anterior') NOT NULL DEFAULT 'mes_lancamento';
