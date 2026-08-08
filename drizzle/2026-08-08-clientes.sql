-- Base local de clientes — passou a existir porque o acesso via API do
-- Belle foi negado (franqueador precisa autorizar, 2026-08-08). Alimentada
-- por importação manual da planilha "[Buddha] Clientes" (ver
-- server/clientesXlsxParser.ts e clientes.importarXlsx no tRPC).
-- Roda uma vez, em produção, via webdev_execute_sql.

CREATE TABLE clientes (
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

CREATE INDEX clientes_cpf_idx ON clientes (cpf);
CREATE INDEX clientes_nome_idx ON clientes (nome);
