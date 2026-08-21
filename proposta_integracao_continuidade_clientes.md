# Proposta de Reestruturação — Planos, Atendimentos e Integrações de Dados

**Unidade-piloto:** Ribeirão Shopping (RBS)  
**Status:** estudo para aprovação; **nenhuma mudança adicional deve ser implementada a partir desta proposta sem validação prévia**.  
**Data:** 20 de agosto de 2026  
**Autor:** Manus AI

## Conclusão executiva

Os relatórios de **Planos & Sessões** e **Atendimentos** permitem transformar a Carol de uma agente que apenas coleta disponibilidade em uma camada de continuidade de relacionamento. Ela poderá reconhecer, com cautela, se o cliente possui plano válido, quais sessões ainda restam, qual foi o último serviço realizado e quem foi o profissional recente. Isso melhora a qualidade do agendamento, mas não substitui a confirmação humana de agenda.

O ponto central é separar três conceitos: o **registro de origem**, que preserva o ID do relatório Belle; a **chave de correlação operacional**, formada por unidade e nome normalizado; e o **vínculo confirmado**, que aponta para o cadastro local do cliente. O nome é uma chave forte entre relatórios, mas não deve ser a chave primária do banco, pois há nomes duplicados no cadastro local do RBS.[1]

| Decisão | Proposta |
|---|---|
| Unidade inicial | Ribeirão Shopping, já com relatórios importados |
| Frequência inicial | Importação manual semanal, em uma tela única e auditável |
| Chave entre relatórios | `unidade + nome normalizado` para correlacionar; nunca o nome bruto como chave primária |
| Registros ambíguos | Não vincular automaticamente; enviar para fila de revisão |
| Uso pela Carol | Referência de plano, saldo e última experiência; nunca confirmação de horário |
| Copilot atual | Retirar do fluxo operacional da recepção, mas não apagar antes de uma transição controlada |

## 1. Evidências da base já espelhada

O RBS possui, no recorte importado, **396 cabeçalhos de plano**, **1.319 linhas de serviços de plano** e **449 atendimentos**. A vinculação já é suficiente para uma primeira versão de consulta, mas ainda não é cobertura integral.[1]

| Fonte | Registros | Vinculados ao cliente local | Pendentes | Cobertura atual |
|---|---:|---:|---:|---:|
| Planos | 396 | 332 | 64 | 83,84% |
| Serviços de planos | 1.319 | 1.136 | 183 | 86,13% |
| Atendimentos | 449 | 245 | 204 | 54,57% |

Há **15 nomes normalizados** com mais de um cadastro local elegível no RBS. Isso confirma que o nome é um excelente elo entre os relatórios, mas não é suficiente sozinho para decidir qual cadastro local deve receber o histórico.[1]

> **Regra proposta:** o relatório mantém seus próprios IDs externos (`planoBelleId` e `atendimentoBelleId`). O nome normalizado só encontra um candidato; a associação final exige que haja um único candidato na unidade ou uma decisão manual registrada.

## 2. Consulta operacional no perfil do cliente

A recepção precisa consultar o perfil sem abrir o Belle. A proposta é transformar o perfil em uma consulta operacional curta, com a informação decisiva acima da dobra e o histórico completo abaixo.

| Área do perfil | Conteúdo proposto | Uso da recepção |
|---|---|---|
| **Resumo operacional** | Data da última utilização, dias desde a visita, planos válidos, sessões restantes e próxima sessão já agendada | Responder rapidamente se há plano e qual é a situação atual |
| **Planos & Sessões** | Um cartão por plano: validade, status, última utilização daquele plano e saldo por serviço | Confirmar o que o cliente ainda pode utilizar |
| **Últimos atendimentos** | Data, horário, serviço, profissional, status e vínculo com plano quando houver | Entender preferência e continuidade da experiência |
| **Preferências** | Profissional preferido confirmado, observações permitidas e última experiência | Personalizar o convite sem pressupor uma escolha |

No bloco de cada plano, a primeira linha deve ser **“Última utilização: DD/MM/AAAA”**. Esse dado será calculado pelo atendimento mais recente com o mesmo `planoBelleId`, não apenas pela última visita geral do cliente. Em seguida, cada serviço mostra sessões totais, restantes e já agendadas.

Exemplo de leitura operacional:

> **Plano ativo até 31/10/2026** · Última utilização: **14/08/2026**  
> Massagem Relaxante 60 min: **3 sessões restantes** · 1 agendada  
> Último atendimento: 14/08/2026 · Massagem Relaxante 60 min · Profissional: Ana

## 3. Estratégia de vínculo por nome

O nome preservado nos relatórios é útil porque tende a permanecer igual em cada exportação. A estratégia proposta respeita essa vantagem sem transformar um dado humano em uma chave técnica definitiva.

| Camada | Chave | Finalidade |
|---|---|---|
| Registro de origem | `unidadeId + planoBelleId` ou `unidadeId + atendimentoBelleId` | Reimportar sem duplicar e preservar rastreabilidade Belle |
| Correlação entre relatórios | `unidadeId + nome normalizado` | Agrupar planos e atendimentos da mesma pessoa no mesmo relatório |
| Vínculo ao CRM | `clienteId` após correspondência única ou revisão humana | Exibir no perfil e oferecer contexto à Carol |
| Exceção | Fila de vínculos pendentes | Resolver homônimos, nomes ausentes ou divergências sem risco |

A normalização deve ser limitada a caixa, espaços e acentuação para comparação; o **nome original nunca deve ser substituído**. Quando houver dois ou mais clientes locais com o mesmo nome normalizado, o sistema não deve escolher por conta própria. A tela de integração deve mostrar os candidatos e permitir a confirmação por telefone, CPF, data de nascimento ou identificação da recepção.

## 4. Tela única de Integrações de Dados

A operação semanal deve ficar centralizada em uma página administrativa chamada **Integrações de Dados**, separada das telas de Clientes e do Inbox. A intenção é que a equipe saiba o que entrou, de qual unidade, em que data e com qual qualidade de vínculo.

| Bloco da tela | Função | Resultado esperado |
|---|---|---|
| Unidade e período | Selecionar RBS/SSU e a semana de referência | Evitar importar arquivo de uma unidade na outra |
| Base de clientes | Receber o relatório mestre de clientes primeiro | Atualizar cadastros e ampliar candidatos de vínculo |
| Planos & Sessões | Receber o export de planos | Prévia de planos, serviços, validade e saldo |
| Atendimentos | Receber o export de atendimentos | Prévia de sessões, serviços, profissional e datas |
| Validação | Mostrar totais, duplicidades, novos registros e pendentes | Aprovação consciente antes da publicação |
| Fila de vínculos | Resolver homônimos e registros sem cliente correspondente | Aumentar cobertura sem associação errada |
| Histórico de importações | Arquivo, data, operador, unidade, resumo e erros | Auditoria e reprocessamento seguro |

O fluxo semanal recomendado é: **1. Clientes → 2. Planos → 3. Atendimentos → 4. Revisar pendências → 5. Publicar**. Cada importação deve ser idempotente: reenviar o mesmo relatório atualiza os registros de mesma chave externa, sem criar duplicidades.

## 5. Como a Carol deve usar esses dados

A Carol deve receber somente dados confirmados e resumidos. O objetivo é tornar o agendamento mais natural, não automatizar decisão clínica, disponibilidade ou escolha do cliente.

| Situação | Uso permitido pela Carol | Limite obrigatório |
|---|---|---|
| Cliente quer agendar e há plano ativo | Informar que há sessões e perguntar se deseja usar uma delas | Não prometer vaga nem escolher serviço sem confirmação |
| Última terapia identificada | Sugerir repetir a experiência como opção | Não presumir que a preferência continua válida |
| Profissional recente/preferido | Perguntar se deseja consultar o mesmo profissional | Não afirmar disponibilidade do profissional |
| Plano vencido ou saldo zero | Não oferecer saldo como disponível | Orientar a recepção a verificar a situação quando necessário |
| Registro sem vínculo seguro | Não usar como contexto do cliente | Manter apenas na fila administrativa de revisão |

A primeira versão deve evitar uma “memória livre” de preferências. **Profissional preferido** deve ser um campo confirmado pela recepção ou um sinal explícito vindo do relatório; o último profissional atendido é apenas uma referência, não preferência automática.

## 6. Avaliação do Copilot atual

O Copilot atual é uma tela de chat independente, pesquisada por CPF, que monta uma resposta genérica. Ele não está ligado à conversa real de WhatsApp, não compartilha o cartão de aprovação, não usa a fila de Scripts/Fluxos, não recebe o histórico operacional do Inbox e ainda tenta consultar diretamente o Belle quando há token disponível.[2]

Para a **recepção**, ele perdeu a maior parte da função prática: o Inbox com Áurea, especialistas, Scripts, fluxos, aprovação humana e contexto de cliente já cobre o atendimento assistido de ponta a ponta.

> **Recomendação:** não excluir agora. Remover o item **Copilot** do menu operacional da recepção e mantê-lo temporariamente como ferramenta administrativa/experimental. Após quatro semanas sem uso justificado, arquivar a rota e preservar os dados de `copilot_conversas`. Essa abordagem evita perda de histórico e permite reaproveitar a tela, mais adiante, como um painel interno de consulta de cliente ou qualidade de atendimento.

## 7. Ordem de implantação proposta

| Etapa | Entrega | Dependência | Benefício principal |
|---|---|---|---|
| 1 | Reorganizar o perfil de cliente com resumo operacional e última utilização por plano | Tabelas já espelhadas | Consulta rápida para a recepção |
| 2 | Criar a tela de Integrações de Dados com prévia e histórico de lotes | Etapa 1 | Rotina semanal confiável |
| 3 | Criar fila de vínculos pendentes por nome | Etapa 2 | Aumentar cobertura sem ligar homônimos errados |
| 4 | Alimentar a Carol com contexto confirmado de plano e atendimento | Etapas 1–3 | Agendamento mais contextualizado |
| 5 | Ocultar o Copilot do menu de recepção e acompanhar uso administrativo | Decisão aprovada | Reduzir duplicidade operacional |

## Decisões solicitadas antes de implementar

1. Aprovar a organização do perfil com **Resumo Operacional**, **Planos & Sessões**, **Últimos Atendimentos** e **Preferências**.
2. Aprovar a tela administrativa única de **Integrações de Dados**, inicialmente com operação manual semanal.
3. Confirmar se o Copilot deve ser **ocultado da recepção e mantido para administração** durante quatro semanas, em vez de ser excluído imediatamente.
4. Definir se a preferência de profissional será preenchida apenas de forma manual pela recepção ou se o campo `temPreferencia` do relatório pode ser tratado como confirmação.

## Evidências internas

[1] Auditoria do espelho local do Ribeirão Shopping realizada nesta tarefa: totais de planos, serviços, atendimentos, vínculos pendentes e nomes duplicados no cadastro local.

[2] Implementação atual do Copilot em `client/src/pages/Copilot.tsx` e `server/routers.ts`: busca por CPF, chat independente e tentativa de consulta direta ao Belle.
