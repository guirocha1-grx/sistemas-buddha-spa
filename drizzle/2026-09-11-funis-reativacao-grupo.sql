-- Grupo do funil de reativação (2026-09-11) — só o grupo "estrategica" tem
-- linha gravada aqui (criado manualmente pela recepção); "por_terapeuta" e
-- "por_data" são calculados on-the-fly em server/db.ts, nunca gravam.
ALTER TABLE `funis_reativacao`
  ADD COLUMN `grupo` ENUM('estrategica', 'por_terapeuta', 'por_data') NOT NULL DEFAULT 'estrategica' AFTER `nome`;
