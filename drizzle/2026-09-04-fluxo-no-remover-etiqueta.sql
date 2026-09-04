-- Terceiro tipo de nó de Fluxo (2026-09-04) — "Remover etiqueta", pra
-- espelhar "Aplicar etiqueta" (achado do usuário comparando com o
-- BotConversa: precisa ter incluir E remover). Não cria a etiqueta se não
-- existir — só remove do cliente se ele já tiver.
ALTER TABLE `fluxo_nos`
  MODIFY COLUMN `tipo` ENUM('mensagem', 'aguardar', 'condicional', 'salvar_variavel', 'fim', 'randomizador', 'webhook', 'midia', 'menu', 'aplicar_etiqueta', 'remover_etiqueta', 'incrementar_campo') NOT NULL;
