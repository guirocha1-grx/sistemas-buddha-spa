-- A Estela dava só 1 valor por vez (ex.: só 90min quando o cliente
-- pediu "todos os valores" do Relaxante — achado real, rejeição
-- 2026-09-02) porque ela não tinha acesso aos Scripts de "Terapias
-- (descrição)" (23 scripts, cada um com descrição, vídeo e o valor de
-- cada duração já formatado) -- hoje exclusivos da Bianca. Libera
-- esses Scripts também pra Estela, que agora pode retornar o scriptId
-- deles em vez de compor a resposta na mão (ver prompt atualizado).
UPDATE `scripts`
SET `agentesPermitidos` = JSON_ARRAY_APPEND(`agentesPermitidos`, '$', 'estela')
WHERE `ativo` = 1
  AND `categoriaScript` LIKE 'Terapias%'
  AND NOT JSON_CONTAINS(`agentesPermitidos`, '"estela"');
