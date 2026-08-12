-- Backfill: dias de Caixa Físico com R$0,00 já sugeridos como "Receita em
-- Espécie" antes da regra de auto-confirmação (server/db.ts,
-- categorizarTransacaoAutomaticamente) entrar em vigor. Daqui pra frente
-- esses casos já nascem "confirmada" — isto só corrige o que já estava
-- parado em "sugerida" esperando 1 clique manual por dia.
UPDATE inter_extratos
SET categorizacaoStatus = 'confirmada'
WHERE origem = 'caixa_fisico'
  AND valor = 0
  AND categorizacaoStatus = 'sugerida';
