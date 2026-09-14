# Evolução dos agentes de atendimento — atualização 14/09

**Data da análise:** 14/09/2026
**Autor:** Claude (Sonnet 5), a pedido do Guilherme
**Período coberto:** 10/09 16:20 → 14/09 17:02 (checkpoint anterior: `analise_evolucao_agentes_2026-09-10.md`)
**Método:** consulta somente leitura direto no TiDB de produção via `POST /api/claude-consulta`, mesma metodologia dos relatórios anteriores.

> **Errata (14/09, depois da publicação deste relatório):** a seção 6 abaixo
> ("Nada. `git log` não retorna nenhum commit") está ERRADA — o comando usado
> (`git log --since=... -- '*agente*'`) tinha um problema de quoting/glob que
> não achava nada mesmo quando havia commits. O plano de correção FOI
> aplicado, pelo próprio usuário, no commit `898d2fe` (10/09 15:26 BRT) —
> antes até do início do período coberto aqui. Ou seja: os 11 erros de
> "in_process"/handoff da seção 2 e a saudação duplicada da seção 4
> (sugestão 2940015) aconteceram **com o fix já em produção**, não apesar da
> falta dele — achados novos e mais graves do que o relatório original deu a
> entender. Corrigidos no mesmo dia (14/09): handoff silencioso entre
> especialistas com `message` vazio, saudação duplicada pelo próprio modelo
> (não só pelo código), log de erro sem cortar em 500 caracteres, e supressão
> de sugestão quando a equipe já respondeu manualmente (a causa das 3
> rejeições da Estela na seção 4). O resto da análise (números, causas,
> recomendações 2-6) continua válido.

## 1. Resumo executivo

Volume: **654 execuções** no período (386 concluídas, 256 ignoradas, 12 com erro técnico, 0 pendentes).

| Indicador | 10/09 (checkpoint anterior) | 14/09 (agora) | Leitura |
|---|---:|---:|---|
| Falhas técnicas (agregado) | 56 em 615 (9,1%) | **12 em 654 (1,8%)** | Melhora grande — a taxa caiu a menos de 1/5 |
| Aprovação entre decisões humanas | 98,7% | **97,8%** | Leve queda, ainda alta |
| Reprovação entre decisões humanas | 1,3% | **2,2%** | Leve alta, mas sobre uma amostra pequena (4 casos) |
| Aprovadas que ainda precisam de edição | 88,9% | **91,6%** | Leve alta |

O maior sinal deste checkpoint é a queda da taxa de erro técnico — mas **nenhum código mudou** (seção 6), então não é um fix: é o bug de sempre (seção 2) aparecendo com menos frequência, por acaso de tráfego. Ele continua ativo e, pela primeira vez, peguei um caso onde ele **chegou de verdade no cliente** (seção 4). O achado novo deste período é outro: 3 das 4 rejeições são da Estela, e todas têm a mesma causa — a recepção já estava respondendo a conversa pessoalmente quando a sugestão da IA chegou (seção 4).

## 2. As 12 falhas técnicas — mesmo bug do checkpoint anterior, com uma variação nova

Confirma o mesmo padrão apontado em 06/09 e 10/09: nenhuma falha é truncamento de verdade, é sempre o campo `message` vindo vazio quando o especialista ainda está coletando dado (`status` deveria ser `"in_process"`).

| Data | Ocorrências | Observação |
|---|---:|---|
| 10/09 (a partir de 16:20) | 6 | 5x `status:"in_process"`, 1x `status:"bianca"` |
| 11/09 | 1 | `status:"bianca"` |
| 12/09 | 1 | Não é o bug de sempre — conexão com o banco caiu no meio de uma query (`Connection lost: The server closed the connection`), incidente isolado de infra, sem padrão |
| 13/09 | 2 | `status:"fabricia"`, `status:"carol"` |

**Variação nova encontrada neste período:** em 4 das 11 ocorrências do bug de verdade, o campo `status` não veio `"in_process"` — veio o **nome do próprio agente** (`"bianca"`, `"fabricia"`, `"carol"`), um valor que não existe no contrato esperado. `message` continua vazio nos 4 casos. É a mesma família de erro (o modelo não preenche `message` numa resposta parcial), só que agora também erra o valor de `status` às vezes — reforça a hipótese do relatório de 10/09: o prompt não deixa claro o suficiente que esses dois campos são obrigatórios e o que cada um deve conter.

Volume muito menor que o checkpoint anterior (11 ocorrências reais em ~4 dias, contra 56 em ~4 dias) — mas como não houve nenhuma mudança de código (seção 6), a explicação mais provável é variação natural de quantas conversas passaram por coleta parcial (`in_process`) neste período, não uma correção real. O bug **continua presente e sem fix**.

## 3. Concentração por especialista — Carol melhorou bastante, mas o bug é dela

| Especialista | Concluída | Erro | Taxa de erro (sobre tentativas reais) |
|---|---:|---:|---:|
| **Bianca** | 18 | 2 | **10,0%** |
| Fabricia | 13 | 1 | 7,1% |
| Carol | 225 | 9 | 3,8% |
| Diana | 28 | 0 | 0% |
| Estela | 80 | 0 | 0% |

Carol caiu de 22,8% (checkpoint anterior) pra 3,8% — maior queda entre os checkpoints até agora, mesmo sem mudança de código; de novo, parece variação de tráfego (menos conversas de agendamento entraram em coleta parcial neste período), não correção. Continua sendo, junto com Bianca e Fabrícia, a família de especialistas que usa `status:"in_process"` (coleta de dado por dado) — Diana e Estela, que não usam esse padrão, seguem em 0% de erro.

## 4. As 4 rejeições — 2 padrões, 1 novo

| id | Especialista | Comentário da recepção | Achado |
|---|---|---|---|
| 3120012 | Carol | "fora de contexto." | Pergunta sobre terapeuta e voucher repetida **duas vezes** na mesma mensagem — mesma família de "contexto não lido"/duplicação já vista em 03/09, 06/09 e 10/09. 5º checkpoint seguido com esse padrão. |
| 3030003 | Estela | "fora de contexto." | A recepção já tinha respondido pessoalmente ("Tenho sim, vou te enviar") quando a sugestão da Estela chegou oferecendo a mesma coisa. |
| 3090042 | Estela | (sem comentário) | A recepção (Débora) já estava conduzindo a conversa em tempo real sobre a mesma tabela de valores quando a sugestão chegou. |
| 3150063 | Estela | "fora de contexto." | A recepção (Sheila) já estava no meio de um atendimento pessoal (cobrança, voucher) quando a sugestão chegou oferecendo textos pro voucher. |

**Achado novo:** as 3 rejeições da Estela são de conversas **diferentes**, em horários diferentes (11/09, meia-noite/tarde/noite), mas com a mesma causa raiz confirmada olhando o histórico de mensagens de cada uma: em todas, um atendente humano (nome real aparece nas mensagens, ex. "*Débora:*", "*Sheila:*") já estava respondendo a conversa pessoalmente, e a sugestão da IA chegou depois, oferecendo algo que o humano já tinha oferecido ou resolvido. Não é a IA entendendo errado o contexto — é uma corrida entre o atendimento humano ao vivo e a geração da sugestão, e a sugestão perde e chega atrasada. Estela nunca tinha aparecido nas rejeições dos 4 checkpoints anteriores; isso é comportamento novo, não recorrência de um problema antigo.

**Achado mais grave do período:** procurando o texto de saudação duplicada (mesmo padrão do caso 2070100 de 10/09) em TODAS as sugestões do período, não só nas rejeitadas, achei outra ocorrência — dessa vez **aprovada**: sugestão 2940015 (Carol, 10/09 17:30), texto *"Boa tarde! Que bom ter você aqui 😊\n\nQue bom ter você aqui 😊\n\n..."*, com a mesma pergunta sobre terapeuta/voucher repetida em seguida. A recepção marcou como "editada", mas o `textoFinal` gravado **ainda contém a saudação duplicada** — e o campo `enviadaEm` confirma que foi enviado ao cliente de verdade (17:30:41, 32 segundos depois de criada). Diferente das vezes anteriores, em que o problema só apareceu em avaliações humanas, desta vez tenho confirmação de que o bug chegou no cliente final sem ser notado nem pela recepção.

## 5. Por especialista (decisões humanas, 183 no total)

| Especialista | Decisões | Editada | Aceita como está | Rejeitada | Aprovação |
|---|---:|---:|---:|---:|---:|
| Carol | 106 | 100 | 5 | 1 | 99,1% |
| Estela | 39 | 31 | 5 | 3 | 92,3% |
| Áurea | 13 | 10 | 3 | 0 | 100% |
| Diana | 10 | 10 | 0 | 0 | 100% |
| Fabrícia | 8 | 7 | 1 | 0 | 100% |
| Bianca | 7 | 6 | 1 | 0 | 100% |

Carol segue concentrando a maioria das decisões (106 de 183, 57,9%) mas com a melhor taxa de aprovação do grupo neste checkpoint (99,1%, só 1 rejeição). Estela, que historicamente tinha aprovação de 100% em todos os checkpoints anteriores, caiu pra 92,3% — puxado inteiramente pelas 3 rejeições da seção 4 (mesma causa: sugestão atrasada em relação ao atendimento humano ao vivo).

## 6. O que mudou no código desde 10/09 16:20

**Nada.** `git log --since="2026-09-10 16:20:00" -- '*agente*'` não retorna nenhum commit. Todos os achados deste relatório (queda de volume do bug de `message` vazio, a variação `status:<nome do agente>`, o caso confirmado de saudação duplicada enviada ao cliente, e o padrão novo de rejeição da Estela) são comportamento observado, não efeito de mudança recente.

## 7. Recomendações

1. **O caso 2940015 muda a prioridade da recomendação nº1 dos relatórios de 06/09 e 10/09** — não é mais só uma preocupação teórica: o texto duplicado *chegou no cliente* e passou pela revisão humana sem ser notado. Vale tratar como prioridade alta: garantir que a saudação nunca seja gerada duas vezes pelo próprio modelo (ver `aplicarSaudacaoInicialEspecialista`/`removerSaudacaoDoInicio` em `agentesService.ts` — o fix desenhado em plano anterior ainda não foi aplicado).
2. **Novo: suprimir ou sinalizar sugestão da IA quando um humano já respondeu a conversa recentemente** (seção 4, as 3 rejeições da Estela) — hoje a sugestão é gerada sem checar se a última mensagem "enviada" na conversa já foi de um atendente humano nos últimos minutos. Uma checagem simples (não gerar/mostrar sugestão se a penúltima mensagem enviada foi humana e muito recente) evitaria essa corrida.
3. **`status:"in_process"` continua sem correção** (seção 2) — mesma recomendação dos 2 relatórios anteriores: deixar explícito no prompt que `message` é obrigatório mesmo em coleta parcial, e validar que `status` só aceita os valores do contrato (a variação `status:<nome do agente>` mostra que o modelo às vezes nem acerta esse campo).
4. **"Contexto não lido" segue recorrente** (caso 3120012) — 5º checkpoint seguido com esse padrão (03/09, 06/09, 10/09, e agora). Junto com a recomendação nº1, vale tratar como item permanente até ter um fix aplicado, não só anotação.
5. O incidente de conexão com o banco em 12/09 (seção 2) foi isolado — 1 ocorrência, sem padrão. Não precisa ação, só registro.
6. Segue de pé a recomendação de capturar `error.cause` nas falhas técnicas (relatórios de 03/09, 06/09, 10/09) — ajudaria a distinguir automaticamente o bug de contrato JSON do incidente de infra da seção 2 sem precisar ler o texto do erro à mão.
