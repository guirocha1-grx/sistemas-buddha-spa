-- Renomeia a categoria "Receitas de Vendas" pra "Recebido em Caixa"
-- (mesmas 4 Descrições de pagamento por dentro — Pix/Espécie/Débito/
-- Crédito — só o nome muda). Decisão do usuário 2026-09-10: a Receita
-- Bruta do DRE passa a ser a soma de 3 categorias — "Recebido em
-- Caixa" + "Parcerias Comerciais" (Gympass/Totalpass) + "Receita de
-- Vouchers" — as 2 últimas alimentadas pelo resumo mensal
-- (resumo_mensal_unidade), não por transação bancária.
UPDATE `dre_categorias`
SET `nome` = 'Recebido em Caixa'
WHERE `nome` = 'Receitas de Vendas';

-- Dá chave estável pras Descrições que recebem o resumo mensal — sem
-- chave, server/db.ts (listDreAgregado) não teria como resolver o id
-- de forma confiável (nunca por nome, que o usuário pode renomear).
UPDATE `dre_descricoes`
SET `chave` = 'receita_gympass_totalpass'
WHERE `nome` = 'Parcerias Comerciais' AND `chave` IS NULL;

UPDATE `dre_descricoes`
SET `chave` = 'receita_voucher_site'
WHERE `nome` = 'Receita de Vouchers' AND `chave` IS NULL;
