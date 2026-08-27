# Referências oficiais — Cobrança por Link de Pagamento

## Mercado Pago Checkout Pro

- O Checkout Pro permite criar uma preferência de pagamento no backend para cada pedido ou fluxo de pagamento, com itens, valores e meios de pagamento.
- A resposta da preferência contém um identificador único e uma URL de checkout para iniciar o pagamento.
- O Checkout Pro suporta Pix, cartões, boleto e outros meios habilitados na conta do vendedor.

Fonte: [Visão geral do Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/overview) e [Criar preferência](https://www.mercadopago.com.ar/developers/pt/docs/checkout-pro/create-payment-preference).

## Rastreabilidade e atualização de status

- O campo `external_reference` pode vincular a preferência a um registro interno, mas não deve ser utilizado isoladamente para classificar pagamentos históricos.
- `back_urls` permite retorno para URL HTTPS de sucesso, pendência e erro; `auto_return: approved` retorna automaticamente após aprovação.
- `notification_url` pode ser definida em cada preferência, com prioridade sobre a configuração geral de Webhooks.
- O Mercado Pago envia notificações de criação e atualização de pagamento por HTTPS POST, com `data.id` do pagamento; a origem deve ser validada pelo cabeçalho `x-signature` e pela chave secreta da aplicação.
- O recebedor deve responder HTTP 200 ou 201. Sem confirmação, o Mercado Pago volta a tentar a entrega. Após receber o evento, o CRM deve consultar `GET /v1/payments/{id}` e usar essa resposta como fonte de verdade do status.

Fonte: [Configurar URLs de retorno](https://www.mercadopago.com.ar/developers/pt/docs/checkout-pro/configure-back-urls) e [Notificações de pagamento](https://www.mercadopago.com.ar/developers/pt/docs/checkout-pro/payment-notifications).

## Meios de pagamento

- Todos os meios habilitados na conta ficam disponíveis por padrão no Checkout Pro.
- Uma preferência pode excluir tipos de pagamento ou bandeiras específicas, mas o dinheiro em conta não pode ser excluído.
- O formulário registra a forma mencionada na conversa apenas como contexto operacional; nesta primeira versão não restringe meios de pagamento no checkout para não impedir opções válidas sem uma regra comercial aprovada.

Fonte: [Excluir meios de pagamento](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-settings/payment-methods).

## Proteções de desenho adotadas

1. Toda cobrança deve ter valor, descrição, unidade, cliente e responsável definidos antes da criação.
2. A criação e o envio pelo WhatsApp devem ser ações humanas explícitas, com prévia e confirmação.
3. O CRM deve guardar o identificador interno e a preferência, mas nunca expor token do Mercado Pago.
4. Cada cobrança recebe uma preferência exclusiva. Um reenvio ao mesmo cliente só reutiliza o Link enquanto aquela cobrança estiver aberta; após aprovação, uma nova cobrança recebe uma nova preferência.
5. Um atalho de produto preenche o formulário, mas não representa um Link compartilhado entre clientes.
6. O webhook deve validar a assinatura antes de processar, consultar o pagamento pelo ID recebido e conferir status, valor e referência antes de marcar a cobrança como aprovada.
7. Reentregas do webhook precisam ser idempotentes e não podem criar alertas duplicados.
