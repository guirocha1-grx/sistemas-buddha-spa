-- Reverte o bug introduzido pela migração de backfill anterior
-- (2026-09-09): 20 vendas Pix da Interpag/Granito (jul-ago/2026,
-- R$6.337,00 no total) foram classificadas como "Receita de Pix" pelo
-- reprocessamento, mas Pix da Interpag/Granito NUNCA deveria entrar em
-- adquirente_vendas com Descrição — o depósito já chega certinho no
-- extrato bancário (inter_extratos), contar os dois duplica a venda
-- (mesma exclusão que upsertAdquirenteVendas sempre aplicou em venda
-- nova). Essas 20 linhas só existiam sem classificação porque eram
-- anteriores a essa exclusão existir; o reprocessamento não sabia
-- disso e reativou a duplicidade. Volta pra NULL (nunca vai ser
-- reclassificada de novo — server/db.ts já foi corrigido também).
UPDATE `adquirente_vendas`
SET `dreDescricaoId` = NULL
WHERE `adquirente` = 'interpag'
  AND `dreDescricaoId` = (SELECT id FROM `dre_descricoes` WHERE `chave` = 'receita_pix' LIMIT 1);
