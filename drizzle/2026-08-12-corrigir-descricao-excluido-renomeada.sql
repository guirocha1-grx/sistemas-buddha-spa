-- Corrige uso indevido da Descrição especial de exclusão (chave='excluido'):
-- o usuário renomeou/reaproveitou essa linha pra "Aporte Sócios" (com 2
-- padrões de Pix), sem saber que ela é atribuída automaticamente por CHAVE
-- (não por padrão) toda vez que o sistema encontra uma transferência entre
-- contas próprias ou uma liquidação Mercado Pago (server/db.ts,
-- categorizarTransacaoAutomaticamente). Resultado: tudo que devia aparecer
-- como "Excluído do DRE" passou a aparecer como "Aporte Sócios".

-- 1. Cria uma Descrição de verdade pra "Aporte Sócios" (sem chave, papel comum)
INSERT INTO dre_descricoes (nome, dreCategoriaId)
SELECT 'Aporte Sócios', dreCategoriaId FROM dre_descricoes
WHERE chave = 'excluido'
  AND NOT EXISTS (SELECT 1 FROM dre_descricoes WHERE nome = 'Aporte Sócios')
LIMIT 1;

-- 2. Move os padrões de Pix de sócio pra Descrição nova
UPDATE dre_regras
SET dreDescricaoId = (SELECT id FROM dre_descricoes WHERE nome = 'Aporte Sócios' LIMIT 1)
WHERE dreDescricaoId = (SELECT id FROM dre_descricoes WHERE chave = 'excluido' LIMIT 1)
  AND padrao IN ('pix recebido guilherme busch', 'pix recebido vanessa busch');

-- 3. Repontar lançamentos que já bateram nesses 2 padrões (Pix de sócio de
--    verdade) pra Descrição nova. Transferência entre contas e liquidação MP
--    ficam onde estavam — só voltam a mostrar o nome certo no passo 4.
UPDATE inter_extratos
SET dreDescricaoId = (SELECT id FROM dre_descricoes WHERE nome = 'Aporte Sócios' LIMIT 1)
WHERE dreDescricaoId = (SELECT id FROM dre_descricoes WHERE chave = 'excluido' LIMIT 1)
  AND (
    LOWER(CONCAT(COALESCE(tipoTransacao, ''), ' ', COALESCE(titulo, ''), ' ', COALESCE(descricao, '')))
      LIKE '%pix recebido guilherme busch%'
    OR LOWER(CONCAT(COALESCE(tipoTransacao, ''), ' ', COALESCE(titulo, ''), ' ', COALESCE(descricao, '')))
      LIKE '%pix recebido vanessa busch%'
  );

-- 4. Restaura o nome original da Descrição especial — ela continua sendo
--    usada internamente por chave (nunca por nome), mas o nome errado
--    escondia o papel real dela na tela de Parâmetros.
UPDATE dre_descricoes SET nome = 'Excluído do DRE' WHERE chave = 'excluido';
