-- Corrige um falso alarme: a suspeita de colisão com uma tabela
-- `clientes` do mobai-crm (ver drizzle/2026-08-08-clientes-belle.sql)
-- estava errada — mobai-crm mora num banco totalmente separado. A tabela
-- `clientes` vazia hoje neste banco é só a sobra da primeira tentativa
-- (criada antes do falso alarme, nunca chegou a receber import) — sem
-- dado nenhum, segura de descartar. Os 5309 clientes já importados com
-- sucesso ficaram em `clientes_belle`, que vira a `clientes` definitiva.
-- Roda uma vez, em produção, via webdev_execute_sql.

DROP TABLE IF EXISTS clientes;

RENAME TABLE clientes_belle TO clientes;

ALTER TABLE clientes RENAME INDEX clientes_belle_cpf_idx TO clientes_cpf_idx;
ALTER TABLE clientes RENAME INDEX clientes_belle_nome_idx TO clientes_nome_idx;
