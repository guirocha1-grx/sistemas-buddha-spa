-- Migração: Descrição como nível intermediário obrigatório entre
-- Categoria e lançamento (Categoria -> Descrição -> lançamento).
--
-- IMPORTANTE: rodar exatamente nesta ordem — os passos de backfill
-- (2-8) dependem das colunas ANTIGAS (dre_regras.descricao,
-- dre_regras.dreCategoriaId, inter_extratos.dreCategoriaId) ainda
-- existirem. Os DROPs só acontecem nos últimos passos, depois que os
-- dados já foram migrados pra estrutura nova. Não rodar via
-- `pnpm db:push` (TiDB) — aplicar manualmente (webdev_execute_sql).
--
-- Antes de rodar: conferir que as tabelas dre_categorias/dre_regras já
-- existem com os dados reais de produção (elas foram populadas há
-- algumas sessões atrás, incluindo regras adicionadas manualmente pela
-- tela de Parâmetros que não estão no seed do código-fonte).

-- 1) Nova tabela.
CREATE TABLE `dre_descricoes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nome` varchar(256) NOT NULL,
  `dreCategoriaId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `dre_descricoes_id` PRIMARY KEY(`id`)
);
CREATE INDEX `dre_descricoes_categoria_idx` ON `dre_descricoes` (`dreCategoriaId`);

-- 2) Uma Descrição por combinação distinta (descricao da regra OU nome
-- da categoria quando a regra não tinha descrição preenchida).
INSERT INTO dre_descricoes (nome, dreCategoriaId)
SELECT DISTINCT COALESCE(r.descricao, c.nome) AS nome, r.dreCategoriaId
FROM dre_regras r
JOIN dre_categorias c ON c.id = r.dreCategoriaId;

-- 3) Garante 1 Descrição "genérica" (nome = nome da categoria) por
-- categoria mesmo que toda regra daquela categoria já tivesse uma
-- descrição específica — serve de bucket de fallback pro backfill do
-- histórico de inter_extratos no passo 7 (uma transação antiga só
-- sabia a Categoria, não uma Descrição específica).
INSERT INTO dre_descricoes (nome, dreCategoriaId)
SELECT c.nome, c.id FROM dre_categorias c
WHERE NOT EXISTS (
  SELECT 1 FROM dre_descricoes d WHERE d.dreCategoriaId = c.id AND d.nome = c.nome
);

-- 4) Caso especial: as regras de "Receitas de Vendas" existentes hoje
-- (confirmado na tela de Parâmetros do usuário em 2026-08-07) remapeiam
-- pros 4 nomes canônicos decididos por áudio. Ajuste os padrões LIKE
-- abaixo se o texto real divergir um pouco do que foi visto na tela.
UPDATE dre_descricoes d
JOIN dre_categorias c ON c.id = d.dreCategoriaId AND c.nome = 'Receitas de Vendas'
SET d.nome = 'Receita C. Débito'
WHERE d.nome LIKE '%CARTAO DE DEBITO%' OR d.nome LIKE '%CARTÃO DE DÉBITO%';

UPDATE dre_descricoes d
JOIN dre_categorias c ON c.id = d.dreCategoriaId AND c.nome = 'Receitas de Vendas'
SET d.nome = 'Receita C. Crédito'
WHERE d.nome LIKE '%ANTECIPACAO%' OR d.nome LIKE '%ANTECIPAÇÃO%';

UPDATE dre_descricoes d
JOIN dre_categorias c ON c.id = d.dreCategoriaId AND c.nome = 'Receitas de Vendas'
SET d.nome = 'Receita de Pix'
WHERE d.nome = 'Pix recebido';

-- 5) Garante as 4 Descrições canônicas de receita mesmo que alguma não
-- tivesse nenhuma regra (ex.: "Receita em Espécie" — atribuída direto
-- pra Caixa Físico, sem regra de texto).
INSERT INTO dre_descricoes (nome, dreCategoriaId)
SELECT v.nome, c.id FROM (
  SELECT 'Receita de Pix' AS nome
  UNION ALL SELECT 'Receita em Espécie'
  UNION ALL SELECT 'Receita C. Débito'
  UNION ALL SELECT 'Receita C. Crédito'
) v
JOIN dre_categorias c ON c.nome = 'Receitas de Vendas'
WHERE NOT EXISTS (
  SELECT 1 FROM dre_descricoes d WHERE d.nome = v.nome AND d.dreCategoriaId = c.id
);

-- 6) dre_regras ganha a coluna nova e é resolvida pra Descrição criada
-- acima. As 3 regras de receita resolvem por padrão (o nome delas mudou
-- no passo 4, então não bate mais pelo texto original).
ALTER TABLE `dre_regras` ADD COLUMN `dreDescricaoId` int NULL;

UPDATE dre_regras r
JOIN dre_categorias c ON c.id = r.dreCategoriaId
JOIN dre_descricoes d ON d.dreCategoriaId = c.id AND d.nome = COALESCE(r.descricao, c.nome)
SET r.dreDescricaoId = d.id;

UPDATE dre_regras SET dreDescricaoId = (SELECT id FROM dre_descricoes WHERE nome = 'Receita C. Débito')
WHERE padrao LIKE '%CARTAO DE DEBITO%' OR padrao LIKE '%CARTÃO DE DÉBITO%';
UPDATE dre_regras SET dreDescricaoId = (SELECT id FROM dre_descricoes WHERE nome = 'Receita C. Crédito')
WHERE padrao LIKE '%ANTECIPACAO%' OR padrao LIKE '%ANTECIPAÇÃO%';
UPDATE dre_regras SET dreDescricaoId = (SELECT id FROM dre_descricoes WHERE nome = 'Receita de Pix')
WHERE padrao = 'Pix recebido';

-- Checagem manual antes de travar NOT NULL — deve devolver 0 linhas:
-- SELECT * FROM dre_regras WHERE dreDescricaoId IS NULL;

ALTER TABLE `dre_regras` MODIFY COLUMN `dreDescricaoId` int NOT NULL;
ALTER TABLE `dre_regras` DROP COLUMN `dreCategoriaId`;
ALTER TABLE `dre_regras` DROP COLUMN `descricao`;

-- 7) inter_extratos: linhas já categorizadas (dreCategoriaId não nulo)
-- caem na Descrição "genérica" da mesma categoria (garantida no passo
-- 3) — não dá pra saber retroativamente qual regra específica
-- categorizou cada linha antiga, mas fica correto no nível de Categoria
-- (que já era o que se sabia); o usuário pode refinar depois se quiser.
ALTER TABLE `inter_extratos` ADD COLUMN `dreDescricaoId` int NULL;

UPDATE inter_extratos e
JOIN dre_categorias c ON c.id = e.dreCategoriaId
JOIN dre_descricoes d ON d.dreCategoriaId = c.id AND d.nome = c.nome
SET e.dreDescricaoId = d.id
WHERE e.dreCategoriaId IS NOT NULL;

ALTER TABLE `inter_extratos` DROP COLUMN `dreCategoriaId`;

-- 8) adquirente_vendas: coluna nova, fica NULL até o próximo sync
-- recalcular sozinho (server/db.ts: upsertAdquirenteVendas já resolve
-- isso automaticamente a partir do campo `tipo` a cada sincronização —
-- não precisa de backfill manual aqui, um "Sincronizar" na tela
-- Adquirentes já resolve as linhas existentes).
ALTER TABLE `adquirente_vendas` ADD COLUMN `dreDescricaoId` int NULL;

-- 9) Demais mudanças de schema pendentes desta sessão (se ainda não
-- aplicadas): contas.tipo ganha 'sicredi_oauth', inter_extratos.origem
-- ganha 'sicredi', unidades ganha os campos sicredi*, tabela
-- comanda_diaria. Essas são só ADD/MODIFY simples (sem backfill),
-- Manus normalmente já resolve pelo diff do schema.ts — incluídas aqui
-- só como checklist, não repetir se já tiverem sido aplicadas.
