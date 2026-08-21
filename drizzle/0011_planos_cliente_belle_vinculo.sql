ALTER TABLE belle_planos_clientes
  ADD COLUMN clienteBelleId BIGINT NULL AFTER clienteId;

ALTER TABLE belle_planos_clientes
  ADD COLUMN vinculoOrigem ENUM('nome', 'id_belle', 'manual') NULL AFTER clienteBelleId;

ALTER TABLE belle_planos_clientes
  ADD COLUMN vinculadoEm TIMESTAMP NULL AFTER vinculoOrigem;

ALTER TABLE belle_planos_clientes
  ADD KEY belle_planos_clientes_unidade_cliente_belle_idx (unidadeId, clienteBelleId);
