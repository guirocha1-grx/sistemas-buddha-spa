ALTER TABLE inbox_mensagens
  ADD COLUMN statusEntrega ENUM('enviada', 'entregue', 'lida') NOT NULL DEFAULT 'enviada';
