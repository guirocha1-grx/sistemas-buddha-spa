-- Migração de dados (2026-09-03) — as etiquetas do Inbox eram texto livre por
-- conversa (inbox_conversas.etiquetas), sem padrão real (achado: "Pref Larah",
-- "Pref LARAH", "Pref Larah/Cláudia" e "Pref Larah ou Cláudia" eram a mesma
-- coisa; "Voucher site"/"Voucher Site" também). A partir de agora o Inbox usa
-- o catálogo padronizado (etiquetas/cliente_etiquetas) e a preferência de
-- terapeuta vai pra clientes_preferencias_terapeuta (que já existia, mas
-- estava vazia — ver 2026-09-03-preferencia-terapeuta-multipla.sql).
--
-- PRECISA aplicar depois de, nesta ordem:
--   1) 2026-09-03-etiquetas-clientes.sql
--   2) 2026-09-03-preferencia-terapeuta-multipla.sql
--
-- Gerada por script a partir das 121 conversas com etiqueta em produção
-- (118 com clienteId resolvido — as outras 3 foram ignoradas por não terem
-- cliente vinculado). Casos revisados manualmente:
--   - "Pref mulher" (7x) não é nome de terapeuta — virou a etiqueta
--     "Prefere terapeuta mulher" em vez de uma preferência estruturada.
--   - "Agendar somente c/ Cláudia*" virou preferência de Cláudia + a etiqueta
--     "Agendar somente com terapeuta preferida", pra não perder o "somente".
--   - "Renovação" e "Renovação Plano" foram tratadas como o mesmo conceito
--     (fusão) — confirme se fazia sentido pro seu contexto.
--   - "Terapeuta" (2x) é vaga demais pra saber o que significa — virou
--     "Terapeuta (revisar)", não apagada.
--   - clienteId=34090, tag "Pref Maiaana - nunca Siddhi" NÃO foi migrada:
--     nenhum dos dois nomes bate com terapeuta cadastrado (ativo ou
--     inativo) na unidade, e é uma preferência negativa ("nunca X"), que o
--     modelo atual não representa. Resolver manualmente se for relevante.

INSERT IGNORE INTO `etiquetas` (`nome`) VALUES
  ('Agendar somente com terapeuta preferida'),
  ('Cia Athlética'),
  ('Cliente Botânico'),
  ('Multi'),
  ('Não agendar'),
  ('Não faz com outra pessoa'),
  ('Não oferecer plano'),
  ('Plano'),
  ('Plano SSU'),
  ('Prefere terapeuta mulher'),
  ('Renovação Plano'),
  ('Somente salas debaixo, ninguém ao lado'),
  ('Terapeuta (revisar)'),
  ('Totalpass'),
  ('Voucher site'),
  ('Voucher unidade'),
  ('Wellhub/Gympass');

INSERT INTO `clientes_preferencias_terapeuta` (`clienteId`, `unidadeId`, `terapeutaId`, `terapeutaNome`) VALUES
(132, 2, 2, 'Cláudia'),
(661, 2, 8, 'Larah'),
(766, 2, 9, 'Lucimara'),
(1850, 2, 8, 'Larah'),
(2391, 2, 2, 'Cláudia'),
(2391, 2, 12, 'Thiago'),
(2711, 2, 2, 'Cláudia'),
(4577, 2, 8, 'Larah'),
(30276, 2, 3, 'Dâmires'),
(30277, 2, 1, 'Brenda'),
(30285, 2, 8, 'Larah'),
(30443, 2, 2, 'Cláudia'),
(30443, 2, 11, 'Regiane'),
(30444, 2, 8, 'Larah'),
(30444, 2, 2, 'Cláudia'),
(30505, 2, 8, 'Larah'),
(30526, 2, 8, 'Larah'),
(30528, 2, 2, 'Cláudia'),
(30550, 2, 1, 'Brenda'),
(30550, 2, 10, 'Priscila'),
(31212, 2, 12, 'Thiago'),
(31280, 2, 2, 'Cláudia'),
(31366, 2, 10, 'Priscila'),
(31526, 2, 2, 'Cláudia'),
(31644, 2, 8, 'Larah'),
(31973, 2, 2, 'Cláudia'),
(31973, 2, 7, 'Juliana'),
(32037, 2, 8, 'Larah'),
(32290, 2, 2, 'Cláudia'),
(32414, 2, 1, 'Brenda'),
(32429, 2, 8, 'Larah'),
(32658, 2, 10, 'Priscila'),
(32658, 2, 3, 'Dâmires'),
(32729, 2, 1, 'Brenda'),
(32738, 2, 8, 'Larah'),
(32945, 2, 3, 'Dâmires'),
(33012, 2, 8, 'Larah'),
(33083, 2, 2, 'Cláudia'),
(33396, 2, 8, 'Larah'),
(33403, 2, 8, 'Larah'),
(33730, 2, 8, 'Larah'),
(34090, 2, 8, 'Larah'),
(34090, 2, 12, 'Thiago'),
(34157, 2, 12, 'Thiago'),
(34357, 2, 4, 'Franciele'),
(34357, 2, 9, 'Lucimara'),
(34426, 2, 1, 'Brenda'),
(34429, 2, 8, 'Larah'),
(34542, 2, 12, 'Thiago'),
(34586, 2, 1, 'Brenda'),
(34701, 2, 10, 'Priscila'),
(34792, 2, 1, 'Brenda'),
(34840, 2, 8, 'Larah'),
(34882, 2, 11, 'Regiane'),
(34917, 2, 8, 'Larah'),
(35720, 2, 9, 'Lucimara'),
(35809, 2, 8, 'Larah'),
(36116, 2, 8, 'Larah'),
(36116, 2, 2, 'Cláudia'),
(36307, 2, 12, 'Thiago'),
(36317, 2, 10, 'Priscila'),
(36336, 2, 11, 'Regiane'),
(36377, 2, 8, 'Larah'),
(36386, 2, 8, 'Larah'),
(36399, 2, 2, 'Cláudia'),
(36408, 2, 1, 'Brenda'),
(36742, 2, 6, 'Jhennifer'),
(36821, 2, 6, 'Jhennifer'),
(37045, 2, 11, 'Regiane'),
(37097, 2, 8, 'Larah'),
(37147, 2, 10, 'Priscila'),
(37147, 2, 2, 'Cláudia'),
(37173, 2, 8, 'Larah'),
(37179, 2, 12, 'Thiago'),
(37276, 2, 8, 'Larah'),
(37283, 2, 8, 'Larah'),
(37351, 2, 2, 'Cláudia'),
(37394, 2, 8, 'Larah'),
(37516, 2, 3, 'Dâmires'),
(37562, 2, 7, 'Juliana'),
(37682, 2, 8, 'Larah'),
(37693, 2, 8, 'Larah'),
(37780, 2, 9, 'Lucimara'),
(37878, 2, 3, 'Dâmires'),
(37896, 2, 3, 'Dâmires'),
(38058, 2, 11, 'Regiane'),
(38078, 2, 7, 'Juliana'),
(38078, 2, 2, 'Cláudia'),
(38175, 2, 2, 'Cláudia'),
(120011, 2, 1, 'Brenda'),
(120013, 2, 3, 'Dâmires'),
(120013, 2, 8, 'Larah'),
(270003, 2, 2, 'Cláudia'),
(360009, 2, 8, 'Larah'),
(452079, 2, 2, 'Cláudia')
ON DUPLICATE KEY UPDATE `terapeutaNome` = VALUES(`terapeutaNome`);

INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 37, `id` FROM `etiquetas` WHERE `nome` = 'Voucher site' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 132, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 661, `id` FROM `etiquetas` WHERE `nome` = 'Plano SSU' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 766, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 1850, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 2391, `id` FROM `etiquetas` WHERE `nome` = 'Não oferecer plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 2711, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 4577, `id` FROM `etiquetas` WHERE `nome` = 'Totalpass' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 4875, `id` FROM `etiquetas` WHERE `nome` = 'Totalpass' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 30010, `id` FROM `etiquetas` WHERE `nome` = 'Voucher site' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 30276, `id` FROM `etiquetas` WHERE `nome` = 'Renovação Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 30277, `id` FROM `etiquetas` WHERE `nome` = 'Renovação Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 30285, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 30296, `id` FROM `etiquetas` WHERE `nome` = 'Totalpass' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 30443, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 30550, `id` FROM `etiquetas` WHERE `nome` = 'Cia Athlética' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 31212, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 31221, `id` FROM `etiquetas` WHERE `nome` = 'Não agendar' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 31280, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 31366, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 31526, `id` FROM `etiquetas` WHERE `nome` = 'Renovação Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 31644, `id` FROM `etiquetas` WHERE `nome` = 'Cia Athlética' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 31973, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 32037, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 32120, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 32414, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 32567, `id` FROM `etiquetas` WHERE `nome` = 'Totalpass' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 32658, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 32729, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 32746, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 32801, `id` FROM `etiquetas` WHERE `nome` = 'Totalpass' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 32845, `id` FROM `etiquetas` WHERE `nome` = 'Wellhub/Gympass' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 33083, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 33083, `id` FROM `etiquetas` WHERE `nome` = 'Agendar somente com terapeuta preferida' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 33396, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 33698, `id` FROM `etiquetas` WHERE `nome` = 'Não agendar' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 33730, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 33730, `id` FROM `etiquetas` WHERE `nome` = 'Não faz com outra pessoa' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 34090, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 34357, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 34426, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 34429, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 34540, `id` FROM `etiquetas` WHERE `nome` = 'Voucher unidade' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 34542, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 34701, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 34792, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 34840, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 34917, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 35183, `id` FROM `etiquetas` WHERE `nome` = 'Renovação Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 35188, `id` FROM `etiquetas` WHERE `nome` = 'Multi' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 35349, `id` FROM `etiquetas` WHERE `nome` = 'Renovação Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 35809, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 36116, `id` FROM `etiquetas` WHERE `nome` = 'Somente salas debaixo, ninguém ao lado' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 36399, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 36742, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 36821, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 37045, `id` FROM `etiquetas` WHERE `nome` = 'Renovação Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 37173, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 37276, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 37351, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 37378, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 37562, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 37630, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 37693, `id` FROM `etiquetas` WHERE `nome` = 'Renovação Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 37780, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 37942, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 37957, `id` FROM `etiquetas` WHERE `nome` = 'Totalpass' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 38058, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 38078, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 38175, `id` FROM `etiquetas` WHERE `nome` = 'Cia Athlética' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 38419, `id` FROM `etiquetas` WHERE `nome` = 'Cliente Botânico' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 38601, `id` FROM `etiquetas` WHERE `nome` = 'Totalpass' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 38718, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 120001, `id` FROM `etiquetas` WHERE `nome` = 'Terapeuta (revisar)' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 120011, `id` FROM `etiquetas` WHERE `nome` = 'Plano' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 120015, `id` FROM `etiquetas` WHERE `nome` = 'Totalpass' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 270002, `id` FROM `etiquetas` WHERE `nome` = 'Voucher unidade' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 360004, `id` FROM `etiquetas` WHERE `nome` = 'Voucher site' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 360010, `id` FROM `etiquetas` WHERE `nome` = 'Voucher site' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 390002, `id` FROM `etiquetas` WHERE `nome` = 'Voucher site' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 390005, `id` FROM `etiquetas` WHERE `nome` = 'Voucher site' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 451174, `id` FROM `etiquetas` WHERE `nome` = 'Terapeuta (revisar)' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 452108, `id` FROM `etiquetas` WHERE `nome` = 'Totalpass' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 480001, `id` FROM `etiquetas` WHERE `nome` = 'Voucher site' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 30511, `id` FROM `etiquetas` WHERE `nome` = 'Prefere terapeuta mulher' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 30976, `id` FROM `etiquetas` WHERE `nome` = 'Prefere terapeuta mulher' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 32044, `id` FROM `etiquetas` WHERE `nome` = 'Prefere terapeuta mulher' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 32120, `id` FROM `etiquetas` WHERE `nome` = 'Prefere terapeuta mulher' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 37378, `id` FROM `etiquetas` WHERE `nome` = 'Prefere terapeuta mulher' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 37630, `id` FROM `etiquetas` WHERE `nome` = 'Prefere terapeuta mulher' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
INSERT INTO `cliente_etiquetas` (`clienteId`, `etiquetaId`) SELECT 270002, `id` FROM `etiquetas` WHERE `nome` = 'Prefere terapeuta mulher' ON DUPLICATE KEY UPDATE `clienteId` = `clienteId`;
