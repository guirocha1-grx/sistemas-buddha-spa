-- Log de auditoria, trazido do mobai-crm — toda mutation autenticada
-- (protectedProcedure/adminProcedure) é gravada aqui por um middleware
-- genérico em server/_core/trpc.ts, sem precisar instrumentar cada
-- procedure. Adaptado pro domínio deste app: sem clienteId (não há
-- tabela local de clientes) nem distinção manual/IA (não há mutations
-- de IA aqui). Roda uma vez, em produção, via webdev_execute_sql.

CREATE TABLE audit_log (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NULL,
  userNome VARCHAR(100) NULL,
  userRole VARCHAR(20) NULL,
  `procedure` VARCHAR(150) NOT NULL,
  inputResumo TEXT NULL,
  sucesso BOOLEAN NOT NULL DEFAULT TRUE,
  erroMsg TEXT NULL,
  duracaoMs INT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX audit_log_user_created_idx ON audit_log (userId, createdAt);
