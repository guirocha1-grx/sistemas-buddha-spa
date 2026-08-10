-- inbox_conversas.chatLid/isLidPendente existiam no schema.ts (desde a
-- task de resolução de contato via "@lid") mas nunca ganharam uma
-- migração de verdade — ficaram só no código. Toda leitura/escrita em
-- inbox_conversas falhava silenciosamente (703/503 sem log) porque o
-- SELECT gerado pelo Drizzle pede a coluna chatLid, que não existe na
-- tabela real. Descoberto ao testar o webhook Z-API da RBS pela primeira
-- vez com tráfego real.

ALTER TABLE inbox_conversas
  ADD COLUMN chatLid VARCHAR(64) NULL AFTER telefone,
  ADD COLUMN isLidPendente ENUM('true', 'false') NOT NULL DEFAULT 'false' AFTER chatLid;

CREATE INDEX inbox_conversas_chat_lid_idx ON inbox_conversas (chatLid);
