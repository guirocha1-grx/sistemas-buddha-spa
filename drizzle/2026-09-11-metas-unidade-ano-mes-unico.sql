-- `metas` já existia sem índice único em (unidadeId, ano, mes) — upsertMeta
-- usava onDuplicateKeyUpdate contra isso, mas sem o índice único nunca
-- colidia de verdade, então cada "atualização" criava uma linha nova em
-- vez de substituir a do mês. Necessário pra Reativação usar essa tabela
-- como meta mensal de faturamento (composição da meta de contatos).
ALTER TABLE `metas` ADD UNIQUE KEY `metas_unidade_ano_mes_idx` (`unidadeId`, `ano`, `mes`);
