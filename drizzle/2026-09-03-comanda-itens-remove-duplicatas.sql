-- upsertComandaItens (server/db.ts) decidia "já existe essa linha?" com
-- um SELECT no início do upsert -- se a mesma sincronização rodasse de
-- novo antes do insert anterior aparecer nesse SELECT (retry automático
-- do "Sincronizar tudo" depois de 1 dia falhar por rate limit no meio
-- de ~30 chamadas ao Google Sheets), a checagem não via a linha recém-
-- criada e inseria de novo. Achado real (2026-09-03): toda linha de
-- comanda_itens desde o início (27/07/2026) estava duplicada 2x, dobrando
-- o valor da "Comanda (Recepção)" mostrado na Conciliação PDV.
--
-- Remove a duplicata mais antiga de cada par (mantém a de updatedAt mais
-- recente -- reflete a leitura mais atual da planilha; em empate, o id
-- maior) antes de criar o índice único que impede isso de acontecer de
-- novo.
DELETE ci1 FROM `comanda_itens` ci1
INNER JOIN `comanda_itens` ci2
  ON ci1.`unidadeId` = ci2.`unidadeId`
  AND ci1.`data` = ci2.`data`
  AND ci1.`idLinha` = ci2.`idLinha`
  AND (ci1.`updatedAt` < ci2.`updatedAt` OR (ci1.`updatedAt` = ci2.`updatedAt` AND ci1.`id` < ci2.`id`));

ALTER TABLE `comanda_itens`
  ADD UNIQUE INDEX `comanda_itens_unidade_data_idlinha_unq` (`unidadeId`, `data`, `idLinha`);
