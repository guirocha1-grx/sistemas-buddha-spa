ALTER TABLE atendimentos_operacional
  ADD COLUMN preferencial BOOLEAN NOT NULL DEFAULT FALSE AFTER sala;
