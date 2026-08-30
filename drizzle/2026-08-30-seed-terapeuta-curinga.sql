-- Terapeuta curinga "Pendente de sorteio" nas duas unidades — usado em
-- pré-chamado quando o sorteio da terapeuta real ainda não aconteceu.
-- Nome não pode começar com "Terapeuta": montarMensagemChamadoTerapeuta
-- extrai só a primeira palavra do nome pra linha "Terapeuta: {nome}." —
-- um nome começando com "Terapeuta" viraria "Terapeuta: Terapeuta."
-- WHERE NOT EXISTS evita duplicar se rodar mais de uma vez.
INSERT INTO terapeutas (unidadeId, nomeCompleto, nomeAbreviado, vinculo, nivel, ativo)
SELECT u.id, 'Pendente de sorteio', 'Pendente de sorteio', 'fixo', 'bronze', TRUE
FROM unidades u
WHERE u.id IN (1, 2)
  AND NOT EXISTS (
    SELECT 1 FROM terapeutas t WHERE t.unidadeId = u.id AND t.nomeCompleto = 'Pendente de sorteio'
  );
