ALTER TABLE scripts
  MODIFY COLUMN script TEXT NULL,
  ADD COLUMN tipo ENUM('texto', 'fluxo') NOT NULL DEFAULT 'texto',
  ADD COLUMN fluxoId INT NULL;
