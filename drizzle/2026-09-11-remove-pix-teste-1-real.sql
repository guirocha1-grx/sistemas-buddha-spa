-- Remove o Pix de teste de R$1,00 (10/09/2026, unidade RBS) usado pra
-- verificar se o Mercado Pago dispara webhook/aparece na API pra Pix
-- recebido direto na chave (sem cobrança por trás). Não é venda real —
-- está impedindo o fechamento da Conciliação PDV do dia por não ter
-- contrapartida nenhuma na Comanda. Apareceu em dois lugares: o
-- extrato (sincronizado como "Liquidação", origem mercadopago) e a
-- venda do adquirente (status "refunded" — o Mercado Pago já estornou
-- sozinho). id travado nos dois DELETE, mais uma condição extra de
-- valor/origem como segurança contra apagar a linha errada.
DELETE FROM `inter_extratos` WHERE `id` = 1920021 AND `valor` = 1.00 AND `origem` = 'mercadopago';
DELETE FROM `adquirente_vendas` WHERE `id` = 1380006 AND `valorBruto` = 1.00 AND `idTransacaoExterno` = '177440856569';
