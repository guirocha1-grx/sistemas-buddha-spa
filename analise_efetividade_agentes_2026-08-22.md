# Análise de Efetividade dos Agentes — Pós-ajustes

**Período analisado:** 18 a 22 de agosto de 2026.  
**Recorte comparativo:** antes dos ajustes recentes (18–20/08) versus depois (21–22/08, até 18h55).  
**Base analisada:** 629 sugestões registradas no Inbox, com avaliação da recepção quando disponível.[1]

## Conclusão executiva

> **A efetividade melhorou de forma material.** Entre as sugestões que receberam decisão humana, a taxa de aprovação passou de **77,1% para 96,8%**, enquanto a taxa de reprovação caiu de **22,9% para 3,2%**. O volume dos dois recortes é praticamente equivalente — 312 sugestões antes e 317 depois —, o que torna a comparação operacionalmente útil.[1]

O avanço é mais evidente em **Carol**, **Bianca** e **Diana**, que concentravam os problemas anteriores. Ao mesmo tempo, a equipe ainda altera o texto em **84,2%** das sugestões aprovadas no período recente. Portanto, o sistema deixou de gerar muitas respostas erradas, mas ainda não chegou ao ponto em que a recepção apenas valida e envia o texto com frequência alta.[1]

| Indicador | 18–20/08 | 21–22/08 | Leitura |
|---|---:|---:|---|
| Sugestões geradas | 312 | 317 | Base de comparação equilibrada |
| Sugestões com decisão humana | 201 | 124 | Menos decisões diretas porque cresceu a substituição por contexto |
| Aprovação entre decisões humanas | 77,1% | **96,8%** | **+19,7 p.p.** |
| Reprovação entre decisões humanas | 22,9% | **3,2%** | **−19,7 p.p.** |
| Sugestões obsoletas | 19,6% | 47,9% | A regra de manter somente a última sugestão está operando; é descarte por contexto, não reprovação humana |
| Aprovadas enviadas sem alteração textual | 32,9% | 15,8% | O texto ainda exige adaptação frequente |
| Aprovadas enviadas com alteração textual | 67,1% | 84,2% | Principal oportunidade atual de melhoria |

## Leitura por agente

| Agente | Antes: aprovação / reprovação | Depois: aprovação / reprovação | Diagnóstico |
|---|---:|---:|---|
| **Carol** | 85 / 24 | 65 / 1 | Principal melhora. A aprovação entre decisões humanas sobe de 78,0% para 98,5%. Ainda tem 80 sugestões obsoletas e 59 das 65 aprovadas foram alteradas antes do envio. |
| **Bianca** | 38 / 5 | 32 / 2 | Melhora real, porém a recepção ainda ajusta 25 das 32 aprovadas. Falta refinar a resposta inicial para explicar antes de perguntar ou avançar para a próxima etapa. |
| **Diana** | 15 / 17 | 8 / 0 | A correção de voucher/fluxo reduziu a rejeição a zero neste recorte. A amostra posterior é pequena (14), portanto precisa continuar em observação. |
| **Aurea** | 12 / 0 | 9 / 0 | Não há rejeições. O alto número de obsoletas (22 de 31) indica que as aberturas são rapidamente substituídas pelo contexto seguinte, e não que o acolhimento esteja incorreto. |
| **Estela** | 3 / 0 | 6 / 0 | Resultado positivo, mas a amostra ainda é pequena. |
| **Fabricia** | 2 / 0 | 0 / 1 | Amostra insuficiente. A única reprovação recente indicou que a resposta deveria enviar a localização diretamente, em vez de oferecer verificar a informação. |

## Qualidade observada

Os motivos de rejeição apontam uma redução relevante de falhas de contexto. Antes dos ajustes, houve **23 reprovações por contexto** e **20 classificadas como “outro”**; no período posterior restaram somente **três reprovações por contexto** e **uma por informação**.[1]

As quatro reprovações recentes confirmam problemas específicos e tratáveis, não uma falha generalizada de roteamento. Elas mostram: envio de localização quando a informação já é conhecida; explicação de terapias antes de fazer perguntas adicionais; e uso de dados disponíveis do voucher/cliente antes de pedir novamente o que já consta no contexto.[1]

## Interpretação correta da métrica de edição

O campo `tipoRevisao = editada` sozinho não basta para medir qualidade, pois o fluxo do Inbox pode registrar o envio pelo compositor como edição. Por isso, esta análise comparou o texto sugerido com o texto final efetivamente enviado. O resultado confirma que o ajuste textual é real: **101 das 120 sugestões aprovadas** no período recente tiveram conteúdo final diferente da sugestão original.[1]

Isso não invalida a melhora de efetividade: significa que os agentes passaram a acertar muito mais o **caminho da conversa**, mas a recepção ainda precisa adequar tom, informação específica do momento ou decisão comercial final.

## Prioridades recomendadas

| Prioridade | Ação recomendada | Motivo |
|---|---|---|
| 1 | Manter os prompts atuais e observar mais 100 sugestões antes de iniciar um lote amplo de mudanças. | A queda de reprovação é forte; mudar muitas regras agora pode desfazer um ganho comprovado. |
| 2 | Refinar Carol com contexto de plano, última terapia e período já informado. | Ela responde por 51,4% do volume recente e concentra o maior número absoluto de edições e obsoletas. |
| 3 | Ajustar Bianca para oferecer uma explicação factual curta antes de abrir novas perguntas. | As reprovações recentes mostram avanço prematuro para qualificação em pedidos de informação. |
| 4 | Criar respostas diretas ou fluxos para localização, endereço e informações estáticas da Fabricia. | Evita que o agente prometa “verificar” algo que já pode ser informado imediatamente. |
| 5 | Separar no painel gerencial “enviado sem alterar”, “enviado com alteração” e “reprovado”. | A taxa de edição é hoje o melhor indicador para evoluir de assistente útil para texto pronto para envio. |

## Limites da análise

O período posterior abrange aproximadamente dois dias e parte do segundo dia, portanto a tendência é promissora, mas ainda não é uma medição estável de longo prazo. A elevação de sugestões obsoletas também reduz o denominador de avaliações humanas; ela deve ser acompanhada separadamente como métrica de volume e timing, não tratada como erro de qualidade.[1]

## Referências

[1]: #dados-internos “Dados internos do CRM: tabelas `agentes_sugestoes`, `agentes_execucoes` e `agentes_atendimento`, consultadas em 22/08/2026.”

## Dados internos

As contagens, taxas e classificações deste relatório foram calculadas a partir dos registros de sugestões, avaliações, texto final, motivo de avaliação e roteamento armazenados no banco do Sistemas Buddha Spa CRM em 22/08/2026.
