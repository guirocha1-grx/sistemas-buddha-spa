# Referência — origem de pagamentos Mercado Pago

Consultado em 2026-08-26 para avaliar a diferenciação entre pagamentos online por Link de Pagamento e pagamentos presenciais por Point.

- A documentação de início do Mercado Pago separa **Payment Link** como solução de pagamento online, usada para cobrança por chat e redes sociais, e **Mercado Pago Point** como solução presencial por maquininha. Fonte: <https://www.mercadopago.com.br/developers/en/docs/getting-started>.
- A documentação de Point descreve a operação presencial vinculada ao terminal e ao ponto de venda, com a sequência de criação de pedido, carregamento no terminal e confirmação do pagamento. Fonte: <https://www.mercadopago.com.mx/developers/en/docs/mp-point/overview>.

Essas referências confirmam que os dois canais são produtos distintos. A identificação precisa, porém, depende de campos efetivamente retornados no payload da API de pagamentos e de quais deles são persistidos pelo CRM.
