# Evolução dos agentes de atendimento — atualização 06/09

**Data da análise:** 06/09/2026
**Autor:** Claude (Sonnet 5), a pedido do Guilherme
**Período coberto:** 03/09 19:49 → 06/09 13:54 (checkpoint anterior: `analise_evolucao_agentes_2026-09-03.md`)
**Método:** consulta somente leitura direto no TiDB de produção via `POST /api/claude-consulta`, mesma metodologia dos relatórios anteriores.

## 0. Ação urgente — créditos da OpenAI podem estar esgotados agora

20 execuções falharam com **`insufficient_quota` / `credit_balance_exhausted`** — a mensagem literal da OpenAI é *"You have no credits remaining. Add credits to continue using the API"*. Isso nunca tinha acontecido antes (0 ocorrências em todos os checkpoints anteriores). Começou em **05/09 21:02** e a última ocorrência registrada foi **06/09 13:48**, poucos minutos antes deste relatório — ou seja, **pode estar acontecendo neste exato momento**. Enquanto durar, uma parte dos clientes que escrevem pra unidade fica sem nenhuma sugestão de resposta gerada (a execução cai em erro, sem sugestão pra recepção avaliar). Recomendo checar o saldo/billing da OpenAI agora, antes de ler o resto do relatório.

## 1. Resumo executivo

Volume: **476 execuções** no período (212 concluídas, 210 ignoradas, 53 com erro técnico, 1 pendente).

| Indicador | 03/09 (checkpoint anterior) | 06/09 (agora) | Leitura |
|---|---:|---:|---|
| Falhas técnicas | 13 em 510 (2,5%) | **53 em 476 (11,1%)** | Regrediu bastante — dois problemas distintos, ver seção 2 |
| Aprovação entre decisões humanas | 91,3% | **96,0%** | Melhorou ~4,7 p.p. |
| Reprovação entre decisões humanas | 8,7% | **4,0%** | Caiu mais da metade |
| Aprovadas que ainda precisam de edição | 88,3% | **96,9%** | Piorou (menos sugestões prontas pra enviar sem editar) |

Sinal misto, mas o principal indicador de qualidade humana (aprovação vs. reprovação) **melhorou de verdade** — reforça que o ajuste de saudação incondicional do dia 03/09 funcionou. O ponto de atenção real não é qualidade de redação, é confiabilidade técnica: a taxa de erro mais que quadruplicou, mas por dois motivos que não têm nada a ver um com o outro (seção 2).

## 2. As 53 falhas técnicas — dois problemas diferentes

| Assinatura | Total | Concentração | Especialista |
|---|---:|---|---|
| Especialista não retornou o contrato JSON esperado (resposta cortada/truncada) | 31 | 04/09 13:53 → 05/09 20:03 (espalhado ao longo de ~1,5 dia, não é um pico isolado) | **Carol: 27** · Fabrícia: 2 · Diana: 2 |
| `429 insufficient_quota` — créditos da OpenAI esgotados | 20 | 05/09 21:02 → 06/09 13:48 (ver seção 0) | Receptor (roteamento, sem especialista ainda): 15 · Estela: 2 · Carol: 2 · Fabrícia: 1 |
| Resposta do LLM sem texto (`choices` sem conteúdo) | 2 | 04/09 11:41 e 14:31 | Carol |

**a) Carol concentra 27 das 31 falhas de contrato JSON (87%).** No checkpoint de 28/08, esse mesmo tipo de erro (orçamento de raciocínio esgotado, resposta cortada no meio do JSON) tinha aparecido 58 vezes só na Áurea; aqui é a Carol que concentra. Vale comparar o tamanho do prompt/contexto da Carol com o da Áurea da época — se o padrão se repete, a causa provável é a mesma (span de saída maior que o espaço de token restante).

**b) A falha de créditos é infraestrutura pura, não qualidade de prompt** — ver seção 0. Sem ação de código a fazer aqui, só financeira/operacional.

## 3. As 4 rejeições

| id | Especialista | Comentário da recepção | Achado |
|---|---|---|---|
| 2070060 | Carol | "Apresentação primeiro" | **Não é regressão do fix de 03/09** — investiguei a conversa (690002): a última mensagem enviada pela equipe nessa conversa foi em **14/08**, 22 dias antes desse novo contato do cliente em 05/09. `equipeJaRespondeu` olha o histórico inteiro da conversa, então tecnicamente "a equipe já respondeu" — só que 22 dias atrás, um assunto totalmente diferente. Isso é exatamente o cenário da recomendação #2 do relatório de 03/09 ("reapresentação ao trocar de especialista/assunto"), que na época só tinha 1 caso — agora são 2, e este tem um número concreto: **22 dias de silêncio**. Dá pra propor uma regra objetiva: sem mensagem enviada há mais de N dias (7? 14?) conta como reabertura, dispara saudação de novo. |
| 1950008 | Diana | "Não colocar muitas perguntas numeradas assim, sempre uma pergunta por vez" | Padrão novo, não visto nos checkpoints anteriores. A sugestão rejeitada: *"...envie os dados abaixo: 1) Serviço desejado...; 2) Nome completo...; 3) Mensagem opcional..."* — 3 perguntas numeradas de uma vez. Vale checar se o prompt da Diana (ou de outros) incentiva agrupar perguntas em lista numerada em algum fluxo de coleta de dados. |
| 1950013 | Carol | "Ela já enviou acima a foto do voucher" | Contexto não lido — mesmo padrão do checkpoint anterior (item 3c de 03/09: "contexto não lido" apareceu 2 vezes lá também). Terceiro checkpoint seguido com esse tipo de falha; talvez valha a pena investigar como causa recorrente, não pontual. |
| 1950003 | Diana | (sem comentário) | Rejeitada sem motivo registrado — dúvida sobre presentear voucher pra terceiro. |

## 4. Por especialista (decisões humanas, 101 no total)

| Especialista | Decisões | % do total | Editada | Aceita como está | Rejeitada | Aprovação |
|---|---:|---:|---:|---:|---:|---:|
| Carol | 56 | 55,4% | 54 | 0 | 2 | 96,4% |
| Estela | 16 | 15,8% | 15 | 1 | 0 | 100% |
| Áurea | 12 | 11,9% | 10 | 2 | 0 | 100% |
| Diana | 9 | 8,9% | 7 | 0 | 2 | 77,8% |
| Bianca | 4 | 4,0% | 4 | 0 | 0 | 100% |
| Fabrícia | 4 | 4,0% | 4 | 0 | 0 | 100% |

Carol segue concentrando a maioria das decisões (era 57,3% em 03/09, agora 55,4% — estável) e também a maior parte das rejeições (2 de 4, empatada com Diana em número absoluto mas Diana tem taxa de aprovação bem menor: 77,8% contra 96,4% da Carol, sobre uma base pequena de 9 decisões).

## 5. O que mudou no código desde 03/09 19:49

| Commit | Quando | O quê |
|---|---|---|
| `5e9df0a` | 03/09 20:44 | Cumprimenta sempre na 1ª resposta da conversa (não só quando o cliente cumprimenta) + janela de agrupamento de 10s→25s na abertura |

Só esse commit mexeu em código de agentes no período — nada tocou na geração de JSON da Carol nem no tratamento de erro/rate-limit da chamada ao LLM. Ou seja, os dois problemas da seção 2 não foram causados por mudança de código recente; são um problema de infraestrutura (créditos) e um problema pré-existente que só ficou mais visível (truncamento de JSON).

## 6. Recomendações

1. **Checar/recarregar os créditos da OpenAI agora** (seção 0) — é a única coisa deste relatório com efeito imediato em clientes reais esperando resposta.
2. **Regra objetiva pra reabertura de conversa** (seção 3, caso 2070060): tratar "equipe não responde há mais de N dias" como equivalente a 1ª resposta pra fins de saudação — converte a recomendação #2 do relatório de 03/09 (que só tinha 1 caso) numa regra com critério mensurável, agora com 2 casos reais (o de 03/09 e o de 22 dias deste relatório).
3. **Investigar o truncamento de JSON concentrado na Carol** (27 de 31 casos) — comparar tamanho de prompt/contexto da Carol com o que causou o mesmo padrão na Áurea em 28/08, ver se é o mesmo mecanismo (orçamento de raciocínio insuficiente pro tamanho da resposta).
4. **Perguntas numeradas em lista** (caso Diana, 1950008) — checar se algum fluxo de coleta de dados está gerando listas numeradas de pergunta, contra a preferência já conhecida da recepção de "uma pergunta por vez".
5. Segue de pé a recomendação nº5 do relatório de 03/09 (capturar `error.cause`, não só `error.message`, ao gravar falhas) — teria ajudado a diagnosticar a causa real dos 31 truncamentos de JSON mais rápido, sem precisar inferir pelo padrão de horário e especialista.
