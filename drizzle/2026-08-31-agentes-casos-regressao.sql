-- Lote 2 do plano de qualidade dos agentes (Manus, 28/08) — suíte de
-- regressão com casos reais. Ver plano_gradual_qualidade_agentes.md.
CREATE TABLE IF NOT EXISTS `agentes_casos_regressao` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nome` VARCHAR(200) NOT NULL,
  `chaveAgente` ENUM('bianca','fabricia','estela','carol','diana') NOT NULL,
  `conversaId` INT NOT NULL,
  `ateDataHora` TIMESTAMP NOT NULL,
  `regrasProibidas` JSON NOT NULL,
  `mensagemDeveSerVazia` BOOLEAN NOT NULL DEFAULT FALSE,
  `descricaoEsperada` TEXT NULL,
  `ativo` BOOLEAN NOT NULL DEFAULT TRUE,
  `criadoPorUserId` INT NULL,
  `criadoPorNome` VARCHAR(120) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `agentes_casos_regressao_ativo_idx` (`ativo`)
);

CREATE TABLE IF NOT EXISTS `agentes_regressao_execucoes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `casoId` INT NOT NULL,
  `executadoEm` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `promptVersao` INT NULL,
  `mensagem` TEXT NULL,
  `status` VARCHAR(32) NULL,
  `summary` TEXT NULL,
  `violacoes` JSON NULL,
  `erro` TEXT NULL,
  `notaHumana` INT NULL,
  `comentarioHumano` TEXT NULL,
  `avaliadoPorUserId` INT NULL,
  `avaliadoPorNome` VARCHAR(120) NULL,
  `avaliadoEm` TIMESTAMP NULL,
  KEY `agentes_regressao_execucoes_caso_idx` (`casoId`, `executadoEm`)
);

-- Dois casos reais de 29-30/08/2026 (ver análise de evolução dos agentes)
-- que motivaram o prompt v6 da Carol. WHERE NOT EXISTS evita duplicar se
-- essa SQL rodar mais de uma vez.
INSERT INTO agentes_casos_regressao (nome, chaveAgente, conversaId, ateDataHora, regrasProibidas, descricaoEsperada)
SELECT * FROM (
  SELECT
    'Carol reconhece terapia já mencionada pelo cliente' AS nome,
    'carol' AS chaveAgente,
    3180005 AS conversaId,
    '2026-08-29 13:26:00' AS ateDataHora,
    JSON_ARRAY('qual será a terapia', 'qual sera a terapia') AS regrasProibidas,
    'Cliente já disse "massagem modeladora" na primeira mensagem. Carol deve reconhecer isso e seguir a coleta (horário, terapeuta etc.), não perguntar de novo qual é a terapia.' AS descricaoEsperada
) AS novo
WHERE NOT EXISTS (SELECT 1 FROM agentes_casos_regressao WHERE nome = novo.nome);

INSERT INTO agentes_casos_regressao (nome, chaveAgente, conversaId, ateDataHora, regrasProibidas, descricaoEsperada)
SELECT * FROM (
  SELECT
    'Carol não pergunta quantidade de pessoas sem sinal de acompanhante' AS nome,
    'carol' AS chaveAgente,
    3240002 AS conversaId,
    '2026-08-30 15:38:00' AS ateDataHora,
    JSON_ARRAY('quantas pessoas', 'para uma pessoa', 'só para você', 'somente para você') AS regrasProibidas,
    'Cliente perguntou sobre horário de drenagem sem mencionar acompanhante, casal, presente ou grupo. Carol deve presumir 1 pessoa e não perguntar quantidade.' AS descricaoEsperada
) AS novo
WHERE NOT EXISTS (SELECT 1 FROM agentes_casos_regressao WHERE nome = novo.nome);
