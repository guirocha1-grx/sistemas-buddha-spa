# Plano Gradual de Qualidade — Agentes de Atendimento

**Objetivo.** Recuperar a sensação de atendimento cordial, preciso e confiável sem voltar a um chatbot genérico nem ampliar a autonomia antes de a equipe confiar nas sugestões. O sistema deve permanecer **assistido**: a pessoa da recepção é quem envia, ajusta e ensina o padrão comercial.

> **Diagnóstico principal:** o problema atual não é resolvido por um único prompt maior nem por um corte de confiança de 50%. A qualidade depende da combinação de roteamento, contexto enxuto e correto, Scripts/Fluxos factuais, exemplos de tom e avaliação contínua.

## 1. Evidência observada no teste real

As decisões registradas até agora mostram que a equipe está corrigindo mais do que aceitando a sugestão original.

| Resultado registrado | Quantidade | Leitura operacional |
|---|---:|---|
| Sem decisão ainda | 50 | Há volume para observar, mas ainda não é base suficiente para automatizar. |
| Editada antes do envio | 36 | A direção pode ser útil, mas o texto, o contexto ou o momento exigem intervenção frequente. |
| Rejeitada | 23 | Há erros claros de contexto, operação ou informação que não devem ser enviados. |
| Aceita como está | 6 | A taxa de aceitação literal ainda é baixa para justificar autonomia. |

Nos exemplos já vistos, os erros foram concretos: voucher confundido com agendamento, campanha sazonal usada para explicar terapia, coleta de dados prematura, identificação nominal do agente e perguntas abertas substituídas por listas. Isso indica falhas de **seleção de contexto e de etapa comercial**, não apenas de redação.

## 2. O que a pesquisa recomenda

Para fluxos de atendimento com categorias bem definidas, a arquitetura mais previsível é um **workflow com roteamento**, e não uma cadeia longa de agentes autônomos. Roteamento separa responsabilidades; regras e dados oficiais tratam os casos claros; o modelo entra na redação e em casos ambíguos. [1]

O contexto deve conter o menor conjunto de informações que ainda permite uma resposta correta. Contextos longos, misturados ou sazonais aumentam a chance de distração e de associação incorreta; a recomendação é recuperar informação relevante no momento da resposta, com seções claras e exemplos canônicos. [2]

Em atendimento conversacional, qualidade não é uma única métrica: combina resultado operacional verificável, aderência a fatos e tom. Avaliações eficazes misturam verificações determinísticas, rubricas de linguagem e revisão humana; os casos reais reportados pela equipe devem virar testes de regressão. [3]

O papel humano deve permanecer explícito em ações financeiras, disponibilidade, agendamento, voucher e qualquer caso não coberto por dados oficiais. O NIST recomenda gerenciar risco de IA por meio de governança, medição e gestão contínuas, em vez de confiar em uma pontuação isolada do modelo. [4]

## 3. Lacunas específicas do Buddha Spa CRM

| Aspecto | Situação atual | Risco | Ajuste recomendado |
|---|---|---|---|
| Tom cordial | Há regra de concisão de 350 caracteres, mas pouca orientação por intenção sobre acolhimento. | Respostas corretas porém secas ou apressadas. | Criar “blocos de voz” curtos por etapa: acolher, responder, convidar próximo passo. |
| Contexto | Scripts e tabelas já existem, mas campanhas e conteúdo comercial podem competir. | Resposta factualmente errada ou promocional fora de hora. | Entregar ao agente apenas o Script/tabela/fluxo elegível para a intenção atual. |
| Transição | O sistema já registra próxima rota, mas o texto pode antecipar a etapa seguinte. | Voucher, preço ou agendamento aparecem antes da dúvida ser resolvida. | Confirmar uma etapa por vez e usar transição curta, sem executar a próxima pergunta. |
| Confiança | A Áurea registra `confianca` apenas no roteamento por IA. | Pontuação declarada pelo próprio modelo pode parecer precisa sem ser calibrada. | Usar como sinal de auditoria; bloquear somente depois de medir correlação com revisões humanas. |
| Aprendizado | Edições e rejeições são registradas. | O dado ainda não vira uma suíte de avaliação ou melhoria controlada. | Converter erros reais em casos fixos de teste antes de alterar prompts. |
| Autonomia | O envio já é humano, mas sugestões de especialistas muito ativos ainda podem induzir erros. | A equipe perde confiança e para de usar o recurso. | Ativar especialistas por coorte e só ampliar após atingir metas de aceitação. |

## 4. Plano gradual proposto

### Lote 1 — Qualidade percebida e previsibilidade

Aplicar primeiro apenas o que reduz erro sem aumentar autonomia.

| Ação | Como funciona | Critério de sucesso |
|---|---|---|
| **Biblioteca de 12 exemplos canônicos por intenção** | Exemplos curtos de “boa resposta” para abertura, terapia, Day Spa, preço, disponibilidade, voucher, despedida e transição. | A equipe reconhece o tom como próximo ao padrão humano. |
| **Resposta em três movimentos** | 1) acolher ou reconhecer; 2) responder só a intenção atual com fato oficial; 3) fazer no máximo um convite aberto para o próximo passo. | Menos reescritas por tom e menos listas prematuras. |
| **Barreira de escopo** | Sem dado oficial, sem sugestão factual: a resposta deve pedir um momento ou encaminhar à recepção. | Nenhum valor, horário ou regra inventada. |
| **Separação de campanhas** | Campanha só entra quando a intenção mencionar campanha/promoção ou quando o gestor a selecionar explicitamente. | Terapias e preços usam apenas tabela/Script oficial. |
| **Fila por etapa comercial** | Explicar → preço → conclusão, sem antecipar a próxima etapa. | Queda em erros de contexto e de momento. |

O primeiro lote não aumenta o limite de 350 caracteres por padrão. Em vez disso, melhora a qualidade de cada frase. Se houver evidência de que uma intenção precisa de mais espaço, o limite deve ser específico daquele caso e protegido por teste.

### Lote 2 — Avaliação orientada por casos reais

Criar uma suíte inicial de **20 a 30 conversas**, extraídas dos erros já observados. Cada caso terá entrada, dados autorizados, agente esperado, fonte factual permitida, resposta aceitável e condições que bloqueiam a sugestão. A recomendação é começar pequeno e usar as falhas reais como casos de regressão; isso evita depender de memória ou impressão após cada ajuste. [3]

Os avaliadores devem combinar regras objetivas — por exemplo, “não citar voucher”, “não usar campanha”, “não inventar disponibilidade”, “não se identificar” — com uma rubrica humana de 1 a 5 para cordialidade, clareza e adequação comercial. Uma amostra semanal deve ser revisada por gerente, e não pelo próprio modelo.

### Lote 3 — Confiança calibrada e ativação por coorte

Somente depois de haver volume de revisões, comparar a confiança declarada pela Áurea com o resultado humano. Se mensagens entre 0 e 69 realmente tiverem maior rejeição, então aplicar o corte. Antes dessa calibração, a confiança deve ser apenas sinal de log.

O teste real deve começar com **dois especialistas de menor risco**, mantendo os demais desativados ou em modo apenas de log. Uma ordem plausível é Bianca e Fabricia, pois ambas usam fontes factuais claras; Estela entra depois, quando a tabela estiver estabilizada; Carol e Diana por último, pois disponibilidade, agendamento e voucher exigem mais contexto operacional e coleta de dados.

> **Importante:** ao desativar um especialista, o roteador não deve improvisar com outro ativo. A mensagem deve ficar sem sugestão ou receber uma resposta humana neutra, registrada como “fora do escopo ativo”.

## 5. Regras editoriais propostas para os prompts

Cada especialista deve receber um prompt organizado em cinco blocos, sem repetir regras globais desnecessárias.

| Bloco | Conteúdo |
|---|---|
| **Papel e limite** | O que resolve, o que não resolve e quando deixa para recepção. |
| **Fonte de verdade** | Script elegível, tabela oficial ou fluxo permitido; nunca memória livre para preço/horário. |
| **Estágio comercial** | Qual é a única dúvida a resolver nesta mensagem e qual o próximo estágio possível. |
| **Voz** | Cordialidade sem apresentação nominal, frases naturais, uma pergunta aberta quando necessária. |
| **Exemplos** | Dois ou três pares de entrada/saída representativos, incluindo um caso que deve recusar/aguardar. |

Exemplo de estrutura de resposta comum:

> “Claro, [nome]. A drenagem linfática é uma técnica voltada a [benefício factual]. Temos opções de [duração oficial]. Você gostaria de saber os valores ou de conhecer outra terapia?”

Esse padrão acolhe, informa e convida sem assumir preço, disponibilidade ou intenção de compra.

## 6. Decisão recomendada agora

O primeiro movimento recomendado é **não ativar ainda um corte de 50%**. Primeiro, aprovar o **Lote 1** e montar a suíte de casos reais; em seguida, deixar apenas Bianca e Fabricia em teste assistido por uma janela curta, por exemplo 30 a 50 sugestões avaliadas. A expansão deve depender de métricas simples:

| Indicador de liberação | Meta inicial |
|---|---:|
| Aceita como está ou edição apenas cosmética | ≥ 70% das sugestões avaliadas |
| Rejeição por contexto/operação | ≤ 10% |
| Informação inventada ou fonte errada | 0 ocorrências |
| Identificação nominal ou quebra de tom | 0 ocorrências críticas |

Se as metas não forem atingidas, a ação é corrigir o caso de regressão e o contexto do agente, não adicionar mais agentes. O objetivo no curto prazo é uma sugestão que **economize tempo** da recepção, não uma resposta autônoma.

## Referências

[1] [Anthropic — Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

[2] [Anthropic — Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

[3] [Anthropic — Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

[4] [NIST — AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
