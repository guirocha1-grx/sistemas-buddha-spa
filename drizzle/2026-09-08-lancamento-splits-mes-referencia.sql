-- Mês de competência ("AAAA-MM") por linha de split — permite ratear
-- uma transação (ex.: licença anual de software) em várias linhas, cada
-- uma contando pro DRE de um mês diferente. Backfill via subquery
-- correlacionada (não JOIN multi-tabela) — evita os problemas de
-- sintaxe já encontrados neste TiDB com DELETE/UPDATE multi-tabela.
ALTER TABLE `lancamento_splits`
  ADD COLUMN `mesReferencia` VARCHAR(7) NULL;

UPDATE `lancamento_splits`
SET `mesReferencia` = (
  SELECT LEFT(ie.`dataEntrada`, 7) FROM `inter_extratos` ie WHERE ie.`id` = `lancamento_splits`.`interExtratoId`
)
WHERE `mesReferencia` IS NULL;

ALTER TABLE `lancamento_splits`
  MODIFY COLUMN `mesReferencia` VARCHAR(7) NOT NULL;

ALTER TABLE `lancamento_splits`
  ADD INDEX `lancamento_splits_mes_referencia_idx` (`mesReferencia`);
