-- Carga inicial das terapeutas do Shopping Santa Úrsula (SSU).
-- vinculo não veio na lista — usa o padrão 'fixo' do cadastro manual.
-- WHERE NOT EXISTS evita duplicar se essa SQL for rodada mais de uma vez.
INSERT INTO terapeutas (unidadeId, nomeCompleto, nomeAbreviado, celular, vinculo, nivel, ativo)
SELECT u.id, t.nomeCompleto, t.nomeAbreviado, t.celular, 'fixo', t.nivel, TRUE
FROM unidades u
JOIN (
  SELECT 'Brenno Gaspar Matus' AS nomeCompleto, 'Brenno' AS nomeAbreviado, '16991280662' AS celular, 'ouro' AS nivel
  UNION ALL SELECT 'Camila Vieira', 'Camila', '16992597695', 'ouro'
  UNION ALL SELECT 'Crislane Valeska Cardoso de Sá', 'Crislane', '3399374138', 'diamante'
  UNION ALL SELECT 'Gabriel Henrique Ribeiro Cotrim', 'Gabriel', '17991601984', 'bronze'
  UNION ALL SELECT 'Mariana Martins Arruda', 'Mariana', '16982289342', 'bronze'
  UNION ALL SELECT 'Sarah Brondi Crivelenti Ribeiro dos Santos', 'Sarah', '16981059291', 'prata'
  UNION ALL SELECT 'Thaís Cristina de Oliveira', 'Thaís', '16993625272', 'diamante'
  UNION ALL SELECT 'Vanessa Sanchez do Nascimento', 'Vanessa', '16991543408', 'bronze'
) AS t
WHERE u.nome = 'Shopping Santa Úrsula'
  AND NOT EXISTS (
    SELECT 1 FROM terapeutas ex WHERE ex.unidadeId = u.id AND ex.nomeCompleto = t.nomeCompleto
  );
