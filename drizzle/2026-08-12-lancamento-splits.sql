-- Split de lançamento: divide uma transação do extrato em N partes,
-- cada uma com sua própria Descrição (e, opcionalmente, unidade dona
-- da parte, quando o gasto é rateado entre unidades). Enquanto uma
-- transação tem linhas aqui, inter_extratos.dreDescricaoId fica null.
CREATE TABLE lancamento_splits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  interExtratoId INT NOT NULL,
  dreDescricaoId INT NOT NULL,
  valor DECIMAL(12, 2) NOT NULL,
  unidadeId INT NOT NULL,
  observacao VARCHAR(256) NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX lancamento_splits_extrato_idx ON lancamento_splits (interExtratoId);
