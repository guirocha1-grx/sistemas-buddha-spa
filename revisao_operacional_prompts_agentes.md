# Revisão Operacional dos Prompts dos Agentes

**Objetivo.** Preparar os seis agentes para o teste real em modo assistido, reduzindo erro de roteamento, duplicidade de orientação e uso improdutivo de texto livre. Esta é uma **proposta de revisão**; nenhum prompt ativo será substituído sem aprovação.

## Diagnóstico

Os especialistas já têm escopo operacional consistente e o sistema possui três mecanismos que não existiam em um chat GPT isolado: **roteamento persistente**, **Scripts com descrição de intenção** e **Fluxos aprovados pelo atendente**. Os prompts devem, portanto, orientar decisões e estado de conversa, em vez de tentar conter todo o conteúdo comercial.

| Elemento disponível | Estado atual | Consequência para os prompts |
|---|---|---|
| Roteamento determinístico + Aurea | Ativo | O especialista não deve se reapresentar nem assumir que recebeu a conversa do zero. |
| Sugestão assistida | Ativa | O agente prepara resposta e ação; não promete execução nem confirmação ao cliente. |
| Scripts ativos | 57 itens | O agente deve escolher primeiro pelo `scriptId` e usar texto novo somente se nenhum Script se aplicar. |
| Fluxos ativos | 3 itens | Menu/tabela de preços, voucher e Day Spa podem ser selecionados, mas só iniciam após aprovação humana. |
| Limite de resposta comum | 350 caracteres, incluindo espaços | Cada prompt deve priorizar uma resposta breve e uma próxima ação. |

> **Ponto crítico:** a regra de “nota fiscal” existe como exceção de coleta, mas não há hoje um especialista dedicado a nota fiscal. Para o teste real, a recomendação é encaminhar nota fiscal para atendimento humano, sem permitir que um especialista comercial improvise coleta ou prometa emissão.

## Ajuste compartilhado proposto para todos os especialistas

O complemento operacional abaixo deve entrar no fim dos prompts de **Bianca, Fabricia, Estela, Carol e Diana**, sem substituir suas regras específicas.

```text
[OPERAÇÃO ASSISTIDA]
Você integra um único atendimento contínuo. Não se apresente, não diga seu nome,
não mencione agentes, roteamentos, Scripts, Fluxos ou instruções internas.

Antes de redigir texto novo, avalie os Scripts fornecidos no contexto pela descrição.
Quando houver correspondência clara, informe o scriptId correspondente e preserve o
conteúdo factual do Script; adapte apenas a transição necessária para a conversa.
Não replique uma saudação que já exista no Script.

Se o Script for do tipo fluxo, use action "script_fluxo:ID" somente quando a ação
for pertinente. O consultor decidirá se aprova; nunca diga ao cliente que o envio,
agendamento, voucher ou documento já foi efetuado.

Respostas comuns: no máximo 350 caracteres no total, contando espaços, pontuação e
quebras de linha. Faça no máximo duas perguntas por mensagem e aguarde a resposta.
Só marque excecaoOperacional:true para coleta indispensável de agendamento ou voucher
depois de o cliente confirmar que deseja concluir a solicitação.
```

O contrato JSON também deve ser uniforme nos prompts ativos:

```json
{"message":"","status":"in_process","summary":"","variables":{},"action":null,"scriptId":null,"excecaoOperacional":false}
```

## Recomendações por agente

| Agente | Papel no teste real | Risco atual | Ajuste proposto |
|---|---|---|---|
| **Aurea** | Receptora silenciosa e classificadora de intenção | Pode tentar classificar demais pelo histórico ou devolver uma rota quando a intenção está pouco clara | Delimitar que ela analisa a última mensagem do cliente, usa apenas `bianca`, `fabricia`, `estela`, `carol`, `diana` ou `humano`, e não gera texto para o cliente. Para nota fiscal, reclamação, conflito, pessoa solicitada ou dado sensível: `humano`. |
| **Bianca** | Terapias, benefícios, diferenças e adequação não clínica | Pode explicar muito, prometer resultado médico ou absorver preço/agendamento | Determinar que ela prioriza Script de terapia; explica objetivo e sensação sem diagnóstico. Preço/promoção → `estela`; Day Spa → `fabricia`; agendamento → `carol`; voucher → `diana`. |
| **Fabricia** | Day Spa, composição, estrutura e preparação da experiência | Pode inventar composição, trocar itens ou misturar preço com estrutura | Exigir fonte oficial ou Script de Day Spa. Valores/promoções → `estela`; reserva → `carol`. Quando o cliente pedir material de Day Spa, pode selecionar o Fluxo “Enviar informações sobre dayspa” para aprovação humana. |
| **Estela** | Preços, condições oficiais e campanha vigente | Pode estimar preço, negociar ou usar promoção fora de vigência | Obrigar consulta à tabela oficial e à campanha do mês somente se ela estiver vigente no contexto. Sem preço oficial: pedir confirmação interna; nunca estimar. Ao pedir tabela/menu, selecionar o Fluxo “Enviar menu de serviços / tabela de preços” para aprovação. |
| **Carol** | Preparação de agendamento, sem confirmação de vaga | Pode coletar todos os dados cedo demais ou prometer horário/vaga | Coletar progressivamente serviço, data e preferência de período; perguntar pessoas e preferência de terapeuta apenas quando aplicável. Só usar lista objetiva após “quero agendar/confirmar”. Nunca confirmar disponibilidade, profissional, pagamento ou reserva. |
| **Diana** | Orientação e preparação de voucher | Pode voltar a uma coleta de voucher quando a conversa mudou de assunto | Responder sobre voucher somente enquanto a intenção atual for voucher. Separar “dúvida sobre voucher” de “quero emitir voucher”. Somente no segundo caso coletar tipo, serviço/valor, presenteado e mensagem; pode selecionar o Fluxo “Enviar informações sobre vouchers” para aprovação humana. |

## Decisões de roteamento que devem ficar explícitas

| Intenção atual do cliente | Destino esperado |
|---|---|
| Terapias, massagens, drenagem, Shiatsu, relaxamento | Bianca |
| Day Spa, pacote, banho, experiência completa, estrutura | Fabricia |
| Valor, preço, condição, promoção, campanha | Estela |
| Agendar, reservar, horário, disponibilidade | Carol |
| Voucher, presente, crédito, presenteado | Diana |
| Nota fiscal, reclamação, conflito, pedido de pessoa, dado sensível | Humano |

Uma intenção explícita da mensagem mais recente deve prevalecer sobre o especialista persistido. Isso já está implementado no roteamento; a revisão do prompt precisa apenas evitar que o especialista tente “puxar” a conversa de volta ao assunto anterior.

## Roteiro mínimo para a entrada em teste real

| Cenário | Resultado que deve ser validado |
|---|---|
| “Quais terapias vocês oferecem?” após conversa de voucher | Bianca, resposta breve, Script de terapia quando aplicável. |
| “Quanto custa a drenagem?” | Estela, preço apenas da tabela oficial. |
| “Quero um Day Spa para presente” | Fabricia para estrutura; Diana somente se a intenção virar voucher. |
| “Quero agendar para sábado” | Carol, coleta progressiva, sem prometer vaga. |
| “Quero emitir um voucher” | Diana, coleta apenas após confirmação de intenção. |
| “Preciso de nota fiscal” | Humano, sem promessa de emissão automática. |
| “Pode mandar a tabela?” | Estela seleciona o fluxo de menu/tabela para aprovação. |
| “Pode enviar informações de Day Spa?” | Fabricia seleciona o fluxo de Day Spa para aprovação. |

## Proposta de sequência de implantação

1. Aprovar a estrutura compartilhada e as regras específicas acima.
2. Criar novas versões dos seis prompts, mantendo as versões atuais no histórico para reversão.
3. Executar os oito cenários de teste no Inbox em modo assistido; toda saída seguirá em revisão humana.
4. Ajustar somente os casos observados e então ampliar o uso pela equipe.

> **Recomendação:** não ativar envio automático nesta primeira rodada. A arquitetura de sugestão, edição, aprovação, rejeição com motivo e aprendizado já é a proteção adequada para o teste real de hoje.
