CREATE TABLE cliente_telefones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  clienteId INT NOT NULL,
  numeroCanonico VARCHAR(20) NOT NULL,
  origem ENUM('celular', 'celular2', 'telefone') NOT NULL,
  UNIQUE KEY cliente_telefones_cliente_numero_idx (clienteId, numeroCanonico),
  KEY cliente_telefones_numero_idx (numeroCanonico)
);

ALTER TABLE inbox_conversas
  ADD COLUMN telefoneNormalizado VARCHAR(20) NULL,
  ADD KEY inbox_conversas_telefone_normalizado_idx (telefoneNormalizado);
