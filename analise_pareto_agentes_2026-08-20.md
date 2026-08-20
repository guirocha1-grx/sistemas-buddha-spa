# Análise Pareto — Agentes do Inbox

**Período analisado:** 20 de agosto de 2026, das 14:23 às 22:30.  
**Unidade predominante:** Ribeirão Shopping.  
**Objetivo:** encontrar os poucos padrões que concentram o retrabalho da recepção e priorizar correções com maior retorno operacional.

> **Leitura executiva:** o sistema já está operacionalmente estável e o roteamento chega aos especialistas corretos na maior parte dos casos. O gargalo atual não é disponibilidade técnica; é a capacidade do agente de respeitar o estado real da conversa, sobretudo em agendamento. Carol e Bianca concentram **87,3%** das divergências que exigiram edição ou rejeição humana.[^base]

## 1. Método e limites da análise

Foram cruzados, por `execucaoId` e `mensagemEntradaId`, os registros de `agentes_execucoes`, `agentes_sugestoes` e `inbox_mensagens`. A unidade de divergência adotada foi uma sugestão **editada** ou **rejeitada** pela recepção. Sugestões **obsoletas** foram tratadas separadamente: representam perda de timing, mas não equivalem a uma reprovação humana.

| Métrica | Resultado | Leitura operacional |
|---|---:|---|
| Execuções de agentes | 127 | Volume processado no recorte |
| Sugestões criadas | 121 | 95,3% das execuções geraram sugestão |
| Aceitas sem edição | 4 | 3,3% das sugestões |
| Editadas e depois usadas | 58 | 47,9% das sugestões |
| Rejeitadas | 13 | 10,7% das sugestões |
| Obsoletas por nova mensagem | 36 | 29,8% das sugestões |
| Pendentes no momento da coleta | 10 | 8,3% das sugestões |

Das **75 sugestões com decisão humana final**, apenas 4 foram aceitas literalmente. As outras 71 exigiram edição ou rejeição. Esse indicador não significa que 94,7% do conteúdo seja inválido; parte das edições são ajustes normais da recepção. Mas ele confirma que, hoje, a sugestão ainda raramente está pronta para envio sem intervenção.

## 2. Pareto das divergências

O Pareto abaixo considera somente edições e rejeições, pois são os eventos em que a recepção precisou corrigir ou descartar a proposta.

| Prioridade | Agente | Edições | Rejeições | Divergências | Participação | Acumulado |
|---:|---|---:|---:|---:|---:|---:|
| 1 | Carol — agendamento | 32 | 10 | 42 | 59,2% | 59,2% |
| 2 | Bianca — terapias | 18 | 2 | 20 | 28,2% | 87,3% |
| 3 | Diana — voucher | 5 | 1 | 6 | 8,5% | 95,8% |
| 4 | Áurea, Estela e Fabrícia | 3 | 0 | 3 | 4,2% | 100,0% |

> **Decisão 80/20:** o próximo ciclo deve concentrar esforço em **Carol** e **Bianca**. Juntas, elas responderam por 98 das 121 sugestões emitidas e 62 das 71 divergências humanas. Ajustar os outros agentes agora diluiria esforço com pouco retorno.

## 3. Diagnóstico prioritário: Carol — estado de agendamento

Carol concentra 60 sugestões, 42 divergências e 10 das 13 rejeições totais. Em nove dessas dez rejeições, a recepção marcou o problema como **contexto**. O padrão recorrente não é cordialidade; é a agente perder ou ignorar informação que já está explícita na conversa.

| Padrão observado | Exemplo representativo anonimizado | Comportamento incorreto | Regra de correção |
|---|---|---|---|
| Período já informado | Cliente informa uma janela específica, como “entre 16h15 e 16h45 no dia 28” | Pergunta novamente se prefere manhã, tarde ou noite | Ao detectar data ou janela de horário explícita, não perguntar preferência. Gerar apenas “Vou verificar, por favor, aguarde um momento ✨” ou não sugerir nada se a recepção já estiver verificando. |
| Confirmação de disponibilidade | Cliente responde “Pode ser”, “Isso” ou confirma uma hora | Reabre a coleta de serviço, data e quantidade | Tratar confirmações curtas como continuação de estado, nunca como novo lead. Se os dados já existem, encerrar em não intervenção ou pedir somente o único dado realmente ausente. |
| Mensagem de encerramento | Cliente diz “Obrigado” ou informa que resolveu em outra unidade | Retoma o fluxo de agendamento | Criar guarda determinística para agradecimento, recusa e encerramento: resposta curta de cortesia ou saída sem sugestão. |
| Disponibilidade não verificada | Cliente pede agenda com profissional/data específicos | Modelo afirma ou reformula opções como se soubesse disponibilidade | Carol não pode inventar ou confirmar slot. A agenda é responsabilidade da recepção; o agente deve apenas triá-la. |

O maior ganho vem de trocar parte da geração livre de Carol por um **motor de estado determinístico**. A regra não deve tentar “melhorar o prompt” primeiro. Deve decidir, antes do modelo, se a mensagem é: pedido sem período, período já informado, confirmação, recusa/agradecimento ou coleta de dado faltante. Só os casos ambíguos devem chegar ao modelo.

## 4. Diagnóstico prioritário: Bianca — fidelidade comercial e roteamento

Bianca representa 38 sugestões e 20 divergências. O volume é menor que Carol, mas o risco é mais alto quando a resposta muda nome, indicação ou escopo de um serviço.

Foram confirmados dois padrões concretos de falha.

| Padrão observado | Evidência do teste | Risco | Regra de correção |
|---|---|---|---|
| Nome e descrição não canônicos | A recepção corrigiu uma resposta sobre gestante: o serviço correto é **Gestação Leve e Tranquila**, não o nome inventado pelo modelo | Informação comercial incorreta e perda de confiança | Bianca deve citar nomes, duração e preços exclusivamente da tabela comercial e dos Scripts oficiais. O modelo pode criar apenas a transição cordial. |
| Cliente já possui voucher | A mensagem “Tenho voucher” levou a uma resposta de emissão de novo voucher | Roteamento errado e coleta inútil de dados | Detectar “tenho/já comprei/ganhei voucher” como intenção de **agendamento com voucher existente**, encaminhando a Carol ou à triagem de agenda, não à emissão da Diana. |

Há também um sinal de desalinhamento entre a intenção atual e o contexto anterior. Em algumas edições, a resposta tenta retomar explicações de terapia quando a conversa já avançou para plano, disponibilidade ou confirmação. Isso reforça a necessidade de uma camada de estado curta e explícita antes do texto livre.

## 5. Diana, fluxos e demais especialistas

Diana teve somente 6 divergências no recorte. A falha confirmada foi semântica: interpretar “tenho voucher” como pedido para **emitir** voucher. A regra proposta para Bianca deve ser compartilhada com Diana, pois ela evita o mesmo desvio na origem.

Os fluxos recém-corrigidos estão funcionando como mecanismo de envio: no período, quatro sugestões carregaram uma ação pendente de fluxo e nenhuma delas foi rejeitada. Portanto, não há evidência para priorizar uma reconstrução do motor de fluxos. O foco deve ser melhorar **quando** ele é escolhido, não como ele é entregue.

## 6. Sugestões obsoletas: perda de timing, não erro de conteúdo

Trinta e seis sugestões ficaram obsoletas porque uma nova mensagem do cliente chegou antes da decisão da recepção. A fila substitutiva recém-publicada resolveu o problema visual e evita acumulação, mas o número mostra que quase um terço das sugestões nasce rápido demais para a cadência real da conversa.

| Agente | Obsoletas | Proporção dentro das sugestões do agente |
|---|---:|---:|
| Carol | 16 de 60 | 26,7% |
| Bianca | 9 de 38 | 23,7% |
| Diana | 4 de 11 | 36,4% |
| Áurea | 5 de 6 | 83,3% |
| Total | 36 de 121 | 29,8% |

A próxima melhoria de eficiência, após Carol e Bianca, é um **curto agrupamento de mensagens** antes do processamento, de aproximadamente 3 a 5 segundos. Ele não deve atrasar respostas longas; deve apenas esperar uma sequência imediata de texto, áudio ou complemento do mesmo cliente antes de gerar a sugestão. Essa medida deve ser testada em uma pequena amostra, pois reduz custo e ruído, mas pode prejudicar a sensação de velocidade se aplicada de forma excessiva.

## 7. Confiança do roteamento: não ativar bloqueio ainda

O marcador de confiança não é utilizável como mecanismo de bloqueio neste momento. Das 127 execuções, 104 registraram confiança nula e 23 registraram valor zero; não houve nenhum valor entre 1 e 100. Um corte de 50% ou 70% bloquearia praticamente todo o atendimento, inclusive sugestões aproveitadas pela recepção.

> **Decisão recomendada:** não habilitar bloqueio por confiança agora. Primeiro, é necessário corrigir o contrato de classificação para sempre retornar um valor calibrado de 0 a 100 e medir sua relação com edição e rejeição por pelo menos alguns dias.

## 8. Plano de ação 80/20

| Ordem | Intervenção | Impacto esperado | Esforço | Critério de sucesso |
|---:|---|---|---|---|
| 1 | Criar guardas determinísticas de contexto para Carol: horário explícito, confirmação, agradecimento/recusa e disponibilidade externa | Atua sobre 59,2% das divergências | Médio | Reduzir rejeições da Carol de 10 para no máximo 3 por 60 sugestões e elevar respostas curtas corretas |
| 2 | Bloquear nomes e descrições inventados por Bianca; usar tabela/Script oficial como fonte literal | Atua sobre 28,2% das divergências e reduz risco factual | Médio | Nenhuma correção de nome de terapia, duração ou produto em nova amostra de 20 casos |
| 3 | Regra compartilhada: “já tenho voucher” é agenda de voucher existente, não emissão | Corrige um erro comercial concreto | Baixo | Nenhum novo desvio desse tipo em 10 ocorrências |
| 4 | Agrupar mensagens consecutivas por 3–5 segundos antes de sugerir | Reduz até 29,8% de sugestões que perdem contexto | Médio | Obsoletas abaixo de 15% sem aumento percebido de demora |
| 5 | Reativar o projeto de confiança apenas depois de normalizar a métrica 0–100 | Evita bloqueio cego | Baixo agora, médio depois | Confiança presente em 100% das execuções e curva de rejeição por faixa |
| 6 | Capturar um motivo rápido também nas edições, não apenas nas rejeições | Melhora a precisão da próxima análise | Baixo | Pelo menos 70% das edições com causa classificada |

## 9. Ordem prática para o próximo ciclo

A recomendação é implementar primeiro as guardas de contexto da Carol e testar por uma tarde inteira. Em seguida, travar a Bianca à nomenclatura oficial e ajustar a regra de voucher existente. Essas três mudanças atacam os casos que mais custam correção humana e têm menor risco de alterar a arquitetura já estabilizada.

O agrupamento de mensagens e a calibração de confiança devem ficar no ciclo seguinte. Ambos são úteis, mas são otimizações transversais; não substituem a correção do estado conversacional e da fidelidade comercial.

## Fontes internas

[^base]: Consultas internas executadas em 20/08/2026 sobre `agentes_execucoes`, `agentes_sugestoes`, `inbox_mensagens` e `agentes_atendimento`. O relatório usa o recorte em que a primeira execução ocorreu às 14:23 e a última às 22:30.
