ALTER TABLE agentes_sugestoes
  MODIFY COLUMN avaliacao ENUM('pendente', 'aprovada', 'reprovada', 'obsoleta') NOT NULL DEFAULT 'pendente';

ALTER TABLE agentes_sugestoes
  MODIFY COLUMN tipoRevisao ENUM('aceita_como_esta', 'editada', 'rejeitada', 'substituida_por_contexto') NULL;
