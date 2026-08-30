# Evolução dos agentes de atendimento — atualização 30/08

**Data da análise:** 30/08/2026
**Autor:** Claude (Sonnet 5), a pedido do Guilherme
**Escopo:** continuação do histórico documentado pelo Manus AI (Pareto 20/08, Efetividade 22/08, Evolução + Estado 28/08).

> **Atualização de método:** a primeira versão deste documento (30/08, manhã) não tinha acesso ao banco de produção e era baseada só em código/commits. Depois disso ganhei consulta somente leitura ao TiDB (`POST /api/claude-consulta`, ver [server/claudeQueryRoute.ts](server/claudeQueryRoute.ts)) e recalculei os números reais direto de `agentes_execucoes`/`agentes_sugestoes`, na mesma metodologia dos relatórios do Manus. A seção 2.1 abaixo tem os dados reais; o resto do documento (código/commits) permanece como estava.

## 1. Trajetória até aqui (consolidando os 3 relatórios do Manus)

| Data | Relatório | Indicador-chave | Leitura |
|---|---|---:|---|
| 20/08 | Pareto | 87,3% das divergências em Carol e Bianca; só 3,3% aceitas sem edição | Sistema tecnicamente estável, mas sugestão raramente pronta pra envio direto |
| 22/08 | Efetividade pós-ajustes | Aprovação sobe de 77,1% → 96,8%; reprovação cai de 22,9% → 3,2% | Melhora real e grande, mas 84,2% das aprovadas ainda são editadas |
| 28/08 | Evolução | 87,4% de aprovação geral; 93,4% das aprovações exigem edição; Áurea concentra 58/59 falhas recentes (respostas vazias por orçamento de raciocínio esgotado) | Qualidade de conteúdo é boa; o problema agudo do momento é disponibilidade técnica da Áurea, não redação |

**Padrão que se repete nos três relatórios:** o "primeiro rascunho" está bom e melhorando, mas a redação final quase sempre precisa de ajuste humano. Nenhum dos três relatórios registra esse número caindo — é o gargalo mais persistente da série.

## 2. O que mudou desde o último checkpoint (28/08 16:25, doc `estado_agentes_atendimento`)

Só existe **um commit** tocando lógica de agente depois desse checkpoint: [`6bc7c8f`](https://github.com/guirocha1-grx/sistemas-buddha-spa/commit/6bc7c8f) (28/08 17:21) — *"fix(agents): acolhe saudações e filtra horários inviáveis"*. Duas mudanças concretas:

1. **Acolhimento na primeira mensagem.** Quando o cliente abre a conversa com saudação ("oi", "boa tarde", "tudo bem?"), o especialista agora começa a sugestão com "Bom dia/Boa tarde/Boa noite" (calculado pelo horário real de Brasília) antes de responder o pedido — em vez de ir direto ao ponto. Isso ataca diretamente a lacuna de **"Tom cordial"** que o `plano_gradual_qualidade_agentes.md` (Lote 1) apontava: *"respostas corretas porém secas ou apressadas"*.
2. **Filtro de horário inviável.** Ao sugerir horários disponíveis para "hoje", o sistema agora exige pelo menos 90 minutos de antecedência (`ANTECEDENCIA_MINIMA_AGENDAMENTO_MINUTOS`) — antes podia oferecer um slot daqui a 10 minutos, por exemplo. Quando não sobra slot viável, a Carol passa a perguntar se o cliente topa outro período ou amanhã, em vez de simplesmente não ter o que oferecer. Também ampliou a lista de horários de tarde ofertados (2 → 4 opções).

Nenhuma outra alteração em `agentesService.ts`, `agentesDb.ts` ou nos prompts desde então.

## 2.1 Resultado medido, 28/08 16:25 → 30/08 22:27 (dados reais do TiDB)

**Volume:** 382 execuções de agente, das quais 325 concluídas com sugestão e 57 ignoradas (sem destino/sem intervenção necessária) — **zero falhas técnicas** (`status = 'erro'`) no período inteiro.

Isso é o achado mais importante desta atualização: o relatório do Manus de 28/08 media **58 das 59 falhas recentes** como respostas vazias da Áurea por orçamento de raciocínio esgotado. Desde o fix (`90fbd57`, aplicado às 07:25 do dia 28/08, antes mesmo do corte de dados do relatório) até agora — mais de 2 dias e 382 execuções depois — **essa falha não voltou a ocorrer nenhuma vez**. O P0 do relatório do Manus está confirmado como resolvido, não só "corrigido no código".

**Qualidade das sugestões (325 concluídas):**

| Resultado | Quantidade | % |
|---|---:|---:|
| Obsoleta (substituída por nova mensagem) | 149 | 45,8% |
| Aprovada, mas editada antes de enviar | 147 | 45,2% |
| Pendente no momento da consulta | 14 | 4,3% |
| Aprovada como está (sem editar) | 10 | 3,1% |
| Rejeitada | 5 | 1,5% |

Entre as **162 sugestões com decisão humana final** (aprovada + reprovada, excluindo obsoleta/pendente):

| Indicador | 28/08 (relatório Manus) | 28/08 16:25 → 30/08 22:27 (agora) | Leitura |
|---|---:|---:|---|
| Aprovação entre decisões humanas | 87,4% | **96,9%** | Mantém o patamar do pico de 22/08 (96,8%); não regrediu |
| Reprovação entre decisões humanas | 12,6% | **3,1%** | Consistente com a melhora medida em 22/08 |
| Aprovadas que ainda precisam de edição | 93,4% | **93,6%** | **Praticamente idêntico** — o gargalo mais persistente da série continua sem ceder |

**Por especialista** (só decisões humanas, mesmo período): a concentração mudou de composição. Em 20/08 Carol+Bianca eram 87,3% das divergências; agora **Carol sozinha é 121 das 162 decisões (74,7%)** — 109 editadas, 8 aceitas como está, 4 rejeitadas. Bianca caiu para 4 casos (todos editados, zero rejeição). As 4 rejeições de Carol têm motivo `"contexto"` registrado (sem comentário livre), todas concentradas na tarde/noite de hoje (30/08) — não dá pra saber mais sem o texto da rejeição.

**Conclusão da verificação:** o fix de acolhimento/horário de 28/08 não piorou nada (aprovação e erro técnico melhoraram ou seguraram o patamar), mas também **não resolveu o gargalo estrutural** — a maioria das sugestões aprovadas continua precisando de edição, e agora quase toda a carga de correção está concentrada em Carol (agendamento). Isso aponta especificamente pra agendamento como o próximo alvo, não pra qualidade geral do sistema.

## 3. Desde 29/08: silêncio total nos agentes

Os últimos dois dias de commits (29 e 30/08 — vínculo/nível de terapeuta, conciliação PDV com Belle, cobrança por link com parcelas, refatoração da Agenda, integração Belle liga/desliga por unidade) **não tocaram em nenhum arquivo de agente**. O foco do desenvolvimento migrou inteiramente para: terapeutas, financeiro/conciliação e cobrança. Isso não é bom nem ruim por si só, mas é um dado relevante pra "evolução dos agentes": **não houve evolução de agente nos últimos 2 dias**, só na semana anterior.

## 4. Itens do plano do Manus que ainda não avançaram

Cruzando com `plano_gradual_qualidade_agentes.md`:

| Item do plano | Status em 30/08 |
|---|---|
| Lote 1 — biblioteca de exemplos canônicos, resposta em 3 movimentos, barreira de escopo, separação de campanha | Parcial — o acolhimento (item 4) avançou em 28/08; não achei evidência de biblioteca formal de exemplos por intenção nem da estrutura de "3 movimentos" documentada em prompt |
| Lote 2 — suíte de 20–30 casos reais de regressão com rubrica humana | **Não implementado.** Existe `agentesService.test.ts` (42 casos), mas são testes unitários de lógica determinística, não uma suíte de avaliação de qualidade de resposta com rubrica 1–5 |
| Lote 3 — calibrar confiança da Áurea e ativar por coorte (Bianca/Fabricia primeiro) | **Não implementado.** Não há sinal no código de bloqueio por confiança calibrada nem de desativação seletiva por especialista além do que já existia (chaves de automação por conversa) |

## 5. Recomendação

O commit de 28/08 à tarde resolveu de fato os dois problemas que atacava (confirmado pelos dados da seção 2.1: zero falha técnica em 382 execuções, aprovação no mesmo patamar do pico anterior). Mas nenhum dos três pilares estruturais do plano do Manus (exemplos canônicos, suíte de avaliação, confiança calibrada) avançou, e a taxa de "aprovada mas editada" continua em 93,6% — praticamente a mesma de 28/08. Com os dados confirmando que o gargalo não é mais estabilidade técnica, e sim redação/contexto concentrado quase todo em Carol (agendamento):

1. **Lote 2 do plano do Manus (suíte de regressão) deixa de ser opcional.** Com 74,7% das divergências atuais só em Carol, vale montar essa suíte com foco em agendamento primeiro — coleta progressiva de horário, confirmação de disponibilidade, preferência de terapeuta — em vez de tentar cobrir os 6 especialistas de uma vez.
2. Cavar as 4 rejeições de Carol de hoje (30/08, motivo "contexto") direto na tela do Inbox pra entender o padrão concreto — o banco não guarda o texto da sugestão rejeitada nem comentário livre, só o motivo categórico.

## 6. Onde atuar em Carol — comparando proposta vs. edição real

Li as 30 edições mais recentes de Carol (sugestão original x `textoFinal` enviado, 29–30/08) e cruzei contra o que `revisao_operacional_prompts_agentes.md` propôs para ela: *"Coletar progressivamente serviço, data e preferência de período (...). Nunca confirmar disponibilidade, profissional, pagamento ou reserva."* Três padrões concretos, por ordem de frequência na amostra:

**a) O filler "Por favor, aguarde um momento ✨" está estourando demais, e nunca sobrevive à edição.** Apareceu em **9 das 30** sugestões editadas — praticamente 1 em cada 3. Em todos os casos a recepção substitui por conteúdo real e específico ("Fica ruim para vcs as 19:30h, consigo colocar em sala compartilhada sim.", "Poderia me enviar o nome, data de nascimento e cpf dele...", "Os seus e do seu acompanhante, por gentileza"). Esse texto nunca é uma resposta útil por si — é um placeholder que aparece quando Carol deveria estar coletando algo específico (`excecaoOperacional`) mas não gerou a pergunta real. **Maior alavanca isolada**: se esse filler virasse a pergunta específica que falta, uma fatia grande dessas 109 edições deixaria de ser necessária.

**b) Oferece horário/lista quando a mensagem do cliente não estava pedindo isso.** Ex.: sugeriu `"Tenho amanhã disponíveis os horários 15:15 e 17:45..."` e o que foi enviado foi um número de telefone; sugeriu slots de domingo e o texto real foi `"Entendo perfeitamente essa dinâmica complicada..."` (cliente tinha explicado uma situação, não pedido horário). É o mesmo padrão por trás das 4 rejeições com motivo "contexto" — a lógica de `slotsParaPeriodo`/`respostaPadraoDisponibilidade` (ver [agentesService.ts](server/agentesService.ts)) dispara mesmo quando a intenção da última mensagem não era, de fato, escolher horário.

**c) Reobre pergunta já respondida.** `"Qual será a terapia? Relaxante 60 ou Ayurvédica 60?"` apareceu 3 vezes na amostra sendo substituída por `"ok"`, `"Perfeito."` ou por uma resposta de disponibilidade — sinal de que o serviço já tinha sido definido e Carol não estava lendo esse dado do contexto.

**Achado colateral, não é bug:** boa parte das "edições" registradas são o texto **idêntico** ao sugerido (ex.: `"Você tem preferência de terapeuta (nome ou gênero) ou é indiferente?"` → mesmo texto). Isso sugere que passar pelo compositor já marca como `editada` mesmo sem mudar nada — o que quer dizer que o 93,6% da seção 2.1 provavelmente **superestima** a edição real. Vale investigar o registro de `tipoRevisao` antes de tratar esse número como definitivo.

**O que a proposta original acertou:** não vi Carol confirmando disponibilidade/profissional/reserva nas sugestões originais — a regra "nunca confirmar" está sendo respeitada. Só que isso tem um efeito colateral estrutural: toda vez que a etapa seguinte da conversa É uma confirmação, a sugestão de Carol nunca pode ser a resposta final por desenho — alguém sempre vai escrever essa parte. Não é um defeito pra corrigir no prompt; é uma característica de manter o humano no controle da confirmação, e ajuda a explicar por que a taxa de edição dificilmente vai a zero mesmo com Carol "perfeita".
