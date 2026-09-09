-- Achado 2026-09-10: DRE (Ribeirão Shopping, agosto/2026, regime
-- caixa) mostrava Receita Bruta R$4.110,19 a mais que o real. Causa:
-- 6 lançamentos "Crédito domicílio cartão" / "Cartão De Débito -
-- Inter Pag" em inter_extratos (o depósito bancário do repasse do
-- InterPag) foram categorizados manualmente como "Receita Cartão de
-- Débito" (id 52, a Descrição de valor BRUTO, só deveria vir de
-- adquirente_vendas) em vez de "Receita Líq. Cartão de Débito" (id
-- 30001, secao=excluido, é a Descrição certa pro depósito líquido no
-- banco — nome muito parecido, troca fácil no dropdown). Resultado:
-- a venda contava 2x no DRE (bruto via adquirente_vendas + esse
-- depósito via inter_extratos), mas só 1x na Conciliação PDV Fase 1
-- (que nunca lê Débito/Crédito de inter_extratos, só de
-- adquirente_vendas — por isso Fase 1 batia e o DRE não).
--
-- Confirmado: são as ÚNICAS linhas em todo o banco com
-- dreDescricaoId apontando pra Receita Cartão de Débito/Crédito
-- diretamente em inter_extratos (nunca deveria acontecer, por
-- desenho — daí o WHERE genérico por chave, não só por id).
UPDATE `inter_extratos`
SET `dreDescricaoId` = (SELECT id FROM `dre_descricoes` WHERE `chave` = 'receita_liq_c_debito' LIMIT 1)
WHERE `dreDescricaoId` = (SELECT id FROM `dre_descricoes` WHERE `chave` = 'receita_c_debito' LIMIT 1);

UPDATE `inter_extratos`
SET `dreDescricaoId` = (SELECT id FROM `dre_descricoes` WHERE `chave` = 'receita_liq_c_credito' LIMIT 1)
WHERE `dreDescricaoId` = (SELECT id FROM `dre_descricoes` WHERE `chave` = 'receita_c_credito' LIMIT 1);
