-- inbox_mensagens.zapiMessageId — guarda o messageId devolvido pela
-- Z-API quando o CRM manda uma mensagem, pra dar pra deduplicar contra
-- o webhook fromMe (recepção respondendo direto pelo app do WhatsApp
-- Business no celular, fora do CRM — hoje essas respostas não
-- apareciam no Inbox porque o webhook ignorava qualquer evento fromMe).

ALTER TABLE inbox_mensagens
  ADD COLUMN zapiMessageId VARCHAR(100) NULL;

CREATE INDEX inbox_mensagens_zapi_message_id_idx ON inbox_mensagens (zapiMessageId);
