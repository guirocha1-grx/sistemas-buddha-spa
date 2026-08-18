CREATE TABLE scripts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  categoriaScript VARCHAR(100) NOT NULL,
  script TEXT NOT NULL,
  observacoes TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX scripts_categoria_idx ON scripts (categoriaScript);

CREATE TABLE scripts_uso (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scriptId INT NOT NULL,
  userId INT NOT NULL,
  usadoEm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX scripts_uso_script_idx ON scripts_uso (scriptId);
CREATE INDEX scripts_uso_user_idx ON scripts_uso (userId);
