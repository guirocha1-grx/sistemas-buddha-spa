-- Limpeza pontual: palpites "Agendado (IA)" que já tinham um atendimento
-- real do Belle (mesmo cliente, mesma data) importado antes do fix em
-- server/db.ts (upsertAtendimentosBelleImportados) casar por nome+data em
-- vez de clienteId. O bug fazia esses palpites nunca serem removidos,
-- então ficavam duplicados ao lado do atendimento real (achado real
-- 2026-09-08, Conciliação PDV Fase 3).
DELETE ia FROM belle_atendimentos ia
INNER JOIN belle_atendimentos real
  ON real.unidadeId = ia.unidadeId
  AND real.dataAtendimento = ia.dataAtendimento
  AND LOWER(real.clienteNome) = LOWER(ia.clienteNome)
  AND real.status <> 'Agendado (IA)'
WHERE ia.status = 'Agendado (IA)';
