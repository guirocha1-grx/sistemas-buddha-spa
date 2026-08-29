-- Vínculo operacional e nível da terapeuta.
-- A migração é idempotente porque a estrutura pode ter sido aplicada
-- diretamente no TiDB compartilhado antes da sincronização do código.
ALTER TABLE `terapeutas`
  ADD COLUMN IF NOT EXISTS `vinculo` ENUM('fixo', 'freelancer') NOT NULL DEFAULT 'fixo';

ALTER TABLE `terapeutas`
  ADD COLUMN IF NOT EXISTS `nivel` ENUM('diamante', 'ouro', 'prata', 'bronze') NOT NULL DEFAULT 'bronze';
