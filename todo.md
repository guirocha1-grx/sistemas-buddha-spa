# Project TODO

- [x] Definir os cinco agentes cadastráveis, seus papéis e permissões operacionais.
- [x] Criar tabelas para agentes, prompts versionados, execuções, sugestões e avaliações humanas.
- [x] Implementar procedimentos protegidos para configurar agentes, editar prompts e consultar histórico.
- [x] Implementar o fluxo de classificação do agente receptor e encaminhamento ao especialista escolhido.
- [x] Implementar o fluxo de geração de sugestões e o envio condicionado ao modo assistido ou automático.
- [x] Criar a fila de sugestões para a recepção com contexto, agente responsável, aprovação, reprovação e comentário.
- [x] Criar a aba Configurações > Prompts de Agentes com editor, versão ativa, histórico e modo de operação.
- [x] Criar painel de métricas de qualidade por agente, período e decisão humana.
- [x] Aplicar controle de acesso e trilha de auditoria para alterações de prompts e modos de operação.
- [x] Definir a direção visual do módulo antes de finalizar o design da interface.
- [x] Escrever e executar testes unitários para os fluxos de agentes e avaliações.
- [ ] Verificar a interface em desktop e mobile, revisar o TODO e salvar um checkpoint da primeira versão.
- [x] Configurar o fluxo inicial como copilot síncrono no recebimento, com modo automático desabilitado por padrão em todos os agentes.
- [x] Aplicar a identidade visual atual do Buddha Spa nas telas de sugestões, configurações e métricas dos agentes.

## Módulo de Agentes de IA

- [x] Modelar e implementar a infraestrutura de atendimento copilot por cinco agentes com prompts editáveis, roteamento, fila de sugestões, avaliação humana, métricas e modos assistido/automático. Escopo substituído pelo catálogo de seis agentes.
- [x] Adicionar filtros de período e visão temporal de aprovação e reprovação por agente no painel de métricas.
- [x] Criar testes Vitest de roteamento, geração de sugestão, aprovação, reprovação e modo automático.
- [ ] Aplicar o schema base do CRM no banco de desenvolvimento para executar a suíte completa de testes sem tabelas ausentes.
- [ ] Executar validação end-to-end no banco completo: recebimento, roteamento, sugestão, avaliação e envio manual ou automático.
- [x] Evoluir o catálogo de cinco para seis agentes: Aurea, Bianca, Fabricia, Estela, Carol e Diana.
- [x] Persistir estado estruturado da conversa, variáveis oficiais e histórico de handoff por unidade.
- [x] Validar respostas dos agentes em JSON e traduzir status de negócio em roteamento, fila, sucesso, falha e ações de mídia.
- [ ] Configurar prompts e bases de conhecimento específicos por unidade, começando por Shopping Santa Úrsula. Escopo adaptado para Ribeirão Shopping.
- [ ] Implementar controles de ação única para vídeos, modelos de voucher, tabelas e resumo de Day Spa.
- [x] Alterar o escopo inicial da operação de agentes para Ribeirão Shopping, preservando configuração segregada por unidade.
- [x] Revisar a arquitetura conversacional de seis agentes e registrar as melhorias recomendadas antes da adaptação dos prompts.
- [x] Implementar o orquestrador híbrido: regras determinísticas, estado de conversa e chamadas de IA somente para classificação ambígua e redação especializada.
- [x] Cadastrar e ativar as seis versões iniciais de prompt para Ribeirão Shopping, após revisão do conteúdo específico da unidade.
- [ ] Cadastrar fontes oficiais de Ribeirão Shopping — preços, promoções, mídias e conteúdos vigentes — e validar sua entrega ao orquestrador.
- [x] Exibir por agente nome, especialidade, ativação individual e autorização explícita de automação na configuração da unidade.
- [ ] Garantir que agentes ativos sem automação produzam apenas sugestões para o consultor da conversa, sem envio ao cliente.
- [x] Manter todos os controles de automação desligados por padrão até autorização administrativa expressa.
- [x] Adaptar os seis prompts-base para Ribeirão Shopping, mantendo fatos específicos em fontes configuráveis.
- [ ] Normalizar a tabela de preços recebida como catálogo oficial da unidade Ribeirão Shopping.
- [x] Criar a subseção Tabela para pesquisa manual de serviços, categorias, duração e valores de semana/domingo.
- [ ] Confirmar os valores ausentes da tabela para Banho de Imersão Casal e Banho de Imersão Casal 30 antes de cadastrá-los como preços oficiais.
- [x] Cadastrar os prompts-base versionados para Ribeirão Shopping, mantendo os seis assistentes desativados até autorização manual.
- [ ] Cadastrar e validar as fontes oficiais restantes de Ribeirão Shopping — promoções, mídias, conteúdos e regras vigentes.
