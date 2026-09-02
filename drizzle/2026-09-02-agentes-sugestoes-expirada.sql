-- Sugestão pendente que ninguém avaliou por tempo demais (tempo de
-- vida, 2026-09-02) passa a expirar sozinha em vez de ficar grudada na
-- tela pra sempre — precisa de um valor de tipoRevisao próprio, já que
-- "substituida_por_contexto" é especificamente pra quando uma mensagem
-- nova do cliente derruba a sugestão anterior, não pra timeout.
ALTER TABLE `agentes_sugestoes`
  MODIFY COLUMN `tipoRevisao` ENUM('aceita_como_esta', 'editada', 'rejeitada', 'substituida_por_contexto', 'expirada');
