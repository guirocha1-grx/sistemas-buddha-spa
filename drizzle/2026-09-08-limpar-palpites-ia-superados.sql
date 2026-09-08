-- Limpeza pontual: palpites "Agendado (IA)" que já tinham um atendimento
-- real do Belle (mesmo cliente, mesma data) importado antes do fix em
-- server/db.ts (upsertAtendimentosBelleImportados) casar por nome+data em
-- vez de clienteId. O bug fazia esses palpites nunca serem removidos,
-- então ficavam duplicados ao lado do atendimento real (achado real
-- 2026-09-08, Conciliação PDV Fase 3).
--
-- Três tentativas anteriores (INNER JOIN...ON, junção por vírgula, EXISTS
-- com subquery) deram o mesmo erro de sintaxe no TiDB, sempre logo após a
-- 2ª tabela — causa real: o alias "real" é palavra reservada do SQL (tipo
-- numérico). Troca o alias pra "outro".
DELETE FROM belle_atendimentos
WHERE status = 'Agendado (IA)'
  AND EXISTS (
    SELECT 1 FROM belle_atendimentos AS outro
    WHERE outro.unidadeId = belle_atendimentos.unidadeId
      AND outro.dataAtendimento = belle_atendimentos.dataAtendimento
      AND LOWER(outro.clienteNome) = LOWER(belle_atendimentos.clienteNome)
      AND outro.status <> 'Agendado (IA)'
  );
