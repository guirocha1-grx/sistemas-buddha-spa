-- `syncedAt` só era setado no insert e nunca mais tocado — um re-sync
-- que corrigia o valor de uma linha existente (Caixa Físico, Sicredi/
-- Inter reimportado) não deixava rastro de quando isso aconteceu de
-- verdade. Investigando um atraso real de sincronização (2026-09-03),
-- ficou impossível saber se uma linha antiga tinha sido atualizada
-- hoje ou não. Troca por createdAt/updatedAt (mesmo padrão do resto do
-- schema), com updatedAt em ON UPDATE CURRENT_TIMESTAMP — atualiza
-- sozinho em qualquer UPDATE, mesmo que o código não seja explícito
-- nisso.
ALTER TABLE `inter_extratos`
  CHANGE COLUMN `syncedAt` `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE `inter_extratos`
  ADD COLUMN `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `createdAt`;
