# Evolução dos agentes de atendimento — atualização 10/09

**Data da análise:** 10/09/2026
**Autor:** Claude (Sonnet 5), a pedido do Guilherme
**Período coberto:** 06/09 14:34 → 10/09 16:20 (checkpoint anterior: `analise_evolucao_agentes_2026-09-06.md`)
**Método:** consulta somente leitura direto no TiDB de produção via `POST /api/claude-consulta`, mesma metodologia dos relatórios anteriores.

## 1. Resumo executivo

Volume: **615 execuções** no período (328 concluídas, 231 ignoradas, 56 com erro técnico, 0 pendentes).

| Indicador | 06/09 (checkpoint anterior) | 10/09 (agora) | Leitura |
|---|---:|---:|---|
| Falhas técnicas (agregado) | 53 em 476 (11,1%) | **56 em 615 (9,1%)** | Melhorou um pouco no total — mas a concentração piorou (seção 2) |
| Aprovação entre decisões humanas | 96,0% | **98,7%** | Melhor checkpoint desde que comecei a acompanhar |
| Reprovação entre decisões humanas | 4,0% | **1,3%** | Caiu mais de 2/3 |
| Aprovadas que ainda precisam de edição | 96,9% | **88,9%** | Melhorou (mais sugestões prontas pra enviar sem editar) |

Os 3 indicadores de qualidade humana melhoraram juntos — é o melhor checkpoint em qualidade desde que este acompanhamento começou. Mas essa métrica só enxerga o que chega até a recepção decidir. O problema real deste período está atrás da taxa agregada de erro: no total ela até caiu, mas isso esconde uma concentração muito mais grave numa única especialista — Carol falha em **quase 1 a cada 4 tentativas reais** (seção 3), não em 9%.

## 2. As 56 falhas técnicas — 1 causa só, diferente do checkpoint anterior

O checkpoint de 06/09 tinha 2 causas distintas (truncamento de JSON + créditos da OpenAI esgotados, este último resolvido e **sem nenhuma recorrência** neste período — 0 ocorrências de `insufficient_quota`/`credit_balance_exhausted`). Desta vez é **1 padrão único e 100% consistente**: todas as 56 falhas têm a mesma assinatura —

> `O especialista não retornou o contrato JSON esperado; conteúdo bruto: {"message":"","status":"in_process","summary":"..."}`

`message` sempre vazio, `status` sempre `"in_process"`, `summary` sempre bem formado e detalhado (às vezes até 300+ caracteres de notas internas). Não é truncamento — o JSON está completo e válido, só que o campo que vira a resposta pro cliente vem em branco. Reexaminando os dados: esse mesmo padrão **já existia desde 03-04/09** (1 ocorrência em 03/09, 12 em 04/09), ou seja, uma parte real dos "31 truncamentos" que o relatório de 06/09 atribuiu a corte de resposta por orçamento de token **provavelmente já era este mesmo bug de `message` vazio**, não truncamento de verdade — vale corrigir essa hipótese anterior.

| Data | Ocorrências |
|---|---:|
| 06/09 | 12 |
| 07/09 | 15 |
| 08/09 | 7 |
| 09/09 | 13 |
| 10/09 (até 16:20) | 8 |

Nenhum código de agente mudou neste período inteiro (confirmei via `git log` em todos os arquivos `*agente*` desde 06/09 13:54 — zero commits). Ou seja, o bug não foi introduzido por mudança recente; está ativo e sem correção há pelo menos 7 dias corridos.

## 3. Concentração real — Carol falha em ~23% das tentativas de verdade

| Especialista | Concluída | Erro | Taxa de erro (sobre tentativas reais, excluindo "ignorada") |
|---|---:|---:|---:|
| **Carol** | 176 | **52** | **22,8%** |
| Bianca | 31 | 3 | 8,8% |
| Diana | 22 | 2 | 8,3% |
| Estela | 66 | 0 | 0% |
| Fabricia | 2 | 0 | 0% |

Carol concentra 52 das 56 falhas (92,9%) — mesma concentração do checkpoint anterior (27 de 31, 87%), só que agora numa causa diferente e com uma taxa de erro isolada muito mais alta do que a taxa agregada de 9,1% deixa parecer. Carol é a especialista de agendamento — o fluxo dela usa o status `"in_process"` com mais frequência que as outras (é natural, ela coleta dado por dado ao longo de várias mensagens), o que bate exatamente com o padrão do bug (`message` vazio só aparece junto com `status: "in_process"`). Hipótese: o prompt da Carol pode estar deixando ambíguo se o texto de resposta pro cliente deve ir em `message` ou se `summary` (pensado como nota interna pra recepção) já basta — o modelo parece estar escolhendo preencher só `summary` em boa parte dos casos de coleta parcial.

## 4. As 2 rejeições — mesmo padrão dos 2 casos, mas um achado novo

| id | Especialista | Comentário da recepção | Sugestão (trecho) | Achado |
|---|---|---|---|---|
| 2070100 | Carol | "fora de contexto" | *"Boa tarde! Que bom ter você aqui 😊\n\n**Que bom ter você aqui 😊**\n\nVocê tem preferência por algum(a) terapeuta?..."* | A frase de acolhimento aparece **duas vezes seguidas**, palavra por palavra — achado novo, não visto nos 4 checkpoints anteriores. Cliente só tinha pedido "massagem com minha irmã"; nada no histórico justifica a duplicação. Merece investigar se é concatenação de 2 saídas do modelo ou repetição do próprio template de acolhimento. |
| 2610024 | Carol | "fora de contexto" | *"Por favor, nos envie a foto desse voucher... Você tem preferência por algum(a) terapeuta? 😊 **E, caso possua voucher, poderia me enviar, por gentileza?**"* | A mensagem de entrada estava vazia (cliente mandou uma imagem — o voucher, provavelmente) e a resposta pede a foto do voucher **duas vezes** na mesma mensagem. É a mesma família de "contexto não lido" (imagem enviada, ignorada) apontada nos checkpoints de 03/09, 06/09 e agora este — 3º/4º checkpoint seguido com esse padrão. Já não dá pra tratar como caso pontual. |

Nas 2 rejeições deste período a queixa foi literalmente a mesma coisa duas vezes dentro da própria mensagem — bem diferente das rejeições anteriores (que eram sobre ordem de pergunta, tom, ou reabertura de conversa). Vale investigar junto com a seção 2: se o bug do `message` vazio for por causa de uma tentativa de retry/fallback gerando 2 saídas e concatenando sem dedupe, essas duas coisas podem ter a mesma raiz.

## 5. Por especialista (decisões humanas, 155 no total)

| Especialista | Decisões | % do total | Editada | Aceita como está | Rejeitada | Aprovação |
|---|---:|---:|---:|---:|---:|---:|
| Carol | 80 | 51,6% | 76 | 2 | 2 | 97,5% |
| Estela | 36 | 23,2% | 32 | 4 | 0 | 100% |
| Bianca | 17 | 11,0% | 13 | 4 | 0 | 100% |
| Áurea | 16 | 10,3% | 11 | 5 | 0 | 100% |
| Diana | 5 | 3,2% | 3 | 2 | 0 | **100%** |
| Fabrícia | 1 | 0,6% | 1 | 0 | 0 | 100% |

Carol segue concentrando a maioria das decisões (era 55,4% em 06/09, agora 51,6% — leve queda) e ainda concentra as 2 rejeições, mas com taxa de aprovação alta (97,5%) — o problema dela neste checkpoint não é qualidade da resposta quando ela chega, é a taxa de erro técnico antes de chegar (seções 2-3).

**Diana: 100% de aprovação (5/5), zero rejeição** — o fix de 06/09 (evitar perguntas numeradas de uma vez, ver comentário em `agentesDb.ts`) parece ter funcionado; recuperou de 77,8% no checkpoint anterior pra 100% agora, ainda que sobre uma base pequena (5 decisões).

## 6. O que mudou no código desde 06/09 13:54

**Nada.** Zero commits em qualquer arquivo com "agente" no nome (`agentesDb.ts`, `agentesService.ts`, `agentesPolicy.ts`, `agentesIntencoes.ts`, `agentesAgrupamento.ts`) desde o checkpoint anterior. Os dois achados novos deste relatório (bug do `message` vazio na seção 2 e as duplicações na seção 4) não são regressão de mudança recente — são comportamento já presente, só que agora com dados suficientes pra caracterizar melhor.

## 7. Recomendações

1. **Investigar o `message` vazio da Carol em status `in_process`** (seção 2-3) — é o item de maior impacto deste relatório: ~23% das tentativas reais da Carol falham silenciosamente (cliente não recebe nenhuma sugestão pra recepção avaliar). Ver se o prompt da Carol deixa claro que `message` (resposta pro cliente) é sempre obrigatório mesmo quando o status é `in_process` (coleta parcial) — hoje parece que o modelo às vezes entende que preencher só `summary` (nota interna) é suficiente.
2. **Investigar a duplicação de texto nas 2 rejeições** (seção 4) — frase repetida literalmente duas vezes na mesma mensagem, achado novo. Vale checar se há concatenação de 2 saídas/tentativas do modelo sem dedupe, possivelmente relacionado ao mesmo mecanismo do item 1.
3. **"Contexto não lido" (imagem/voucher enviado e ignorado) — 4º checkpoint seguido com esse padrão** (03/09, 06/09, e agora este de novo, caso 2610024). Já passou de coincidência pra causa recorrente; merece uma investigação dedicada, não só anotação a cada relatório.
4. Segue de pé a recomendação nº5 do relatório de 03/09 e nº5 de 06/09 (capturar `error.cause`, não só `error.message`, ao gravar falhas) — ajudaria a confirmar/descartar a hipótese do item 2 acima sem precisar inferir pelo padrão do texto.
5. **Positivo a manter**: os 3 indicadores de qualidade humana (aprovação, reprovação, edição) melhoraram juntos neste checkpoint — o melhor desde que o acompanhamento começou — e a Diana se recuperou totalmente do problema de perguntas numeradas. Nenhuma ação necessária aqui, só registrar que o ajuste de 06/09 funcionou.
