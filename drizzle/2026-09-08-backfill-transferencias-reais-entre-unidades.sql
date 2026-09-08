-- Backfill: transações já confirmadas com a Descrição "Transação entre
-- Unidades" que nunca geraram linha em transacoes_entre_unidades porque
-- foram categorizadas pelo seletor manual (categorizarManual), não pelo
-- botão de confirmar sugestão (confirmarSugestao) — a geração da linha
-- só existia dentro de confirmarSugestao antes do fix em server/db.ts.
-- Achado real 2026-09-08: tela "Transações entre Unidades" só mostrava o
-- rateio de despesa manual, nenhuma transferência bancária real.
--
-- Só 2 unidades operacionais participam dessa conciliação (1 = Shopping
-- Santa Úrsula, 2 = Ribeirão Shopping), por isso o CASE fixo em vez de
-- casar por CNPJ (mais simples e evita repetir os problemas de sintaxe
-- das migrações anteriores).
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
WHERE ie.`dreDescricaoId` = (SELECT `id` FROM `dre_descricoes` WHERE `chave` = 'transacao_entre_unidades' LIMIT 1)
  AND ie.`tipoOperacao` = 'D'
  AND ie.`categorizacaoStatus` = 'confirmada'
  AND ie.`unidadeId` IN (1, 2)
  AND NOT EXISTS (SELECT 1 FROM `transacoes_entre_unidades` t WHERE t.`interExtratoId` = ie.`id`);
