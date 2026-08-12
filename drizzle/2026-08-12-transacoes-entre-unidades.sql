-- "Conta corrente" entre as 2 unidades: junta rateio de despesa
-- (nasce de um split com linha de unidade diferente) e transferência
-- bancária real entre as contas das unidades, na mesma tabela.
CREATE TABLE transacoes_entre_unidades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  data VARCHAR(10) NOT NULL,
  tipo ENUM('rateio_despesa', 'transferencia_real', 'manual') NOT NULL,
  unidadeCredora INT NOT NULL,
  unidadeDevedora INT NOT NULL,
  valor DECIMAL(12, 2) NOT NULL,
  descricao VARCHAR(256) NOT NULL,
  lancamentoSplitId INT NULL,
  interExtratoId INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX transacoes_unidades_credora_idx ON transacoes_entre_unidades (unidadeCredora);
CREATE INDEX transacoes_unidades_devedora_idx ON transacoes_entre_unidades (unidadeDevedora);

-- Descrição especial "Transação entre Unidades", na mesma categoria de
-- "Excluído do DRE"/"Não afeta DRE" (identificada por secao='excluido',
-- não pelo nome — já foi renomeada em produção). Idempotente: só insere
-- se ainda não existir uma Descrição com essa chave.
INSERT INTO dre_descricoes (nome, dreCategoriaId, chave)
SELECT 'Transação entre Unidades', id, 'transacao_entre_unidades'
FROM dre_categorias
WHERE secao = 'excluido'
  AND NOT EXISTS (SELECT 1 FROM dre_descricoes WHERE chave = 'transacao_entre_unidades')
LIMIT 1;
