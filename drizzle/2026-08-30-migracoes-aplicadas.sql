-- Tabela de controle do runner de migrações (Configurações > Banco de
-- Dados). O próprio runner cria essa tabela sob demanda (CREATE TABLE IF
-- NOT EXISTS) na primeira vez que a tela é aberta — não precisa rodar
-- manualmente. Esse arquivo existe só pra constar no histórico.
CREATE TABLE IF NOT EXISTS `_migracoes_aplicadas` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nomeArquivo` VARCHAR(255) NOT NULL,
  `aplicadaEm` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `aplicadaPorUserId` INT NULL,
  `aplicadaPorNome` VARCHAR(200) NULL,
  `apenasRegistrada` BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY `migracoes_aplicadas_nome_idx` (`nomeArquivo`)
);
