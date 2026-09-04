-- Campo livre pra recepção anotar o que precisar pra organizar a fila
-- ("a partir desse horário", "pode ser com a Larah", "aceita sábado" etc.).
ALTER TABLE `lista_espera`
  ADD COLUMN `observacao` TEXT NULL AFTER `terapiaDesejada`;
