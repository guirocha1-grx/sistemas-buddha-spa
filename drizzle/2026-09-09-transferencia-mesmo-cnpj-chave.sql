-- Dá a chave estável "transferencia_mesmo_cnpj" pra Descrição já
-- existente "Transf. contas mesmo CNPJ" (id 11 em produção), pra
-- categorizarTransacaoAutomaticamente (server/db.ts) poder resolvê-la
-- por chave (nunca por nome, que o usuário pode renomear) e sugerir
-- essa Descrição automaticamente quando uma transferência bater CNPJ
-- de conta própria da MESMA unidade do lançamento.
UPDATE `dre_descricoes`
SET `chave` = 'transferencia_mesmo_cnpj'
WHERE `nome` = 'Transf. contas mesmo CNPJ' AND `chave` IS NULL;
