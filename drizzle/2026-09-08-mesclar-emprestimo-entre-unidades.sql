-- Decisão do usuário 2026-09-08: unificar "Transação entre Unidades"
-- (id 90004, tem a chave usada por confirmarSugestao/categorizarManual
-- pra gerar a linha em transacoes_entre_unidades) e "Empréstimo entre
-- unidades" (id 57, categoria solta, sem chave) numa só — mesma coisa
-- na prática (dinheiro circulando entre as unidades), duas categorias só
-- confundiam. Mantém o id 90004 (é o que o código reconhece) e renomeia.

-- 1) Renomeia a Descrição que sobrevive.
UPDATE `dre_descricoes` SET `nome` = 'Empréstimo entre Unidades' WHERE `id` = 90004;

-- 2) Migra os lançamentos já categorizados como "Empréstimo entre
--    unidades" (id 57) pra a Descrição unificada.
UPDATE `inter_extratos` SET `dreDescricaoId` = 90004 WHERE `dreDescricaoId` = 57;

-- 3) Migra as regras de categorização automática que apontavam pro id
--    antigo ("Pix Agama", "Pix Satori") — senão elas voltam a sugerir
--    uma Descrição que não existe mais.
UPDATE `dre_regras` SET `dreDescricaoId` = 90004 WHERE `dreDescricaoId` = 57;

-- 4) Remove a Descrição antiga, já sem nenhuma referência.
DELETE FROM `dre_descricoes` WHERE `id` = 57;

-- 5) Backfill: qualquer lançamento de saída (D) já confirmado como
--    "Empréstimo entre Unidades" (incluindo os que acabaram de ser
--    migrados no passo 2) que ainda não tem linha correspondente em
--    transacoes_entre_unidades. Mesma lógica da migração anterior
--    (2026-09-08-backfill-transferencias-reais-entre-unidades.sql),
--    repetida aqui porque agora há lançamentos novos qualificando.
INSERT INTO `transacoes_entre_unidades` (`data`, `tipo`, `unidadeCredora`, `unidadeDevedora`, `valor`, `descricao`, `interExtratoId`)
SELECT
  ie.`dataEntrada`,
  'transferencia_real',
  ie.`unidadeId`,
  CASE WHEN ie.`unidadeId` = 1 THEN 2 ELSE 1 END,
  ie.`valor`,
  COALESCE(NULLIF(ie.`titulo`, ''), 'Transferência entre unidades'),
  ie.`id`
FROM `inter_extratos` ie
WHERE ie.`dreDescricaoId` = 90004
  AND ie.`tipoOperacao` = 'D'
  AND ie.`categorizacaoStatus` = 'confirmada'
  AND ie.`unidadeId` IN (1, 2)
  AND NOT EXISTS (SELECT 1 FROM `transacoes_entre_unidades` t WHERE t.`interExtratoId` = ie.`id`);
