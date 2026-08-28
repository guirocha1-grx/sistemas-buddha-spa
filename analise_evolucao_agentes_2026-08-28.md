# Evolução dos agentes de atendimento

**Data da análise:** 28/08/2026
**Escopo:** execuções, sugestões e revisões humanas registradas entre 18/08/2026 09:55 e 28/08/2026 02:51.
**Unidade com dados:** Ribeirão Shopping. Não há amostra operacional suficiente do Shopping Santa Úrsula neste recorte.

## Resumo executivo

O sistema evoluiu de uma implantação tecnicamente instável, em 18/08, para uma operação em que os especialistas apresentam aceitação humana elevada. Entre 19 e 21/08, a taxa técnica de erro caiu para **0,9%**. No período mais recente, entre 25 e 28/08, os especialistas permaneceram estáveis, mas a Áurea voltou a concentrar falhas de disponibilidade: **58 das 59 falhas recentes** foram respostas sem texto depois de esgotar o orçamento de raciocínio do modelo.[1]

A qualidade observada das sugestões é positiva quando a recepção chega a avaliá-las: **382 de 437 avaliações humanas foram aprovadas**, equivalente a **87,4%**. Contudo, **93,4% das aprovações exigiram edição**. Portanto, os agentes já funcionam como um bom primeiro rascunho, mas ainda não atingiram o patamar de “aceitar e enviar” sem revisão na maior parte dos atendimentos.[1]

> **Leitura operacional:** a prioridade não é ampliar o número de agentes nem automatizar mais envios. É primeiro estabilizar a Áurea e, em seguida, converter parte das edições recorrentes em regras, scripts e campos estruturados para os especialistas mais usados.

## Volume e resultado consolidado

| Indicador | Resultado | Leitura correta |
|---|---:|---|
| Execuções de agentes | 1.416 | Toda mensagem processada ou descartada no fluxo. |
| Execuções concluídas | 1.107 | Produziram uma sugestão revisável. |
| Execuções ignoradas | 85 | Sem destino ou sem intervenção necessária; não equivalem a erro de resposta. |
| Falhas técnicas | 224 | Grande parte pertence ao período de implantação e à Áurea. |
| Sugestões produzidas | 1.107 | Base para avaliação de qualidade. |
| Avaliações humanas | 437 | Aprovação ou reprovação explícita da recepção. |
| Aprovações | 382 (87,4%) | Taxa calculada apenas sobre sugestões avaliadas por humano. |
| Reprovações | 55 (12,6%) | Principal sinal direto de divergência de conteúdo ou contexto. |
| Aprovações com edição | 357 (93,4% das aprovadas) | A redação ainda demanda ajuste humano frequente. |
| Sugestões obsoletas | 539 (48,6%) | Em geral, consequência desejada de nova mensagem substituir o contexto anterior. |
| Sugestões pendentes | 131 (11,8%) | Estoque atual para revisão; não deve ser confundido com reprovação. |

## Evolução técnica

| Período | Execuções | Falhas | Taxa de falha | Diagnóstico |
|---|---:|---:|---:|---|
| 18/08 — implantação inicial | 191 | 160 | 83,7% | Conflitos de ferramenta/formato de resposta e falhas de roteamento. |
| 19–21/08 — estabilização inicial | 523 | 5 | 0,9% | As correções de integração normalizaram a execução dos especialistas. |
| 25–28/08 — operação recente | 696 | 59 | 8,4% | A estabilidade dos especialistas se manteve; a Áurea concentrou 58 falhas. |

No recorte recente, **98,3%** das falhas foram “resposta do modelo sem texto”. Os registros mostram `finish_reason: length`, `completion_tokens: 600` e `reasoning_tokens: 600`: o modelo consome o orçamento disponível em raciocínio e não deixa tokens para devolver o JSON de roteamento. Isto é uma falha de disponibilidade da Áurea, não uma evidência de que ela escolheu o agente errado.[1]

| Classe técnica de falha no período completo | Ocorrências | Participação nas falhas |
|---|---:|---:|
| Resposta do modelo sem texto | 123 | 54,9% |
| Roteamento sem escolha válida | 79 | 35,3% |
| Resposta fora do contrato JSON | 12 | 5,4% |
| Falha de leitura de estrutura | 9 | 4,0% |
| Outra falha técnica | 1 | 0,4% |

## Qualidade por agente

> A taxa de aprovação humana compara somente sugestões **aprovadas** e **reprovadas**. Sugestões obsoletas e pendentes foram excluídas porque não representam uma decisão de qualidade da recepção.

| Agente | Sugestões | Avaliadas por humano | Aprovação humana | Aprovadas com edição | Principal leitura |
|---|---:|---:|---:|---:|---|
| Carol | 587 | 224 | 88,8% | 99,5% | Maior volume; regras recentes reduziram rejeições, mas quase toda resposta ainda é ajustada. |
| Bianca | 269 | 96 | 92,7% | 89,9% | Boa aderência de assunto; precisa de refinamento de tom e concisão. |
| Diana | 86 | 49 | 63,3% | 93,5% | Maior oportunidade de conteúdo; melhorou no período recente, porém a base histórica é inferior. |
| Estela | 78 | 36 | 91,7% | 90,9% | Boa precisão comercial; há espaço para padronizar redação e apresentação de valor. |
| Áurea | 76 | 26 | 100,0% | 65,4% | As sugestões concluídas são aceitáveis; o problema prioritário é falha técnica de saída. |
| Fabrícia | 11 | 6 | 66,7% | 75,0% | Amostra pequena demais para diagnóstico conclusivo. |

O dado mais importante é a melhora recente: de 25 a 28/08, Carol e Bianca tiveram **100% de aprovação nas avaliações humanas concluídas** — 70 de 70 e 33 de 33, respectivamente. Diana também melhorou para 8 aprovações em 9 avaliações. Estela teve 28 aprovações em 31 avaliações. O resultado indica que as regras e prompts recentes melhoraram a adequação, ainda que a recepção continue ajustando a linguagem final.[1]

## Onde está o Pareto de melhoria

| Prioridade | Evidência | Ação recomendada | Resultado esperado |
|---|---|---|---|
| P0 — Áurea sem texto | 58 falhas recentes; 98,3% dos erros recentes são saída vazia após limite de raciocínio. | Criar uma correção isolada de orçamento/estratégia da chamada da Áurea, com teste de regressão para resposta JSON curta. Não alterar os especialistas enquanto isso. | Recuperar disponibilidade do roteamento e reduzir mensagens sem sugestão. |
| P1 — Transformar edições em aprendizado estruturado | 357 aprovações editadas, contra apenas 25 aceitas sem mudança. | Melhorar o motivo de edição/reprovação: tornar comentário obrigatório em “Outro” e criar marcadores como tom, tamanho, dado faltante, pergunta excessiva e etapa indevida. | Identificar padrões reais sem adivinhar a causa pelo texto final. |
| P2 — Carol como principal alavanca | 53,0% de todas as sugestões; 99,5% das aprovadas foram editadas. | Revisar uma amostra de edições da Carol por categoria: abertura, coleta de dados, slots, plano/voucher e encerramento. Converter os 3 padrões mais recorrentes em regras explícitas ou scripts. | Ganho direto no maior volume de conversas. |
| P3 — Diana | Aprovação histórica de 63,3%, embora recente tenha evoluído. | Coletar mais avaliações com motivo específico antes de nova grande reescrita. Priorizar voucher, fluxo obrigatório e não antecipar emissão/pagamento. | Evitar corrigir o prompt com base em uma amostra pequena e antiga. |
| P4 — Reduzir obsolescência sem guardar fila velha | 48,6% das sugestões ficaram obsoletas. | Manter a regra atual de preservar apenas a sugestão mais recente. Medir a sequência de mensagens do cliente e considerar uma curta janela de consolidação antes de acionar o agente. | Menos rascunhos descartados, sem reintroduzir sugestões antigas no Inbox. |

## Recomendação de execução por etapas

### Etapa 1 — Estabilidade da Áurea

Executar um ajuste técnico restrito à chamada de roteamento: definir uma saída JSON estruturada, reduzir o contexto não essencial e revisar o orçamento de saída/raciocínio. O teste deve simular o caso `finish_reason: length` e comprovar que a Áurea devolve uma escolha ou falha de modo recuperável, sem criar sugestão enganosa.

### Etapa 2 — Aprendizado de revisão

Não ajustar automaticamente prompts a partir de cada edição. Primeiro, tornar o feedback classificável. Hoje, **50,9%** das reprovações estão em “contexto” e **38,1%** em “outro”; isso é suficiente para apontar a direção, mas insuficiente para saber se o problema foi terapia, data, valor, tom, roteamento ou excesso de perguntas.[1]

### Etapa 3 — Otimização de conteúdo, começando pela Carol

Selecionar um conjunto pequeno de edições aprovadas da Carol e comparar o rascunho ao texto final da recepção. O objetivo não é alongar o prompt; é identificar instruções repetidas, por exemplo: uma pergunta por vez, confirmação de terapia anterior, coleta de slots e encerramento ao completar os dados. Depois, aplicar somente regras que se repitam de forma inequívoca.

## Limites da conclusão

Esta análise mede **execução, decisão humana e resultado registrado**. Ela não usa uma nota subjetiva de qualidade do modelo, não lê ou expõe conversas de clientes nesta entrega e não conclui que uma sugestão obsoleta era ruim. Também não é possível comparar unidades, pois todos os registros deste recorte pertencem ao Ribeirão Shopping.

## Dados internos

Os números foram obtidos por consultas somente de leitura nas tabelas `agentes_execucoes`, `agentes_sugestoes`, `agentes_atendimento`, `inbox_conversas` e `unidades`, no banco ativo compartilhado pelo Railway. Nenhum prompt, regra, mensagem, avaliação ou registro operacional foi alterado durante a análise.

[1]: #dados-internos "Dados internos auditados do CRM"
