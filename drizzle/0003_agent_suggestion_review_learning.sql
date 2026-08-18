ALTER TABLE `agentes_sugestoes`
  ADD COLUMN `tipoRevisao` ENUM('aceita_como_esta','editada','rejeitada') NULL AFTER `avaliacao`;
--> statement-breakpoint
ALTER TABLE `agentes_sugestoes`
  ADD COLUMN `textoFinal` TEXT NULL AFTER `tipoRevisao`;
