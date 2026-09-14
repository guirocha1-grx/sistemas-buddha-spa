-- Achado real (2026-09-14, cliente "Leticia Franco de Souza" aparecendo em
-- 2 caixinhas no Inbox): `inbox_conversas` tinha um índice em
-- (telefone, canal), mas não ÚNICO — quando 2 mensagens do mesmo cliente
-- chegavam quase juntas, 2 requisições concorrentes faziam "existe
-- conversa? não, então cria" ao mesmo tempo e nenhuma via a outra a
-- tempo — cada uma criava sua própria linha. Achado 13 pares duplicados
-- na base inteira (26 conversas), não só esse cliente.
--
-- Esta migração: (1) mescla cada par na conversa mais antiga (keeper),
-- reapontando o histórico das ~11 tabelas que referenciam conversaId,
-- soma não-lidas e mantém a mensagem mais recente das duas; (2) apaga as
-- 13 duplicatas; (3) adiciona o índice único que impede isso de
-- acontecer de novo (o código que já usa upsertInboxConversa, em
-- server/db.ts, já busca por telefone+canal antes de criar — só faltava
-- o banco garantir isso de forma atômica).
--
-- Ordem importa: reaponta tudo primeiro (enquanto a linha duplicada
-- ainda existe pra identificar os pares), só depois apaga as duplicatas,
-- só depois adiciona o índice único.

-- ===== 1) Tabelas sem risco de colisão (várias linhas por conversa) =====

UPDATE inbox_mensagens t
JOIN (SELECT c1.id AS keeper_id, c2.id AS loser_id FROM inbox_conversas c1 JOIN inbox_conversas c2 ON c1.telefone = c2.telefone AND c1.canal = c2.canal AND c1.id < c2.id) p ON p.loser_id = t.conversaId
SET t.conversaId = p.keeper_id;

UPDATE cobrancas_link t
JOIN (SELECT c1.id AS keeper_id, c2.id AS loser_id FROM inbox_conversas c1 JOIN inbox_conversas c2 ON c1.telefone = c2.telefone AND c1.canal = c2.canal AND c1.id < c2.id) p ON p.loser_id = t.conversaId
SET t.conversaId = p.keeper_id;

UPDATE lista_espera t
JOIN (SELECT c1.id AS keeper_id, c2.id AS loser_id FROM inbox_conversas c1 JOIN inbox_conversas c2 ON c1.telefone = c2.telefone AND c1.canal = c2.canal AND c1.id < c2.id) p ON p.loser_id = t.conversaId
SET t.conversaId = p.keeper_id;

UPDATE atendimento_tempo_eventos t
JOIN (SELECT c1.id AS keeper_id, c2.id AS loser_id FROM inbox_conversas c1 JOIN inbox_conversas c2 ON c1.telefone = c2.telefone AND c1.canal = c2.canal AND c1.id < c2.id) p ON p.loser_id = t.conversaId
SET t.conversaId = p.keeper_id;

UPDATE fluxo_execucoes t
JOIN (SELECT c1.id AS keeper_id, c2.id AS loser_id FROM inbox_conversas c1 JOIN inbox_conversas c2 ON c1.telefone = c2.telefone AND c1.canal = c2.canal AND c1.id < c2.id) p ON p.loser_id = t.conversaId
SET t.conversaId = p.keeper_id;

UPDATE agentes_execucoes t
JOIN (SELECT c1.id AS keeper_id, c2.id AS loser_id FROM inbox_conversas c1 JOIN inbox_conversas c2 ON c1.telefone = c2.telefone AND c1.canal = c2.canal AND c1.id < c2.id) p ON p.loser_id = t.conversaId
SET t.conversaId = p.keeper_id;

UPDATE agentes_acoes_conversa t
JOIN (SELECT c1.id AS keeper_id, c2.id AS loser_id FROM inbox_conversas c1 JOIN inbox_conversas c2 ON c1.telefone = c2.telefone AND c1.canal = c2.canal AND c1.id < c2.id) p ON p.loser_id = t.conversaId
SET t.conversaId = p.keeper_id;

UPDATE agentes_casos_regressao t
JOIN (SELECT c1.id AS keeper_id, c2.id AS loser_id FROM inbox_conversas c1 JOIN inbox_conversas c2 ON c1.telefone = c2.telefone AND c1.canal = c2.canal AND c1.id < c2.id) p ON p.loser_id = t.conversaId
SET t.conversaId = p.keeper_id;

UPDATE agentes_sugestoes t
JOIN (SELECT c1.id AS keeper_id, c2.id AS loser_id FROM inbox_conversas c1 JOIN inbox_conversas c2 ON c1.telefone = c2.telefone AND c1.canal = c2.canal AND c1.id < c2.id) p ON p.loser_id = t.conversaId
SET t.conversaId = p.keeper_id;

-- ===== 2) Tabelas com índice único em conversaId (no máximo 1 linha por
-- conversa) — move só quando o keeper ainda não tem uma; quando os dois
-- lados já têm (achado real: só o par 4740005/4740006 tinha isso, em
-- agentes_agrupamentos_mensagens), o passo seguinte apaga a do loser em
-- vez de colidir. =====

UPDATE agentes_conversas t
JOIN (SELECT c1.id AS keeper_id, c2.id AS loser_id FROM inbox_conversas c1 JOIN inbox_conversas c2 ON c1.telefone = c2.telefone AND c1.canal = c2.canal AND c1.id < c2.id) p ON p.loser_id = t.conversaId
SET t.conversaId = p.keeper_id
WHERE NOT EXISTS (SELECT 1 FROM agentes_conversas k WHERE k.conversaId = p.keeper_id);

DELETE t FROM agentes_conversas t
JOIN (SELECT c1.id AS keeper_id, c2.id AS loser_id FROM inbox_conversas c1 JOIN inbox_conversas c2 ON c1.telefone = c2.telefone AND c1.canal = c2.canal AND c1.id < c2.id) p ON t.conversaId = p.loser_id;

UPDATE agentes_agrupamentos_mensagens t
JOIN (SELECT c1.id AS keeper_id, c2.id AS loser_id FROM inbox_conversas c1 JOIN inbox_conversas c2 ON c1.telefone = c2.telefone AND c1.canal = c2.canal AND c1.id < c2.id) p ON p.loser_id = t.conversaId
SET t.conversaId = p.keeper_id
WHERE NOT EXISTS (SELECT 1 FROM agentes_agrupamentos_mensagens k WHERE k.conversaId = p.keeper_id);

DELETE t FROM agentes_agrupamentos_mensagens t
JOIN (SELECT c1.id AS keeper_id, c2.id AS loser_id FROM inbox_conversas c1 JOIN inbox_conversas c2 ON c1.telefone = c2.telefone AND c1.canal = c2.canal AND c1.id < c2.id) p ON t.conversaId = p.loser_id;

-- ===== 3) Mescla os metadados da própria inbox_conversas no keeper =====

UPDATE inbox_conversas keeper
JOIN inbox_conversas loser ON loser.telefone = keeper.telefone AND loser.canal = keeper.canal AND loser.id > keeper.id
SET
  keeper.naoLidas = keeper.naoLidas + loser.naoLidas,
  keeper.ultimaMensagemTexto = IF(loser.ultimaMensagemEm > keeper.ultimaMensagemEm, loser.ultimaMensagemTexto, keeper.ultimaMensagemTexto),
  keeper.ultimaMensagemEm = GREATEST(keeper.ultimaMensagemEm, loser.ultimaMensagemEm),
  keeper.chatLid = COALESCE(keeper.chatLid, loser.chatLid),
  keeper.fotoUrl = COALESCE(keeper.fotoUrl, loser.fotoUrl),
  keeper.clienteId = COALESCE(keeper.clienteId, loser.clienteId),
  keeper.atendenteResponsavelId = COALESCE(keeper.atendenteResponsavelId, loser.atendenteResponsavelId),
  keeper.nomeContato = COALESCE(keeper.nomeContato, loser.nomeContato);

-- ===== 4) Apaga as duplicatas (já com tudo reapontado/mesclado) =====

DELETE loser FROM inbox_conversas loser
JOIN inbox_conversas keeper ON loser.telefone = keeper.telefone AND loser.canal = keeper.canal AND loser.id > keeper.id;

-- ===== 5) Índice único — impede a mesma corrida de criar duplicata de novo
-- (substitui o índice normal antigo pelas mesmas 2 colunas, que não
-- impedia a corrida) =====

ALTER TABLE `inbox_conversas` DROP INDEX `inbox_conversas_telefone_canal_idx`;
ALTER TABLE `inbox_conversas` ADD UNIQUE KEY `inbox_conversas_telefone_canal_unq` (`telefone`, `canal`);
