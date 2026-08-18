CREATE TABLE lid_mapping (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unidadeId INT NOT NULL,
  telefoneCanonico VARCHAR(20) NOT NULL,
  lid VARCHAR(64) NOT NULL,
  resolvedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY lid_mapping_unidade_telefone_idx (unidadeId, telefoneCanonico),
  KEY lid_mapping_lid_idx (lid)
);
