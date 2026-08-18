ALTER TABLE `agentes_prompt_versoes` DROP INDEX `agentes_prompt_versoes_agente_status_idx`;
CREATE UNIQUE INDEX `agentes_prompt_versoes_agente_unidade_versao_idx` ON `agentes_prompt_versoes` (`agenteId`, `unidadeId`, `versao`);
CREATE INDEX `agentes_prompt_versoes_agente_unidade_status_idx` ON `agentes_prompt_versoes` (`agenteId`, `unidadeId`, `status`);
