-- Desacopla os lookups internos (Comanda Recepção, categorização
-- determinística de Mercado Pago/Caixa Físico/Adquirentes) do nome de
-- exibição de dre_descricoes, que é editável pelo usuário na tela de
-- Parâmetros. Sem isso, renomear uma Descrição (ex.: "Receita C. Débito"
-- -> "Receita Cartão de Débito") quebra silenciosamente essas
-- integrações, porque elas comparavam contra o texto do nome.
--
-- Roda uma vez, em produção, via webdev_execute_sql (não pnpm db:push).

ALTER TABLE dre_descricoes ADD COLUMN chave VARCHAR(64) NULL;
CREATE INDEX dre_descricoes_chave_idx ON dre_descricoes (chave);

-- Casa tanto o nome antigo (pré-rename) quanto o nome atual de cada
-- Descrição protegida, pra cobrir instalações em qualquer um dos dois
-- estados.
UPDATE dre_descricoes SET chave = 'excluido'
  WHERE nome IN ('Excluído do DRE');

UPDATE dre_descricoes SET chave = 'receita_pix'
  WHERE nome IN ('Receita de Pix');

UPDATE dre_descricoes SET chave = 'receita_especie'
  WHERE nome IN ('Receita em Espécie');

UPDATE dre_descricoes SET chave = 'receita_c_debito'
  WHERE nome IN ('Receita C. Débito', 'Receita Cartão de Débito');

UPDATE dre_descricoes SET chave = 'receita_c_credito'
  WHERE nome IN ('Receita C. Crédito', 'Receita Cartão de Crédito');
