-- Base local de clientes do Belle — nome PRÓPRIO (clientes_belle), não
-- "clientes". Já existe uma tabela `clientes` neste banco com estrutura
-- totalmente diferente, herdada do mobai-crm (colunas tipo/nomeFantasia/
-- leadScore/canalCaptacao/campanha/sexo enum M-F-O/etc.) — descoberto
-- depois que uma primeira tentativa de CREATE TABLE clientes colidiu com
-- ela e um ALTER TABLE subsequente acabou enxertando colunas do Buddha
-- Spa (belleId, cpf, clienteSsu, clienteRbs...) na tabela do Mobai.
--
-- Este script:
-- 1. Derruba qualquer `clientes_belle` que já exista (a tentativa manual
--    anterior, se existir, não tem dado do Buddha Spa ainda — nenhuma
--    importação chegou a rodar com sucesso) e recria do zero com a
--    estrutura exata do schema Drizzle atual.
-- 2. NÃO toca na tabela `clientes` original (do Mobai) — mas ela ficou
--    com colunas extras enxertadas pela tentativa de ALTER TABLE
--    anterior. Rode a consulta no final pra ver quais, e me diga o
--    resultado que eu preparo o DROP COLUMN exato pra limpar isso.

DROP TABLE IF EXISTS clientes_belle;

CREATE TABLE clientes_belle (
  id INT AUTO_INCREMENT PRIMARY KEY,
  belleId BIGINT NOT NULL UNIQUE,
  nome VARCHAR(200) NOT NULL,
  rg VARCHAR(30) NULL,
  cpf VARCHAR(20) NULL,
  dataNascimento VARCHAR(10) NULL,
  sexo ENUM('Feminino', 'Masculino', 'Outros') NULL,
  endereco VARCHAR(300) NULL,
  bairro VARCHAR(120) NULL,
  cidade VARCHAR(120) NULL,
  uf VARCHAR(2) NULL,
  telefone VARCHAR(30) NULL,
  celular VARCHAR(30) NULL,
  celular2 VARCHAR(30) NULL,
  email VARCHAR(200) NULL,
  dataCadastro VARCHAR(10) NULL,
  primeiroAtendimento VARCHAR(10) NULL,
  ultimoAtendimento VARCHAR(10) NULL,
  qtdAtendimentosFinalizados INT NOT NULL DEFAULT 0,
  qtdServicosFinalizados INT NOT NULL DEFAULT 0,
  clienteSsu BOOLEAN NOT NULL DEFAULT FALSE,
  clienteRbs BOOLEAN NOT NULL DEFAULT FALSE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX clientes_belle_cpf_idx ON clientes_belle (cpf);
CREATE INDEX clientes_belle_nome_idx ON clientes_belle (nome);

-- Rodar isso e me mandar o resultado, pra eu limpar as colunas
-- enxertadas por engano na tabela original do Mobai:
SHOW COLUMNS FROM clientes;
