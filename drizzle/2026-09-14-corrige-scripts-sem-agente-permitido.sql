-- Achado real (2026-09-14, aprofundando os erros da Estela): 10 Scripts
-- ativos estão com `agentesPermitidos` gravado como array VAZIO (`[]`),
-- todos criados no mesmo lote em 13/08. O código
-- (agentesDb.listarScriptsParaAgentes) só mostra um Script pra um agente
-- quando `agentesPermitidos` é null (legado, compatível com todos) OU
-- quando o array CONTÉM a chave do agente — um array vazio nunca
-- "contém" nada, então esses 10 Scripts ficaram invisíveis pra TODO
-- agente, sempre, desde que foram criados. Entre eles está exatamente
-- a frase de despedida que a recepção usa na mão o tempo todo ("Seu
-- momento de bem-estar estará sempre te esperando...", ID 30005) — não
-- faltava cadastrar o Script (já existia!), faltava ele conseguir
-- aparecer pros agentes.
--
-- Corrige devolvendo esses 10 pro estado "null" (legado/compatível com
-- todos) — o mesmo fallback seguro que o código já usa pra Script sem
-- classificação — em vez de escolher uma lista de agentes específica
-- (isso é uma decisão de conteúdo melhor deixada pra tela de Scripts).
UPDATE `scripts`
SET `agentesPermitidos` = NULL
WHERE `id` IN (30001, 30002, 30015, 30004, 30036, 30037, 30013, 30005, 1, 30017)
  AND `ativo` = 1;
