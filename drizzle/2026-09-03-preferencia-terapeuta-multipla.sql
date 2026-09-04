-- Cliente pode preferir mais de um terapeuta na mesma unidade (2026-09-03) —
-- as etiquetas livres do Inbox já mostravam isso na prática ("Pref
-- Larah/Cláudia"). Tabela ainda sem nenhuma linha em produção, então troca
-- de unicidade direto, sem risco de perder dado.
ALTER TABLE `clientes_preferencias_terapeuta`
  DROP INDEX `clientes_pref_terapeuta_cliente_unidade_idx`;

ALTER TABLE `clientes_preferencias_terapeuta`
  ADD UNIQUE INDEX `clientes_pref_terapeuta_cliente_unidade_terapeuta_idx` (`clienteId`, `unidadeId`, `terapeutaId`);
