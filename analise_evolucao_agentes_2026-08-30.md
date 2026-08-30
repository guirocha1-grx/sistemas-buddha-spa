# Evolução dos agentes de atendimento — atualização 30/08

**Data da análise:** 30/08/2026
**Autor:** Claude (Sonnet 5), a pedido do Guilherme
**Escopo:** continuação do histórico documentado pelo Manus AI (Pareto 20/08, Efetividade 22/08, Evolução + Estado 28/08).

> **Limitação metodológica, declarada de propósito:** este documento **não tem acesso ao banco de produção** (TiDB). Os três relatórios anteriores do Manus cruzaram `agentes_execucoes`, `agentes_sugestoes` e `inbox_mensagens` para produzir números de aprovação/rejeição reais. Esta atualização é **baseada em código e histórico de commits**, não em dados de uso — serve para responder "o que mudou desde o último checkpoint", não "os agentes melhoraram na prática". Pra isso, é preciso rodar uma nova coleta (Manus de novo, ou me dar acesso ao banco).

## 1. Trajetória até aqui (consolidando os 3 relatórios do Manus)

| Data | Relatório | Indicador-chave | Leitura |
|---|---|---:|---|
| 20/08 | Pareto | 87,3% das divergências em Carol e Bianca; só 3,3% aceitas sem edição | Sistema tecnicamente estável, mas sugestão raramente pronta pra envio direto |
| 22/08 | Efetividade pós-ajustes | Aprovação sobe de 77,1% → 96,8%; reprovação cai de 22,9% → 3,2% | Melhora real e grande, mas 84,2% das aprovadas ainda são editadas |
| 28/08 | Evolução | 87,4% de aprovação geral; 93,4% das aprovações exigem edição; Áurea concentra 58/59 falhas recentes (respostas vazias por orçamento de raciocínio esgotado) | Qualidade de conteúdo é boa; o problema agudo do momento é disponibilidade técnica da Áurea, não redação |

**Padrão que se repete nos três relatórios:** o "primeiro rascunho" está bom e melhorando, mas a redação final quase sempre precisa de ajuste humano. Nenhum dos três relatórios registra esse número caindo — é o gargalo mais persistente da série.

## 2. O que mudou desde o último checkpoint (28/08 16:25, doc `estado_agentes_atendimento`)

Só existe **um commit** tocando lógica de agente depois desse checkpoint: [`6bc7c8f`](https://github.com/guirocha1-grx/sistemas-buddha-spa/commit/6bc7c8f) (28/08 17:21) — *"fix(agents): acolhe saudações e filtra horários inviáveis"*. Duas mudanças concretas:

1. **Acolhimento na primeira mensagem.** Quando o cliente abre a conversa com saudação ("oi", "boa tarde", "tudo bem?"), o especialista agora começa a sugestão com "Bom dia/Boa tarde/Boa noite" (calculado pelo horário real de Brasília) antes de responder o pedido — em vez de ir direto ao ponto. Isso ataca diretamente a lacuna de **"Tom cordial"** que o `plano_gradual_qualidade_agentes.md` (Lote 1) apontava: *"respostas corretas porém secas ou apressadas"*.
2. **Filtro de horário inviável.** Ao sugerir horários disponíveis para "hoje", o sistema agora exige pelo menos 90 minutos de antecedência (`ANTECEDENCIA_MINIMA_AGENDAMENTO_MINUTOS`) — antes podia oferecer um slot daqui a 10 minutos, por exemplo. Quando não sobra slot viável, a Carol passa a perguntar se o cliente topa outro período ou amanhã, em vez de simplesmente não ter o que oferecer. Também ampliou a lista de horários de tarde ofertados (2 → 4 opções).

Nenhuma outra alteração em `agentesService.ts`, `agentesDb.ts` ou nos prompts desde então.

## 3. Desde 29/08: silêncio total nos agentes

Os últimos dois dias de commits (29 e 30/08 — vínculo/nível de terapeuta, conciliação PDV com Belle, cobrança por link com parcelas, refatoração da Agenda, integração Belle liga/desliga por unidade) **não tocaram em nenhum arquivo de agente**. O foco do desenvolvimento migrou inteiramente para: terapeutas, financeiro/conciliação e cobrança. Isso não é bom nem ruim por si só, mas é um dado relevante pra "evolução dos agentes": **não houve evolução de agente nos últimos 2 dias**, só na semana anterior.

## 4. Itens do plano do Manus que ainda não avançaram

Cruzando com `plano_gradual_qualidade_agentes.md`:

| Item do plano | Status em 30/08 |
|---|---|
| Lote 1 — biblioteca de exemplos canônicos, resposta em 3 movimentos, barreira de escopo, separação de campanha | Parcial — o acolhimento (item 4) avançou em 28/08; não achei evidência de biblioteca formal de exemplos por intenção nem da estrutura de "3 movimentos" documentada em prompt |
| Lote 2 — suíte de 20–30 casos reais de regressão com rubrica humana | **Não implementado.** Existe `agentesService.test.ts` (42 casos), mas são testes unitários de lógica determinística, não uma suíte de avaliação de qualidade de resposta com rubrica 1–5 |
| Lote 3 — calibrar confiança da Áurea e ativar por coorte (Bianca/Fabricia primeiro) | **Não implementado.** Não há sinal no código de bloqueio por confiança calibrada nem de desativação seletiva por especialista além do que já existia (chaves de automação por conversa) |

## 5. Recomendação

O commit de 28/08 à tarde resolveu dois problemas pontuais e reais, mas nenhum dos três pilares estruturais do plano do Manus (exemplos canônicos, suíte de avaliação, confiança calibrada) avançou. Antes de continuar corrigindo sintomas um a um:

1. **Rodar uma nova coleta de dados** (Manus de novo ou acesso direto ao banco) cobrindo 28/08 17:21 até hoje, pra medir se o acolhimento e o filtro de horário realmente reduziram edição/rejeição — sem isso, o fix de 28/08 é uma hipótese não verificada, por melhor que pareça no código.
2. Se a taxa de "aprovada mas editada" (93,4% no último corte) não estiver caindo, o Lote 2 (suíte de regressão) deixa de ser opcional — é o único jeito de saber se um novo ajuste de prompt piora um caso que já funcionava.
