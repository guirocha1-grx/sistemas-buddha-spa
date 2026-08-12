ALTER TABLE clientes
  ADD COLUMN tipoCliente ENUM('lead', 'cliente') NOT NULL DEFAULT 'cliente';
