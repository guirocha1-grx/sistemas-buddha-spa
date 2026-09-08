-- Limpeza pontual: palpites "Agendado (IA)" que já tinham um atendimento
-- real do Belle (mesmo cliente, mesma data) importado antes do fix em
-- server/db.ts (upsertAtendimentosBelleImportados) casar por nome+data em
-- vez de clienteId. O bug fazia esses palpites nunca serem removidos,
-- então ficavam duplicados ao lado do atendimento real (achado real
-- 2026-09-08, Conciliação PDV Fase 3).
--
-- Duas tentativas de DELETE multi-tabela (INNER JOIN...ON e depois junção
-- por vírgula) deram erro de sintaxe no TiDB, sempre logo após a 2ª
-- tabela — esse TiDB não aceita DELETE multi-tabela. Reescrito como DELETE
-- de uma tabela só, com o cruzamento numa subquery correlacionada.
DELETE FROM belle_atendimentos
WHERE status = 'Agendado (IA)'
  AND EXISTS (
    SELECT 1 FROM belle_atendimentos AS real
    WHERE real.unidadeId = belle_atendimentos.unidadeId
      AND real.dataAtendimento = belle_atendimentos.dataAtendimento
      AND LOWER(real.clienteNome) = LOWER(belle_atendimentos.clienteNome)
      AND real.status <> 'Agendado (IA)'
  );
