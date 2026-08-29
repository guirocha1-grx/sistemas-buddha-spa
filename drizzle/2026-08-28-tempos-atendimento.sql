-- Marcos operacionais do atendimento no CRM.
-- Não substituem os dados oficiais do Belle; registram o fluxo local
-- de chamado, início e fim para análise de tempo.
ALTER TABLE `atendimentos_operacional`
  ADD COLUMN `chamadoEm` TIMESTAMP NULL,
  ADD COLUMN `inicioEm` TIMESTAMP NULL,
  ADD COLUMN `fimEm` TIMESTAMP NULL;
