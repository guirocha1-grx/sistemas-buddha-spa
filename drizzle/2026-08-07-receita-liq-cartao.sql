-- Separa a Descrição do extrato bancário (Sicredi/Inter) da Descrição
-- da venda na maquininha (Adquirentes). Antes as duas usavam a MESMA
-- Descrição ("Receita Cartão de Débito"/"Receita Cartão de Crédito"),
-- o que causava dupla contagem na Comanda Recepção (bruto da venda +
-- depósito líquido correspondente contados juntos) e confundia ao ler
-- o extrato (a mesma etiqueta pra coisas diferentes: valor bruto vs
-- líquido). adquirente_vendas nunca passa por dre_regras — seu
-- dreDescricaoId é sempre resolvido direto pela função
-- chaveDescricaoAdquirente() — então qualquer dre_regras ou
-- inter_extratos hoje apontando pra "Receita Cartão de Débito/Crédito"
-- é, por construção, lançamento de extrato bancário. Roda uma vez, em
-- produção, via webdev_execute_sql.

INSERT INTO dre_descricoes (nome, dreCategoriaId, chave)
SELECT 'Receita Líq. Cartão de Débito', dreCategoriaId, 'receita_liq_c_debito'
FROM dre_descricoes WHERE chave = 'receita_c_debito' LIMIT 1;

INSERT INTO dre_descricoes (nome, dreCategoriaId, chave)
SELECT 'Receita Líq. Cartão de Crédito', dreCategoriaId, 'receita_liq_c_credito'
FROM dre_descricoes WHERE chave = 'receita_c_credito' LIMIT 1;

UPDATE dre_regras r
JOIN dre_descricoes velha ON velha.id = r.dreDescricaoId AND velha.chave = 'receita_c_debito'
JOIN dre_descricoes nova ON nova.chave = 'receita_liq_c_debito'
SET r.dreDescricaoId = nova.id;

UPDATE dre_regras r
JOIN dre_descricoes velha ON velha.id = r.dreDescricaoId AND velha.chave = 'receita_c_credito'
JOIN dre_descricoes nova ON nova.chave = 'receita_liq_c_credito'
SET r.dreDescricaoId = nova.id;

UPDATE inter_extratos e
JOIN dre_descricoes velha ON velha.id = e.dreDescricaoId AND velha.chave = 'receita_c_debito'
JOIN dre_descricoes nova ON nova.chave = 'receita_liq_c_debito'
SET e.dreDescricaoId = nova.id;

UPDATE inter_extratos e
JOIN dre_descricoes velha ON velha.id = e.dreDescricaoId AND velha.chave = 'receita_c_credito'
JOIN dre_descricoes nova ON nova.chave = 'receita_liq_c_credito'
SET e.dreDescricaoId = nova.id;

-- Pix via maquininha da Interpag/Granito: o depósito já chega certinho
-- (valor cheio) no extrato bancário, então a linha equivalente em
-- adquirente_vendas só duplicava a mesma entrada de Pix na Comanda
-- Recepção. A partir de agora o import já filtra essas linhas (ver
-- upsertAdquirenteVendas em server/db.ts); isso aqui limpa o que já
-- tinha sido importado antes dessa mudança.
DELETE FROM adquirente_vendas
WHERE adquirente = 'interpag' AND LOWER(tipo) LIKE '%pix%';
