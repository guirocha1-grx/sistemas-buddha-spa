# Plano — Painel de custos estimados de mensagens WhatsApp

**Status:** proposta para aprovação.  
**Escopo desta etapa:** planejamento; nenhuma tabela, rota, interface ou envio será alterado sem aprovação.

## 1. Objetivo do painel

Dar à gestão uma visão separada por **Shopping Santa Úrsula** e **Ribeirão Shopping** de quanto as mensagens da operação oficial de WhatsApp tendem a custar, com distinção clara entre os três tipos operacionais de mensagem:

| Categoria operacional | Referência inicial de custo por mensagem entregue | Uso esperado |
|---|---:|---|
| Service | R$ 0,00 | Resposta da equipe dentro da janela de atendimento aberta pelo cliente. |
| Utility | R$ 0,05 | Template operacional relacionado a plano, saldo, validade, agendamento, confirmação ou remarcação. |
| Marketing | R$ 0,50 | Template de reativação, oferta, recomendação ou início de conversa comercial fora da janela. |

Esses valores devem ser tratados como **estimativas configuráveis**, e não como valor contratual fixo. A fonte, data de atualização e vigência devem ficar visíveis no painel. A cobrança oficial depende de categoria, país do destinatário, entrega e tabela vigente da WABA/BSP. [1]

## 2. Diagnóstico do CRM atual

O CRM já tem dois canais de Inbox: `zapi` e `buddha_mkt`. O segundo é o conector inicial da WhatsApp Cloud API oficial, com credenciais globais configuráveis em **Configurações → Buddha Mkt**. Hoje o conector envia somente texto e o histórico armazena canal, direção, tipo de mídia, conteúdo e horário.

> O banco **ainda não registra** categoria Meta do template, nome do template, status de entrega, preço aplicado, moeda, mensagem cobrável ou retorno financeiro da Cloud API. Portanto, ele não consegue reconstruir com precisão custos históricos de mensagens já enviadas pela Z-API, nem deve inventar custo para elas.

Isso define duas camadas de produto: uma primeira de **simulação e projeção**, e uma segunda de **controle operacional**, quando o canal oficial de marketing estiver configurado e enviar templates.

## 3. Proposta de escopo por etapas

### Etapa A — Simulador e parâmetros de custo

Criar a subseção global **Configurações → Custos WhatsApp** e uma página **WhatsApp → Custos estimados**. Os parâmetros ficariam na tabela existente `configuracoes`, pois a WABA é única para as duas unidades.

| Parâmetro | Chave sugerida | Valor inicial | Regra |
|---|---|---:|---|
| Tarifa Service | `whatsapp_custo_service_brl` | `0.00` | Editável por admin. |
| Tarifa Utility | `whatsapp_custo_utility_brl` | `0.05` | Editável por admin. |
| Tarifa Marketing | `whatsapp_custo_marketing_brl` | `0.50` | Editável por admin. |
| Fonte da tarifa | `whatsapp_custo_fonte` | `Referência operacional` | Campo de texto, por exemplo “WABA/Meta em DD/MM/AAAA”. |
| Última revisão | `whatsapp_custo_atualizado_em` | data/hora | Preenchida automaticamente ao salvar. |

O simulador recebe quantidade de destinatários, categoria e unidade. Ele mostra custo unitário, custo do lote, economia relativa entre utility e marketing e um aviso: **“Estimativa para mensagens entregues; não substitui a classificação aprovada pela Meta.”**

Exemplo: 100 utility × R$0,05 = R$5,00; 100 marketing × R$0,50 = R$50,00; economia estimada de R$45,00 quando o uso utility é legítimo.

### Etapa B — Painel gerencial de projeções

Adicionar a página sob **WhatsApp**, não em Financeiro, pois o dado nasce da operação de mensageria. A página deve ter os seguintes blocos:

| Bloco | Conteúdo |
|---|---|
| Filtros | Período, unidade, categoria, canal e status de estimativa. |
| Resumo | Volume projetado, custo estimado total, custo por unidade e distribuição por categoria. |
| Simulador de campanha | Nome interno, unidade, segmento/quantidade, template planejado, categoria e custo previsto antes de disparar. |
| Tabela de projeções | Campanha ou lote, categoria, destinatários previstos, entregues, custo previsto, custo estimado entregue, criador e situação. |
| Comparativo | Barras por unidade e categoria; destaque de diferença entre cenário marketing e utility. |
| Avisos de conformidade | Categoria é declaratória; utility só deve ser usado para comunicação operacional legítima e template aprovado. |

O painel deve usar os termos **“custo estimado”** e **“custo confirmado”** separadamente. Na Etapa B, quase todos os valores serão estimados.

### Etapa C — Registro de campanhas e templates oficiais

Antes de enviar campanhas reais pela Cloud API, criar as entidades abaixo. Esta etapa faz o painel passar de simulador para gestão de operação.

| Entidade | Campos essenciais | Função |
|---|---|---|
| `whatsapp_templates` | nome Meta, idioma, categoria, status Meta, conteúdo, unidade opcional, ativo | Impede envio de template inexistente ou não aprovado. |
| `whatsapp_campanhas` | nome, unidade, template, categoria, audiência prevista, criador, agenda, status | Congela a intenção e permite aprovação operacional. |
| `whatsapp_campanha_destinatarios` | campanha, cliente/conversa, telefone normalizado, status, erro, mensagem Meta, custo estimado | Auditoria por destinatário sem duplicar envio. |
| `whatsapp_custos_mensagem` | mensagem Meta, categoria, tarifa, moeda, estimado/confirmado, entregueEm | Livro de custos por mensagem. |
| `whatsapp_consentimentos` | cliente, origem, data, categorias autorizadas, prova, revogadoEm | Base para elegibilidade de marketing/utility. |
| `whatsapp_opt_outs` | telefone/cliente, categoria, data, origem | Bloqueia campanhas futuras de forma auditável. |

## 4. Regras de cálculo

### O sistema não deve “adivinhar” a categoria final

1. **Service:** o CRM poderá sugerir “service” somente quando identificar resposta enviada dentro de 24 horas após a última mensagem recebida do cliente. Ainda assim, não entra como template de campanha.
2. **Utility:** exige seleção explícita de um template armazenado como `UTILITY` e aprovado. O painel não deve converter automaticamente uma mensagem comercial em utility.
3. **Marketing:** exige template `MARKETING` aprovado e opt-in correspondente. É o padrão seguro para reativação, oferta e início de conversa comercial fora da janela.
4. **Z-API:** mensagens desse canal aparecem em volume operacional, mas ficam marcadas como **“custo oficial não monitorado”**. Não será atribuída uma tarifa Meta retrospectiva a elas.
5. **Cobrança:** custo estimado inicial = mensagens entregues × tarifa vigente no momento da projeção. Para mensagens ainda não entregues, o painel separa `previsto` de `estimado entregue`.

## 5. Fluxo proposto para uma campanha

```mermaid
flowchart LR
  A[Selecionar unidade e segmento] --> B[Escolher template aprovado]
  B --> C[Validar opt-in e bloqueios]
  C --> D[Simular destinatários e custo]
  D --> E[Aprovação operacional]
  E --> F[Agendar ou disparar em fila]
  F --> G[Receber sent/delivered/read/failed]
  G --> H[Registrar custo estimado ou confirmado]
  H --> I[Exibir no painel e no Inbox]
```

Para uma primeira versão, a aprovação operacional pode ser uma confirmação explícita por usuário administrador, com registro de data e responsável. A fila deve respeitar os limites e pausas aplicáveis da Meta; o envio não pode depender de um `for` no navegador ou de uma aba aberta.

## 6. Filtros e permissões

| Perfil | Acesso proposto |
|---|---|
| Admin | Configura tarifas, templates, campanhas e vê todas as unidades. |
| Gerente da unidade | Vê a própria unidade, simula e aprova campanhas conforme permissão futura. |
| Consultor/recepção | Vê somente custo indicativo de uma mensagem/campanha à qual foi associado; não altera tarifa nem dispara lote. |

O painel deve respeitar a permissão por unidade já existente. Tarifas permanecem globais porque o canal oficial descrito no CRM é uma conta única usada pelas duas unidades.

## 7. Critérios de aceite da primeira entrega

1. Um admin altera as três tarifas e vê data/fonte de revisão.
2. Um gerente simula 100 destinatários utility e marketing e vê R$5,00 e R$50,00 com as referências iniciais.
3. O painel diferencia claramente estimativa, custo confirmado e custo não monitorado.
4. O painel não sugere que um template marketing possa ser cobrado como utility.
5. A unidade SSU e a RBS podem ser filtradas separadamente.
6. Não é possível atribuir artificialmente custo oficial retroativo às mensagens Z-API.
7. Há testes unitários para cálculo monetário, arredondamento em centavos, filtros e bloqueio de categoria inválida.

## 8. Decisões que precisam de aprovação antes de construir

1. A página fica em **WhatsApp → Custos estimados** ou como subseção de **Financeiro**?
2. A primeira entrega deve ser apenas **simulador + parâmetros**, ou já deve incluir cadastro de campanha e audiência?
3. A aprovação de uma campanha exige apenas admin, ou gerente da unidade também pode aprovar?
4. As tarifas iniciais permanecem R$0,00 / R$0,05 / R$0,50 até a primeira confirmação da WABA/BSP?
5. O painel deve aceitar lançamento manual de custo confirmado, enquanto a integração de status da Meta ainda não está pronta?

## Referências

[1] [Meta — preços da WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
