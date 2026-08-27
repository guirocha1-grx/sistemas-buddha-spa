ALTER TABLE atendimentos_operacional ADD COLUMN comandaAba VARCHAR(40) NULL AFTER preferencial;
ALTER TABLE atendimentos_operacional ADD COLUMN comandaLinha INT NULL AFTER comandaAba;
ALTER TABLE atendimentos_operacional ADD COLUMN comandaPreenchidaEm TIMESTAMP NULL AFTER comandaLinha;
