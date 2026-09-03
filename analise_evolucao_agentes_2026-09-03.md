# Evolução dos agentes de atendimento — atualização 03/09

**Data da análise:** 03/09/2026
**Autor:** Claude (Sonnet 5), a pedido do Guilherme
**Período coberto:** 30/08 22:27 → 03/09 (checkpoint anterior: `analise_evolucao_agentes_2026-08-30.md`)
**Método:** consulta somente leitura direto no TiDB de produção via `POST /api/claude-consulta` ([server/claudeQueryRoute.ts](server/claudeQueryRoute.ts)), mesma metodologia dos relatórios anteriores.

## 1. Resumo executivo

Volume: **510 execuções** no período (286 concluídas, 210 ignoradas, 13 com erro técnico, 1 pendente).

| Indicador | 30/08 (checkpoint anterior) | 03/09 (agora) | Leitura |
|---|---:|---:|---|
| Falhas técnicas | 0 em 382 execuções | **13 em 510** | Regrediu — mas concentrado, ver seção 2 |
| Aprovação entre decisões humanas | 96,9% | **91,3%** | Caiu ~5,6 p.p. |
| Reprovação entre decisões humanas | 3,1% | **8,7%** | quase triplicou |
| Aprovadas que ainda precisam de edição | 93,6% | **88,3%** | Melhorou (mais sugestões aceitas como estão) |

O sinal misto é real: a redação "pronta pra enviar sem editar" melhorou, mas a taxa de rejeição total subiu — e as rejeições agora vêm com comentário livre de verdade (diferente do checkpoint anterior, onde as 4 rejeições de Carol não tinham texto). Isso deu dado concreto o suficiente pra apontar causa, não só sintoma — ver seção 3.

## 2. As 13 falhas técnicas

12 das 13 são a mesma assinatura — `Failed query: insert into agentes_sugestoes ...` — todas em **31/08, entre 20:25 e 21:00**, concentradas em 3 conversas próximas (3270011, 3270012, 3270014). A 13ª é de hoje (03/09 13:23): o especialista devolveu um JSON cortado no meio (`"message":"","status":"in_process","summary":"Verificar disponibilidade para Marina Medeiros Rosa..."` truncado) — mesma classe de falha que o relatório de 28/08 tinha achado 58 vezes na Áurea (orçamento de raciocínio esgotado); aqui foi 1 ocorrência isolada, num especialista, não na Áurea.

**Não é uma queda geral do banco:** dentro da mesma janela de 31/08 20:25-21:00, a conversa 3270011 teve execuções com **erro E sucesso intercaladas** (1410074/75/76/78 concluíram normal, 1410067/68/70/71/72/77/79/80/81 falharam) — descarta indisponibilidade ampla do TiDB. `agentes_sugestoes.execucaoId` tem índice único; o padrão intercalado numa conversa com o cliente mandando várias mensagens em sequência rápida (Pâmela Fernandes, ~1 mensagem a cada 1-13min por 35min) sugere uma condição de corrida específica dessa conversa, não investigada a fundo aqui — fica como item de investigação (seção 5). A mensagem de erro salva no banco não ajuda: começa direto em "Failed query" sem a causa real do MySQL, porque o Drizzle bota a causa em `error.cause`, não em `error.message`, e o código que grava `erroMsg` só captura `error.message`.

## 3. As 13 rejeições — a primeira vez que os comentários vêm preenchidos

Diferente do checkpoint de 30/08 (rejeições de Carol sem texto livre), essas vieram com comentário de verdade. Quatro padrões concretos:

**a) Falta de saudação — 4 de 13 rejeições (30,8%).** "Saudação e apresentação antes", "se apresentar antes", "Enviar uma saudação antes, se apresentar...". Isso é a reclamação real da recepção que motivou os 2 ajustes de hoje (ampliar `contemSaudacao` + "Que bom ter você aqui 😊"). Mas puxando a mensagem exata do cliente nesses 4 casos:

| id | Mensagem do cliente | Tinha palavra de saudação? |
|---|---|---:|
| 1710001 | "tem horario para shiatsu agora pela manha?" | Não |
| 1710044 | "Nesta sexta feira, teria horário mais ao final da tarde para eu fazer a massagem?" | Não |
| 1860005 | "Teria horário p massagem relaxante hoje a tarde?" | Não |
| 1710022 | "Ola boa tarde" | Sim — mas era a 2ª ou 3ª troca da conversa, não a 1ª (Fernanda já tinha se apresentado corretamente 3 mensagens antes) |

**Achado importante que muda o diagnóstico**: 3 dos 4 casos não tinham NENHUMA palavra de saudação na mensagem do cliente. O mecanismo de hoje (`saudacaoInicialEspecialista`) só age quando a mensagem do cliente *contém* uma saudação — ampliar a lista de palavras (o que já fiz hoje) não cobre esses 3 casos, porque não é uma questão de reconhecer variação de "oi", é que **a recepção quer cumprimento sempre na primeira resposta, tenha o cliente cumprimentado ou não**. O 4º caso (1710022) é outra coisa: a conversa já tinha sido corretamente saudada por "Fernanda" três mensagens antes — o pedido aqui parece ser de reapresentação ao trocar de assunto (voucher), não de saudação de abertura.

**b) Fato errado sobre serviço — 1 caso.** "A limpeza de pele dura 90 minutos" (Carol sugeriu 60). Vale conferir a tabela de preços/duração usada pelo agente.

**c) Contexto não lido — 2 casos.** Cliente já a caminho da unidade com agendamento fechado, e Carol pediu CPF/dados de novo como se fosse começar do zero; Diana leu "voucher que ganhou" como pedido de emissão em vez de resgate.

**d) Resposta incompleta — 1 caso.** Cliente pediu todos os valores de Relaxante, Estela só respondeu o de 90min.

## 4. Por especialista (decisões humanas, 150 no total)

| Especialista | Decisões | % do total | Editada | Aceita como está | Rejeitada |
|---|---:|---:|---:|---:|---:|
| Carol | 86 | 57,3% | 73 | 6 | 7 |
| Estela | 27 | 18,0% | 22 | 2 | 3 |
| Diana | 15 | 10,0% | 13 | 0 | 2 |
| Áurea | 13 | 8,7% | 5 | 7 | 1 |
| Bianca | 6 | 4,0% | 5 | 1 | 0 |
| Fabrícia | 3 | 2,0% | 3 | 0 | 0 |

Carol continua concentrando a maioria das decisões (era 74,7% em 30/08, agora 57,3% — proporcionalmente menor, mas ainda o maior volume de longe) e também a maioria das rejeições (7 de 13).

## 5. O que mudou no código desde 30/08 22:47

| Commit | Quando | O quê |
|---|---|---|
| `10b7a95` | 30/08 22:47 | Alerta automático de qualidade + simulador de prompt sem efeito colateral |
| `6017298` | 30/08 23:07 | Lote 2 do plano do Manus: suíte de regressão com casos reais |
| `5a7a79d` | 01/09 22:24 | Carol/Diana param de repetir sugestão já editada/descartada na mesma conversa |
| `bdb0c31` | 02/09 15:10 | Sugestão pendente expira sozinha após 30min sem avaliação |
| `ef212fd`/`551902b`/`c4caf4d` | 03/09 (hoje) | Amplia detecção de saudação, cordialidade "Que bom ter você aqui 😊", nova pergunta de abertura da Áurea |

Ou seja: o Lote 2 do plano do Manus (suíte de regressão), que o relatório de 30/08 recomendava como prioridade, **já foi implementado** (`6017298`) — vale rodar essa suíte como parte do acompanhamento contínuo, não só na criação.

## 6. Recomendação

1. **Cumprimento incondicional na primeira resposta** — não fiz essa mudança ainda porque muda o comportamento de forma mais ampla que os 2 ajustes de hoje: trocar a condição de "cliente cumprimentou" para "esta é a primeira resposta da equipe nessa conversa", independente do texto do cliente. Os dados da seção 3a sustentam isso com 3 casos reais e datados. Recomendo fazer, mas confirma com você antes — é uma mudança de comportamento, não só de vocabulário.
2. **Reapresentação ao trocar de especialista** (caso 1710022) — separado do item 1: quando a conversa muda de assunto e troca de especialista (ex.: Fernanda → outro fluxo de voucher), a recepção parece esperar uma reapresentação mesmo não sendo a 1ª mensagem da conversa. Precisa de mais exemplos antes de virar regra — só tenho 1 caso.
3. **Investigar a falha intercalada de 31/08** (seção 2) com acesso ao código de criação de execução/sugestão — o padrão (mesma conversa, sucesso e erro alternados) cheira a corrida de concorrência, não a fato isolado de infraestrutura.
4. **Conferir a duração da "Limpeza de pele"** na tabela de preços usada pelos agentes (achado 3b — Carol disse 60min, recepção corrigiu para 90min).
5. **Capturar `error.cause`, não só `error.message`**, ao gravar `erroMsg` nas execuções com erro — hoje perde a razão real do MySQL/Drizzle, dificultando qualquer investigação futura como a da seção 2.
