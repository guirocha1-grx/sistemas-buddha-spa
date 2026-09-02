-- inbox_mensagens não tinha nenhum índice além da chave primária —
-- toda consulta de mensagens de uma conversa (WHERE conversaId = ?
-- ORDER BY createdAt) fazia varredura completa da tabela. Já são
-- 14 mil+ linhas crescendo todo dia, com essa consulta rodando a cada
-- abertura de conversa e refazendo a cada 8s enquanto ela fica aberta.
-- schema.ts já declarava esse índice (drizzle/schema.ts, inboxMensagens)
-- mas a migração nunca tinha sido criada/aplicada -- mesmo nome aqui.
ALTER TABLE `inbox_mensagens`
  ADD INDEX `inbox_mensagens_conversa_created_idx` (`conversaId`, `createdAt`);
