ALTER TABLE inbox_conversas
  ADD COLUMN automacaoAgentes ENUM('ativa', 'bloqueada_temporariamente', 'bloqueada_permanentemente') NOT NULL DEFAULT 'ativa';

ALTER TABLE inbox_conversas
  ADD COLUMN automacaoAgentesBloqueadaAte TIMESTAMP NULL;
