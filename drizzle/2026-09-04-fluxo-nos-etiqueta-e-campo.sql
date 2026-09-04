-- Fase 2 (2026-09-04) — dois novos tipos de nó de Fluxo: "aplicar_etiqueta"
-- (marca o cliente da conversa com uma etiqueta, criando-a como tipo
-- "sistema" se ainda não existir) e "incrementar_campo" (soma um valor ao
-- campo personalizado numérico do cliente, criando o campo se não existir).
-- Motor de execução: server/fluxos.ts. Editor visual: FluxoDetalhe.tsx.
ALTER TABLE `fluxo_nos`
  MODIFY COLUMN `tipo` ENUM('mensagem', 'aguardar', 'condicional', 'salvar_variavel', 'fim', 'randomizador', 'webhook', 'midia', 'menu', 'aplicar_etiqueta', 'incrementar_campo') NOT NULL;
