-- Item a item da "Comanda virtual" — alimenta só o drill-down (hover)
-- da linha "Comanda (Recepção)" na tela de Comanda Recepção. Não muda
-- o número agregado, que continua vindo de comanda_diaria; é uma
-- camada de auditoria por cima. Roda uma vez, em produção, via
-- webdev_execute_sql.

CREATE TABLE comanda_itens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unidadeId INT NOT NULL,
  data VARCHAR(10) NOT NULL,
  idLinha INT NOT NULL,
  cliente VARCHAR(200) NULL,
  aberturaResponsavel VARCHAR(100) NULL,
  visitasAnteriores VARCHAR(60) NULL,
  canalCaptacao VARCHAR(100) NULL,
  terapiaProduto VARCHAR(150) NULL,
  terapeuta VARCHAR(100) NULL,
  subtotal DECIMAL(12, 2) NULL,
  desconto DECIMAL(12, 2) NULL,
  motivoDesconto VARCHAR(100) NULL,
  total DECIMAL(12, 2) NULL,
  dinheiro DECIMAL(12, 2) NULL,
  pix DECIMAL(12, 2) NULL,
  cartaoDebito DECIMAL(12, 2) NULL,
  cartaoCredito DECIMAL(12, 2) NULL,
  totalPagtos DECIMAL(12, 2) NULL,
  observacao VARCHAR(300) NULL,
  fechamentoResponsavel VARCHAR(100) NULL,
  campoGerente TEXT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX comanda_itens_unidade_data_idx ON comanda_itens (unidadeId, data);
