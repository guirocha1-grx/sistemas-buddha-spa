-- Limpeza pontual: palpites "Agendado (IA)" que já tinham um atendimento
-- real do Belle (mesmo cliente, mesma data) importado antes do fix em
-- server/db.ts (upsertAtendimentosBelleImportados) casar por nome+data em
-- vez de clienteId. O bug fazia esses palpites nunca serem removidos,
-- então ficavam duplicados ao lado do atendimento real (achado real
-- 2026-09-08, Conciliação PDV Fase 3).
--
-- Sintaxe de multi-table DELETE por vírgula (mais antiga que INNER JOIN
-- ... ON) — a primeira tentativa com INNER JOIN deu erro de sintaxe no
-- TiDB ("line 2 column 35 near 'real ON ...'").
DELETE ia FROM belle_atendimentos AS ia, belle_atendimentos AS real
WHERE ia.unidadeId = real.unidadeId
  AND ia.dataAtendimento = real.dataAtendimento
  AND LOWER(ia.clienteNome) = LOWER(real.clienteNome)
  AND ia.status = 'Agendado (IA)'
  AND real.status <> 'Agendado (IA)';
