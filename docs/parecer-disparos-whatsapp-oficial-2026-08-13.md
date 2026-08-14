# Parecer técnico — disparos de WhatsApp para o Buddha Spa

**Data da pesquisa:** 13 de agosto de 2026.  
**Escopo:** análise; nenhuma integração, configuração, campanha ou disparo foi criado.

## Síntese executiva

Para o **Buddha Spa**, a recomendação é construir a operação de campanha **dentro do CRM**, usando a API oficial da Meta como canal de entrega, mas fazê-lo em etapas e somente depois de uma preparação de conformidade. O BotConversa é uma boa opção de **aceleração temporária** caso a prioridade seja começar campanhas aprovadas o quanto antes; não é o melhor sistema de registro para a operação definitiva, porque separa audiência, consentimento, automações e métricas do CRM que já concentra clientes, unidades, Inbox e dados do Belle.

> O BotConversa não elimina homologação, opt-in, categoria de template, limite de envio, custo Meta ou risco de qualidade. Ele reduz sobretudo o trabalho de construir interface, fila e editor no curto prazo.

## O que já existe no CRM

| Ativo já construído | Situação para campanhas oficiais |
|---|---|
| Clientes, unidades e dados Belle | Base adequada para segmentar, desde que o telefone, consentimento e unidade sejam saneados antes de uma campanha. |
| Inbox, histórico, atendimento humano e IA | Bom ponto de chegada para respostas a campanhas e conversão da janela de atendimento em conversa assistida. |
| Fluxos, nós de espera, menu, condição, mídia, webhook e cron | Reaproveitável para jornadas conversacionais. Hoje está orientado a uma conversa existente e usa Z-API como canal de envio. Não é ainda um orquestrador de campanha oficial em massa. |
| `buddhaMktApi.ts` | Já há um conector inicial da Cloud API oficial e webhook do canal Buddha Mkt. Ele ainda envia apenas texto comum, não integra catálogo de templates, status de aprovação, audiência, limites, opt-out ou retornos de entrega. |
| Logs, usuários e permissões | Base útil para auditoria de campanha, mas ainda sem objeto de campanha, destinatário, custo e eventos de delivery/read/failed. |

## Regras que permanecem em qualquer alternativa

| Requisito | Consequência prática para o spa |
|---|---|
| Opt-in | Ter uma pessoa na base e ter o telefone não é suficiente. É preciso poder demonstrar que ela autorizou comunicação posterior do Buddha Spa; o registro deve identificar a empresa, a origem, a data e a categoria autorizada. A Meta recomenda também permitir opt-out por categoria. [Meta — opt-in](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in) |
| Janela de atendimento | Fora das 24 horas desde a última mensagem do cliente, só é permitido iniciar contato por template aprovado. Dentro da janela, texto e mídia comuns podem ser enviados. [Meta — templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview) |
| Categoria | Reativação, oferta, promoção, renovação e recomendação são, em regra, **marketing**. Lembrete de agendamento específico e informação não promocional ligada a uma interação podem ser **utility**. Conteúdo misto tende a ser classificado como marketing. [Meta — categorização](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization) |
| Homologação | Templates precisam estar `APPROVED` para serem usados. A Meta pode reclassificar utility como marketing, e feedback/engajamento afetam a qualidade e a capacidade de envio. [Meta — templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview) |
| Escala | Uma conta nova começa com 250 destinatários únicos em 24 horas fora da janela. O limite é compartilhado pelo portfólio de negócio, não por unidade; pode subir após verificação e entrega de mensagens de qualidade. [Meta — limites](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits) |
| Frequência | A Meta pode limitar marketing por pessoa de forma dinâmica. O erro `131049` exige esperar pelo menos 24 horas antes de nova tentativa. [Meta — limite por usuário](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits) |
| Custo Meta | A cobrança é por template **entregue**, não apenas solicitado; depende da categoria e do país do destinatário. Mensagens de serviço e utility em resposta dentro da janela têm tratamento gratuito. [Meta — preços](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) |

## Comparação

| Critério | BotConversa Pro + API Oficial | Construção interna oficial |
|---|---|---|
| Início operacional | Mais rápido: construtor visual, campanhas e conectores já existem. | Exige montar os controles específicos de campanha antes de ativar disparos. |
| Homologação Meta | Não é eliminada. Templates, categorias, opt-in, qualidade e limites continuam sendo regras Meta. | Igual ao BotConversa, com maior transparência do fluxo e dos retornos. |
| Mensalidade da plataforma | O site informa **R$199/mês no anual** para Pro + API Oficial; custo de mensagens é adicional por créditos do fornecedor. Isso equivale a **R$2.388/ano** só de assinatura, antes de créditos e Meta. [BotConversa — planos](https://botconversa.com.br/en/) | Sem mensalidade de um construtor externo, mas com custo inicial de produto/engenharia e manutenção. Mensagens Meta continuam sendo cobradas. |
| Custo por mensagem | Pode incluir a camada de crédito/preço próprio do BSP além da assinatura; validar tarifa e margem antes de contratar. [Termos BotConversa](https://botconversa.com.br/en/terms-of-services) | Custo Meta direto e auditável por entrega; demanda controle de orçamento no CRM. |
| Segmentação Buddha | Exige exportar ou sincronizar audiência, etiquetas e status com outra plataforma. | Usa diretamente cliente, unidade, serviços, planos, agenda, presença e dados Belle. |
| Fonte de verdade | Tende a criar uma segunda base de contatos e de estados de campanha. A API/webhooks ajudam, mas a sincronização precisa ser projetada. [API BotConversa](https://ajuda.botconversa.com.br/integracoes/api-botconversa) | Uma só fonte para consentimento, elegibilidade, execução e resultado. |
| Integração com Inbox atual | Há risco de duas operações competirem pelo mesmo número/canal. A coexistência declarada cobre App/Web e atendimento humano, mas é necessário confirmar como eventos completos de mensagem, status e template seriam espelhados para o CRM. [Coexistência](https://ajuda.botconversa.com.br/comece-por-aqui-aulas-sequenciais/primeiros-passos-botconversa-api-oficial/aula-3-como-conectar-seu-whatsapp-no-botconversa-oficial-com-coexistencia) | Inbox e campanha compartilham conversa, responsável, histórico e ações sem sincronização externa. |
| Relatórios | Conveniente para métricas padrão da plataforma. | Pode cruzar campanha com agenda, comparecimento, plano, recebimento e conversão por unidade. |
| Flexibilidade | Alta para fluxos padrões; limitada ao modelo da ferramenta e à sua API. | Alta para regras do Buddha, mas aumenta responsabilidade de produto e operação. |
| Dependência de fornecedor | Maior: créditos, recursos, política comercial e trilha de integração do parceiro. | Maior responsabilidade técnica própria; dependência principal fica na Meta. |

## Recomendação

### Caminho recomendado: interno, em três gates

1. **Gate de conformidade e dados.** Criar registro de opt-in, origem, categorias permitidas, data, prova e opt-out; concluir a normalização de telefones quando ela for retomada; separar explicitamente SSU e RBS. Sem esse gate, nenhuma alternativa é segura para disparar a base.
2. **Gate de canal oficial.** Configurar a credencial da WABA já disponível no conector Buddha Mkt, verificar o negócio, registrar webhooks de status e criar 3 a 5 templates piloto no WhatsApp Manager. Começar com uma pequena audiência que tenha opt-in claro.
3. **Gate de campanha.** Construir `campanhas`, `campanha_destinatarios`, `templates`, `consentimentos` e `opt_outs`; congelar a audiência antes do envio; limitar fila, registrar `sent/delivered/read/failed`, impedir reenvio do erro 131049 e pausar automaticamente template de baixa qualidade.

Essa rota transforma os fluxos já construídos em uma camada de **conversa pós-campanha**, em vez de tentar usá-los imediatamente como motor de disparo. O editor de fluxos pode, depois, ser conectado a gatilhos de resposta, mas não deve ser o primeiro mecanismo de marketing em massa.

### Quando o BotConversa faz sentido

Use como piloto de curto prazo somente se houver urgência comercial para lançar campanhas antes de o núcleo interno ficar pronto **e** se o fornecedor confirmar por escrito os pontos abaixo. Nesse caso, o CRM deve continuar registrando consentimento, segmentação e resultado; o BotConversa ficaria limitado ao envio/orquestração temporária.

1. O mesmo número oficial pode operar sem conflito com o webhook e Inbox existentes.
2. Há exportação ou webhook completo de inbound, outbound, `sent`, `delivered`, `read`, `failed`, opt-out, template e qualidade.
3. O custo final por categoria/destino, além de R$199/mês, está documentado e comparável com a tarifa Meta.
4. A conta/WABA, templates e histórico de consentimento pertencem ao Buddha Spa e são exportáveis caso a plataforma seja encerrada.
5. A coexistência escolhida não desconecta os canais atuais nem cria duas fontes de verdade.

## Decisão prática sugerida

**Não contratar BotConversa como núcleo definitivo agora.** Primeiro, homologar e desenhar a operação oficial interna. Se a urgência de lançamento superar esse esforço, contratar o Pro por período curto para um piloto controlado, com uma única campanha, audiência pequena, template marketing aprovado, opt-in documentado e integração mínima de retorno ao CRM. A continuidade após o piloto deve depender de custo por entrega, taxa de resposta, bloqueios/opt-outs e custo de manter a sincronização.

## Perguntas para levar ao fornecedor antes de fechar

1. Qual é o valor efetivo, em BRL, de cada marketing template entregue a número brasileiro, além da mensalidade?
2. O crédito é cobrado por entrega, tentativa ou ambos? Há saldo mínimo, expiração ou markup sobre Meta?
3. O número/WABA e os templates ficam em conta Meta do Buddha Spa ou sob gestão do BSP? Como exportar tudo na saída?
4. Há webhook de todos os status de mensagens e de opt-out? Qual payload e prazo de retenção?
5. É possível integrar o CRM atual sem duplicar contato, conversa e responsável?
6. Há compatibilidade comprovada com outro Inbox/CRM consumindo a Cloud API no mesmo número?
7. Como a plataforma expõe limites Meta, erro 131049, template pause e qualidade por template?

## Fontes principais

1. [Meta — opt-in](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in)
2. [Meta — templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview)
3. [Meta — categorização](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization)
4. [Meta — preços](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
5. [Meta — limites](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)
6. [Meta — qualidade](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-quality)
7. [BotConversa — planos](https://botconversa.com.br/en/)
8. [BotConversa — API e webhook](https://ajuda.botconversa.com.br/integracoes/api-botconversa)
