-- Corrige a data usada na conciliação Comanda x Belle: era "Lcto."
-- (lançamento/digitação, diverge quando a venda é reaberta pra
-- correção dias depois), o certo é "Vcto." (vencimento — dia que o
-- dinheiro de fato entrou). Renomeia a coluna; os valores já
-- importados ficam com a data errada até reimportar a planilha do
-- Belle (upsert por código sobrescreve).
ALTER TABLE `belle_registros_financeiros`
  CHANGE COLUMN `dataLancamento` `dataVencimento` VARCHAR(10) NOT NULL;
