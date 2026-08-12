-- Suporte a mensagens de grupo no Inbox. isGrupo marca a conversa
-- (telefone = ID do grupo, sufixo "-group"); participanteTelefone/
-- participanteNome ficam na mensagem (quem dentro do grupo mandou
-- aquela mensagem específica, muda a cada uma).
ALTER TABLE inbox_conversas
  ADD COLUMN isGrupo ENUM('true', 'false') NOT NULL DEFAULT 'false';

ALTER TABLE inbox_mensagens
  ADD COLUMN participanteTelefone VARCHAR(30) NULL,
  ADD COLUMN participanteNome VARCHAR(200) NULL;
