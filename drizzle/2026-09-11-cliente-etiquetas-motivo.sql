-- Motivo opcional por atribuição de etiqueta (2026-09-11) — primeiro uso é
-- o botão "Não reativar" do Funil de Reativação, pra guardar por que o
-- cliente pediu pra não receber mais contato de reativação.
ALTER TABLE `cliente_etiquetas` ADD COLUMN `motivo` TEXT NULL AFTER `etiquetaId`;
