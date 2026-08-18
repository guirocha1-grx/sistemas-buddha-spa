# Plano de Normalização de Telefones — Inbox WhatsApp e CRM

## Objetivo

Fazer com que uma conversa recebida pelo WhatsApp seja vinculada ao cliente correto, mesmo quando o mesmo número aparece com pontuação, sem DDI, com DDI, ou no cadastro antigo sem o nono dígito. O formato visual armazenado pelo Belle continuará preservado; a normalização será usada apenas como uma chave técnica de busca e vínculo.

> **Princípio:** o Belle segue como fonte de verdade de cadastro. A base local apenas cria índices de telefone para localizar o cliente e a conversa com segurança.

## Diagnóstico atual

| Ponto | Situação atual | Consequência |
|---|---|---|
| Helper de telefone | Remove símbolos e cria algumas variantes | Não existe um formato canônico único persistido |
| Clientes | `celular`, `celular2` e `telefone` ficam como vieram do Belle/importação | Uma busca precisa transformar texto em toda consulta |
| Conversas | `inbox_conversas.telefone` é comparado literalmente em alguns fluxos | O mesmo contato pode abrir conversa duplicada com formatos distintos |
| WhatsApp | Entrega telefone real ou `@lid` | Um `@lid` não deve ser tratado como telefone nem disparar criação de cliente |

O risco principal não é apenas deixar de localizar o cliente: quando não há correspondência, a tela oferece criação de outro cadastro. Hoje um telefone formatado de forma diferente pode acionar esse fluxo indevidamente.

## Padrão proposto

| Conceito | Regra |
|---|---|
| Número canônico | Somente dígitos em E.164 brasileiro: `55` + DDD + número, por exemplo `5516974007994` |
| Número local | DDD + número: `16974007994`, usado somente como variante de compatibilidade |
| Formato de exibição | Preservado nos campos existentes, por exemplo `(16) 97400-7994` |
| Telefone legado | Para 10 dígitos, gerar a variante com nono dígito, mas nunca sobrescrever o campo original automaticamente |
| `@lid` | Guardado em `chatLid`; não é telefone e não cria ou vincula cliente até ser resolvido para um número real |

## Implementação preventiva — novas mensagens

1. Criar um único helper compartilhado que recebe qualquer formato e retorna: telefone canônico, telefone local, variantes e um motivo de rejeição quando não houver DDD/número válido.
2. Adicionar `telefoneNormalizado` em `inbox_conversas`, preservando o campo `telefone` atual para exibição e compatibilidade.
3. Criar uma tabela de índice `cliente_telefones` com `clienteId`, `numeroCanonicado`, origem (`celular`, `celular2`, `telefone`) e data de atualização. Essa tabela permite buscar sem aplicar `REPLACE` no banco em cada atendimento.
4. No webhook, resolver `@lid` primeiro. Com número real, procurar candidatos pelo índice:
   - **um cliente:** vincular automaticamente, independentemente da grafia do nome no WhatsApp;
   - **nenhum cliente:** mostrar o cartão de criação;
   - **mais de um cliente:** mostrar seleção manual e nunca criar automaticamente.
5. Ao abrir conversa a partir da tela de Clientes, usar exatamente a mesma chave canônica e a mesma regra de busca.

## Saneamento do histórico

1. Executar primeiro um relatório de prévia, sem alterar dados: total de telefones válidos, inválidos, números compartilhados, conversas sem cliente e possíveis vínculos únicos.
2. Popular `cliente_telefones` a partir dos três campos atuais de `clientes`, preservando a origem e sem modificar o texto trazido do Belle.
3. Popular `inbox_conversas.telefoneNormalizado` apenas para números reais. Conversas com `@lid` continuam separadas e pendentes de resolução.
4. Vincular em lote somente as conversas que resultarem em **um único cliente**. Casos ambíguos entram em uma fila de revisão; não haverá exclusão ou mesclagem automática de clientes.
5. Criar um log de auditoria do lote com quantidade vinculada, conflitada, inválida e ignorada.

## Segurança e validação

| Cenário de teste | Resultado esperado |
|---|---|
| `(16) 97400-7994` × `5516974007994` | Mesmo cliente e mesma conversa |
| Telefone com 10 dígitos no cadastro antigo × WhatsApp com nono dígito | Mesmo cliente, via variante controlada |
| Dois clientes com o mesmo número | Escolha manual, sem criar terceiro cadastro |
| `@lid` sem resolução | Nenhuma criação de cliente |
| Telefone inexistente | Cartão “Criar cliente no CRM” permanece disponível |
| Nova conversa de cliente existente | Vínculo automático e ausência de duplicidade |

## Ordem de execução

1. Implementar helper, schema, índice e testes, sem alterar histórico.
2. Publicar e validar novas mensagens em SSU e RBS.
3. Rodar o relatório de prévia do histórico e apresentar os números para aprovação.
4. Executar o backfill de vínculos únicos e disponibilizar a fila de conflitos.
5. Monitorar por uma semana a criação de clientes e os logs de vínculos para confirmar que não surgem duplicidades.

## Decisão necessária

O fluxo proposto usa vínculo automático quando existe **um único cliente com o telefone canônico**, mesmo que o nome exibido no WhatsApp seja diferente. Isso reduz falsos negativos, pois telefone é identificador mais confiável que nome de perfil. Telefones compartilhados continuam exigindo escolha manual.
