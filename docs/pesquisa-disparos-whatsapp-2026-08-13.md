# Pesquisa — Disparos de WhatsApp para a base Buddha Spa

**Escopo:** pesquisa sem implementação, preparada em 13 de agosto de 2026.

## Evidências oficiais consolidadas

| Tema | Achado | Fonte |
|---|---|---|
| Consentimento | Antes de contatar alguém no WhatsApp, a empresa deve ter o número e a permissão para comunicações posteriores. O consentimento precisa identificar a empresa e deixar claro que a pessoa optou por receber mensagens. | [Meta — opt-in](https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in) |
| Disparo fora de 24 horas | Apenas mensagens de template podem ser enviadas fora da janela de atendimento. Templates precisam ser aprovados. | [Meta — templates](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview) |
| Categoria | Ofertas, reativação e renovação são marketing. Lembretes específicos de agenda e informações não promocionais podem ser utility. Conteúdo misto tende a marketing. | [Meta — categorias](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization) |
| Cobrança | Desde julho de 2025, a Meta cobra por template entregue, variando por categoria e país do destinatário. Mensagens não-template são gratuitas apenas na janela aberta de atendimento; utility em resposta ao usuário nessa janela também é gratuita. | [Meta — preços](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) |
| Limite inicial | Portfólios de negócio novos começam com 250 destinatários únicos em 24 h fora da janela. O limite é compartilhado entre números do mesmo portfólio e pode chegar a 2.000 por verificação ou por 2.000 entregas de alta qualidade em 30 dias; depois escala automaticamente. | [Meta — limites](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits) |
| Qualidade | Avaliação do template usa feedback e engajamento; qualidade baixa pode levar a pausa ou desativação. | [Meta — qualidade](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-quality) |
| Frequência | A Meta pode limitar dinamicamente mensagens de marketing por usuário e recomenda esperar 24 h antes de tentar reenviar após o erro 131049. | [Meta — limite por usuário](https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/marketing-templates/per-user-limits) |
| BotConversa | O plano Pro + API Oficial anunciado é R$199/mês no anual, com API oficial, coexistência, construtor de fluxos, integrações e créditos de campanha iniciais. O custo de mensagens oficiais é adicional, por créditos próprios do fornecedor. | [BotConversa — planos](https://botconversa.com.br/en/) |
| Coexistência | O BotConversa declara permitir API oficial mantendo o mesmo número ativo em WhatsApp App/Web e com atendimento humano; exige acesso administrativo ao Business Manager. | [BotConversa — coexistência](https://ajuda.botconversa.com.br/comece-por-aqui-aulas-sequenciais/primeiros-passos-botconversa-api-oficial/aula-3-como-conectar-seu-whatsapp-no-botconversa-oficial-com-coexistencia) |
| Marketing Messages API | A Meta oferece uma API de marketing opcional com otimização de entrega, métricas e mecanismo de preço máximo em beta; exige onboarding específico e o recurso de preço máximo está em rollout. | [Meta — Marketing Messages API](https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/overview) [Meta — preço máximo](https://developers.facebook.com/documentation/business-messaging/whatsapp/marketing-messages/pricing) |

## Implicação preliminar

Para campanhas de reativação e oferta do spa, a categoria adequada tende a ser **marketing**. O requisito operacional mais importante não é o construtor de fluxos: é manter prova de consentimento, preferências de canal/frequência, opt-out, template aprovado, fila limitada, registros de entrega/leitura/erro e exclusão automática de contatos inelegíveis.

O CRM já possui Inbox, clientes, unidades, fluxos, IA, histórico e uma base para operar a campanha internamente. Ainda faltam, para uma operação de disparo própria pronta para escala: camada de consentimento e preferências, catálogo de templates oficiais com status/categoria, importação/sincronização dos templates da WABA, campanha/audiência congelada, motor de fila/rate limit, observabilidade de entregas, opt-out e relatórios de custo/qualidade.
