-- inbox_conversas foi clonada da estrutura do mobai-crm (bancos são
-- separados, mas o schema foi copiado por pedido explícito de trazer
-- o inbox de lá) — confirmado por SHOW COLUMNS em produção: tem
-- fotoUrl/clienteId/status(4 estados)/etiquetas/resumo_conversa/etc,
-- mas nunca ganhou uma coluna `canal`, que o código do buddha-spa
-- sempre assumiu existir (usada pra distinguir zapi de buddha_mkt).
-- Toda leitura/escrita em inbox_conversas falhava com "Unknown column
-- 'canal'". Tabela confirmada vazia (COUNT=0) antes desta migração —
-- seguro adicionar como NOT NULL sem default.

ALTER TABLE inbox_conversas
  ADD COLUMN canal ENUM('zapi', 'buddha_mkt') NOT NULL AFTER telefone;

CREATE INDEX inbox_conversas_telefone_canal_idx ON inbox_conversas (telefone, canal);
