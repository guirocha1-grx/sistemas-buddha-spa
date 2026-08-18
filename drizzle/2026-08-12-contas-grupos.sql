-- Segmenta contas.tipo em grupos de verdade (Conta Corrente / Caixa
-- Físico / Cartão de Crédito), pra tela de Contas poder filtrar por
-- grupo em vez de misturar tudo num "Consolidado" único. Antes, tanto
-- Mercado Pago quanto Caixa Físico usavam tipo="manual", só
-- diferenciados pelo nome — frágil pra agrupar de verdade.

ALTER TABLE `contas` MODIFY COLUMN `tipo`
  ENUM('inter_oauth', 'sicredi_oauth', 'manual', 'cartao_credito', 'conta_corrente', 'caixa_fisico')
  NOT NULL DEFAULT 'conta_corrente';

-- Caixa Físico primeiro (nome exato) — o catch-all abaixo pegaria
-- senão.
UPDATE contas SET tipo = 'caixa_fisico' WHERE nome = 'Caixa Físico' AND tipo = 'manual';

-- Todo resto que ainda for "manual" (Mercado Pago e qualquer conta
-- manual futura) vira Conta Corrente — é o que essas contas são de
-- verdade: dinheiro líquido, só não é banco tradicional com API.
UPDATE contas SET tipo = 'conta_corrente' WHERE tipo = 'manual';
