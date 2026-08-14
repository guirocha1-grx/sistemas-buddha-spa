ALTER TABLE buddha_mkt_templates
  ADD COLUMN corpoExemplos JSON NULL,
  ADD COLUMN cabecalhoExemplo VARCHAR(60) NULL;

ALTER TABLE disparos
  ADD COLUMN variaveisConfig JSON NULL;
