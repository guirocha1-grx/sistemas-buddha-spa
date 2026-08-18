# Leitura Operacional — Agentes de Atendimento do Buddha Spa Santa Úrsula

## Conclusão executiva

**Sim, a lógica está clara.** O material não descreve apenas seis prompts independentes: ele define uma **máquina de estados conversacional**. Cada agente recebe o histórico e as variáveis já acumuladas, responde em JSON estrito e devolve um `status` que determina se a conversa continua, se deve ser tratada pela recepção, se deve voltar ao qualificador ou se deve mudar silenciosamente de especialidade.

O desenho efetivo possui **seis agentes**, e não cinco. Aurea é a porta de entrada e o roteador; Bianca, Fabricia, Estela, Carol e Diana são especialistas. Carol e Diana não concluem a operação externa: elas estruturam uma solicitação pronta para a intervenção humana. Isso é compatível com o modelo copilot definido para o CRM.

| Agente | Papel operacional | Resultado principal | Limites críticos |
|---|---|---|---|
| **Aurea** | Qualificação e roteamento inicial | Identifica intenção em até três interações e escolhe o especialista | Não explica, não precifica e não agenda |
| **Bianca** | Terapias e experiência sensorial | Esclarece terapias, duração, sensação e adequação | Não fala preço, Day Spa, convênios, voucher ou agenda |
| **Fabricia** | Day Spa, estrutura e regras operacionais | Explica modalidades, composição e funcionamento da unidade | Não fala preço e usa a pergunta de ponte antes de mover um assunto misto |
| **Estela** | Preços, promoções e condições comerciais | Consulta a fonte de preços e apresenta valores factuais | Não cria valores nem interpreta benefícios terapêuticos |
| **Carol** | Preparação de agendamento | Coleta dados e produz uma solicitação estruturada para a recepção confirmar disponibilidade | Não confirma agenda, não cobra e não explica serviços |
| **Diana** | Voucher e intenção de compra | Explica regras, coleta dados de compra e entrega pedido pronto para emissão/pagamento humano | Não emite, não cobra e não informa preço |

## Contrato de conversa

Todos os agentes devem retornar o mesmo envelope: `message`, `status`, `summary` e `variables`. O CRM deve validar esse retorno com um schema JSON no servidor, em vez de confiar no texto livre do modelo. A equipe de recepção deve ver uma versão legível da sugestão, o status interpretado e as variáveis que mudaram; o cliente nunca deve receber o JSON bruto.

> **Handoff invisível:** quando o `status` for o identificador de outro agente, `message` deve ser uma string vazia. O sistema troca o contexto internamente e chama o próximo agente, sem informar que houve transferência.

Os status se dividem em quatro classes:

| Classe | Status | Efeito no CRM |
|---|---|---|
| Continuidade | `in_process` | Exibe sugestão e mantém o agente atual no estado da conversa |
| Encerramento | `success` | Cria uma tarefa ou resumo para a recepção; em Carol e Diana, é uma solicitação pronta para ação humana |
| Escalonamento | `failure` | Não automatiza o envio; destaca a conversa para atendimento humano |
| Roteamento | `aurea`, `bianca`, `fabricia`, `estela`, `carol`, `diana` | Troca silenciosamente o especialista e preserva contexto/variáveis |

Há ainda ações de conteúdo, que **não devem ser tratadas como agentes**: `enviar_resumo_dayspa`, envio de vídeo de terapia, envio de modelo de voucher e envio de tabela. Elas precisam ser eventos próprios, com uma trava por conversa para impedir duplicidade.

## Fluxo que o CRM deve executar

1. Uma mensagem recebida inicia ou retoma o estado da conversa. O sistema identifica a unidade e lê o agente atual; para uma conversa nova, começa por **Aurea**.
2. O servidor compõe o contexto: últimas mensagens, resumo, variáveis persistidas, contadores, ações já enviadas e prompt ativo **daquela unidade**.
3. O modelo retorna JSON. O servidor valida o formato, mescla somente as variáveis permitidas e registra a execução.
4. Se houver uma ação de mídia/conteúdo, ela é preparada uma única vez e fica visível para aprovação da recepção junto com a mensagem.
5. Se o status for um handoff, o servidor chama o próximo especialista sem mostrar mensagem de transição. O ciclo termina quando houver uma sugestão para o cliente, `success` ou `failure`.
6. Em modo assistido, a recepção aprova, reprova ou edita a sugestão. A avaliação alimenta métricas por agente, prompt, unidade e período. Em modo automático, somente os agentes e condições explicitamente habilitados poderão enviar.

## Regras de negócio importantes capturadas

**Aurea aplica uma ordem de resolução para intenção mista:** explicação, preço, voucher e por último agendamento. Assim, uma mensagem como “quanto custa o Day Spa e tem horário amanhã?” não pode saltar para Carol antes de o preço ser tratado.

**Fabricia possui uma exceção deliberada:** em assuntos mistos, ela explica a parte de Day Spa e faz a pergunta de ponte. O próximo agente só entra após a resposta do cliente. Portanto, o estado precisa registrar uma `proxima_rota_sugerida` pendente; não basta procurar palavras-chave na mensagem seguinte.

**Carol e Diana são coletores transacionais.** O `success` delas significa “dados revisados e prontos para a recepção”, e não “agendamento confirmado” ou “voucher emitido”. O painel deve criar uma tarefa operacional com o `resumo_handoff` e os campos estruturados.

**Estela depende de uma fonte oficial de preço.** O CSV citado não deve permanecer embutido no prompt. A implementação correta é uma tabela/configuração por unidade — com importação de CSV e versão — consultada pelo servidor. Se não houver correspondência exata, o sistema deve produzir `failure`, nunca estimar um valor.

## Pontos que exigem padronização antes de ativar

| Tema | Leitura | Decisão necessária |
|---|---|---|
| Quantidade de agentes | Os documentos descrevem **seis** agentes | Confirmar que o catálogo oficial passa de cinco para seis |
| Escopo de Diana | Aurea inicialmente restringe Diana à compra decidida, mas Fabricia encaminha dúvidas de regras de voucher para Diana | Recomenda-se: Diana cuida de todas as regras de voucher; Bianca/Fabricia cuidam apenas de detalhe terapêutico/Day Spa anterior à escolha |
| Fonte de preços | Estela exige `tabela_preco.csv` e promoções atualizadas | Definir se será CSV importado, tabela manual do CRM ou leitura do Belle; campanhas precisam ter vigência e unidade |
| Unidade | Todo o conteúdo fornecido é do **Shopping Santa Úrsula** | Prompts, preços, mídias e regras devem ser versionados por unidade, sem reutilização automática no Ribeirão Shopping |
| Mídia | Vídeos, modelos de voucher, tabela e quadro de Day Spa têm regra de envio único | Cadastrar ativos e registrar `acao_enviada` por conversa para cada tipo de conteúdo |
| Dados sensíveis | Carol e Diana pedem CPF | Exibir máscara, restringir acesso por função, registrar auditoria e não encaminhar CPF ao modelo além do estritamente necessário |

## Ajuste necessário na infraestrutura já iniciada

A infraestrutura atual de copilot cobre prompts editáveis, roteamento, fila de aprovação e métricas, mas deve ser ampliada para suportar este protocolo fielmente. Em especial, o catálogo precisa passar a seis agentes, os prompts devem ser vinculados à unidade, as respostas precisam ser validadas em JSON estruturado e o estado/variáveis de cada conversa devem ser persistidos. As ações de mídia e a fonte de preços também devem existir como recursos do sistema, não como instruções textuais dentro do prompt.

## Decisões propostas

1. Adotar o catálogo oficial: **Aurea, Bianca, Fabricia, Estela, Carol e Diana**.
2. Operar inicialmente somente para **Shopping Santa Úrsula**, mantendo a configuração segregada por unidade para preparar Ribeirão Shopping.
3. Tratar os prompts recebidos como a primeira versão ativa após uma revisão técnica de consistência; nenhuma regra comercial datada deve ser ativada sem vigência confirmada.
4. Manter todo o fluxo em modo assistido até a equipe registrar volume suficiente de aprovações por agente e por versão de prompt.
