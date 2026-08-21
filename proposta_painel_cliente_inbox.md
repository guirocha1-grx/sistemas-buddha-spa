# Proposta — Painel de relacionamento do cliente no Inbox

## Objetivo

Transformar o painel direito em uma consulta operacional rápida para a recepção. A leitura deve responder, em poucos segundos, a três perguntas: **quem é o cliente**, **o que ele ainda tem disponível** e **qual foi o último atendimento**. A proposta não altera os dados nem cria sugestões automáticas nesta etapa.

> **Princípio de interface:** o painel direito não deve virar um prontuário completo. Ele deve mostrar somente o contexto que ajuda a recepção e a Carol a conduzir o próximo passo com segurança.

## Diagnóstico do painel atual

| Área atual | Situação | Decisão proposta |
|---|---|---|
| Identificação do contato | Útil e já bem posicionada | Manter no topo, sem ampliação. |
| Serviços na unidade / dias desde última visita | Resume pouco do relacionamento | Substituir por resumo de plano e último atendimento, que são mais acionáveis. |
| Status aberto/fechado | Ocupa bloco próprio no painel | Mover para o cabeçalho da conversa, ao lado da busca nas mensagens. |
| Automação | Controle operacional importante | Manter em bloco compacto próprio. |
| Etiquetas | Úteis para operação | Manter abaixo da automação. |
| “Análise IA — recurso em breve” | Não entrega informação operacional | Remover. |
| Log dos agentes | Útil apenas para administração | Manter no rodapé e somente para administradores. |

## Estrutura visual proposta

### 1. Cabeçalho da conversa

O estado da conversa sai do painel direito e passa para o cabeçalho da thread, **ao lado do botão de busca nas mensagens**.

| Estado | Exibição | Ação no mesmo controle |
|---|---|---|
| Aberta | Ponto verde + `Aberta` | `Concluir` |
| Fechada | Ponto cinza + `Fechada` | `Reabrir` |

Assim, a recepção consegue encerrar ou reabrir sem deslocar a atenção para o painel de dados do cliente.

### 2. Painel direito: ordem recomendada

```text
[ foto / nome / telefone ]

[ RESUMO DO RELACIONAMENTO ]
  Plano:        ATIVO                 (ou “Sem plano ativo”)
  Sessões:      6 disponíveis
  Atualizado:   21/08/2026

  Último atendimento
  20/08/2026 · Drenagem Linfática
  Terapeuta: Mariana

[ AUTOMAÇÃO ]
  Ativa | 2 horas | Permanente

[ ETIQUETAS ]

[ LOG DOS AGENTES — somente administrador ]
```

O bloco **Resumo do relacionamento** terá fundo cream muito leve, borda dourada discreta e uma faixa lateral vinho apenas quando houver plano ativo. O objetivo é criar hierarquia sem transformar a área em um painel de alertas.

## Conteúdo do resumo de relacionamento

| Linha | Regra de exibição | Finalidade operacional |
|---|---|---|
| **Plano** | `Ativo` ou `Sem plano ativo` | Permite saber se a conversa pode tratar uso de sessões. |
| **Sessões** | Soma de sessões disponíveis nos planos ativos vinculados ao cliente e à unidade | Dá à recepção e à Carol uma referência objetiva antes de sugerir atendimento. |
| **Atualizado** | Data da última importação de planos da unidade | Evita que uma informação importada pareça estar em tempo real. |
| **Último atendimento** | Data + terapia/serviço | Ajuda a reconhecer preferência e continuidade. |
| **Terapeuta** | Nome do profissional do último atendimento, quando disponível | Ajuda a perguntar preferência, sem prometer agenda. |

### Estados sem informação

O painel não deve preencher lacunas com inferência:

| Situação | Exibição |
|---|---|
| Cliente sem plano vinculado | `Sem plano ativo` e `Dados dependem da importação de planos`. |
| Último atendimento sem vínculo seguro | `Último atendimento não vinculado ao cadastro`. |
| Relatório ainda não importado para a unidade | `Histórico ainda não importado para esta unidade`. |
| Conversa sem cliente vinculado | Não exibir o bloco; manter apenas as opções atuais de vínculo/criação de cliente. |

## Uso pela Carol

O mesmo resumo pode ser entregue à Carol como contexto **somente quando o cliente estiver vinculado com segurança e dentro da mesma unidade**. A regra é assistiva:

> A Carol pode usar plano ativo, sessões restantes e último atendimento para fazer perguntas de continuidade, mas nunca para confirmar disponibilidade, reservar horário, prometer saldo futuro ou presumir que o cliente quer repetir uma terapia.

Exemplo adequado: “Vi que você tem sessões disponíveis. Você gostaria de repetir a drenagem do último atendimento ou prefere outra opção?”

## Dados mínimos necessários

Para não carregar o painel com consultas extensas, a tela deve receber um único resumo agregado por conversa:

| Campo agregado | Origem local | Critério |
|---|---|---|
| `temPlanoAtivo` | Espelho de planos e sessões | Vínculo seguro por `clienteId` e unidade. |
| `sessoesDisponiveis` | Serviços dos planos ativos | Soma apenas saldos válidos. |
| `planosAtualizadosEm` | Última importação de planos da unidade | Informação de transparência. |
| `ultimoAtendimento` | Espelho de atendimentos | Registro mais recente vinculado com segurança. |
| `terapia` e `terapeuta` | Último atendimento | Exibir apenas se presentes no relatório. |

## Implementação recomendada após aprovação

1. Criar uma consulta agregada de resumo do relacionamento por `conversaId` e unidade, sem enviar o histórico completo ao Inbox.
2. Mover o controle Aberta/Fechada para o cabeçalho da thread e remover o bloco duplicado do painel direito.
3. Substituir o quadro atual de serviços/dias desde a visita pelo novo resumo visual.
4. Remover o bloco “Análise IA — recurso em breve”.
5. Entregar à Carol somente o resumo seguro, com data de atualização e sem extrapolar informações de agenda.

## Decisões solicitadas

| Decisão | Recomendação |
|---|---|
| Mostrar saldo como soma total ou por plano | **Soma total no painel**; detalhes por plano ficam no perfil de Clientes. |
| Exibir nome do terapeuta | **Sim**, como referência de preferência, sem promessa de agenda. |
| Manter o Copilot no painel | **Não**; remover somente o aviso provisório. O log técnico permanece exclusivo de administradores. |
| Status da conversa | **Mover para o cabeçalho**, junto da busca na thread. |
