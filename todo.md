# Sistemas Buddha Spa CRM — TODO

## Infraestrutura Base
- [x] Schema do banco de dados (unidades, leads, reativacao_kanban, metas, laminas, configuracoes)
- [x] Configurar tema visual elegante e sofisticado (dourado/bordô/cream)
- [x] Layout principal com sidebar e identificação de unidades

## Integração Belle Software API
- [x] Camada server-side de integração com Belle API (client HTTP com rate limit 40 req/min)
- [x] Endpoint proxy: GET /clientes (listar com paginação)
- [x] Endpoint proxy: GET /cliente/buscar (busca por CPF, email, celular, ID)
- [x] Endpoint proxy: GET /cliente/planos (planos do cliente)
- [x] Endpoint proxy: PUT /cliente (atualizar cliente)
- [x] Endpoint proxy: POST /cliente/gravar-lead (enviar leads)
- [x] Endpoint proxy: GET /agendamentos (sincronização de agenda)
- [x] Endpoint proxy: GET /servicos (catálogo de serviços)
- [x] Endpoint proxy: GET /planos (planos disponíveis)
- [x] Endpoint proxy: GET /relatorios/vendas (relatório de vendas)
- [x] Endpoint proxy: GET /financeiro/recebimentos (recebimentos)
- [x] Configuração de token Belle por unidade (armazenado em DB)

## Dashboard Principal
- [x] Visão consolidada das 2 unidades
- [x] KPIs: faturamento, agendamentos do dia, clientes ativos
- [x] Comparativo entre unidades
- [ ] Gráficos de tendência

## Módulo de Clientes
- [x] Listagem de clientes com filtros (busca por CPF, celular, email)
- [x] Perfil detalhado do cliente (dados do Belle)
- [x] Histórico de compras
- [x] Planos ativos e saldo de sessões
- [x] Tags e temperatura do cliente

## Kanban de Reativação
- [x] Segmentação por temperatura (Quente, Morno, Frio)
- [x] Filtro por data de última presença
- [x] Alimentação automática via API Belle
- [ ] Cards arrastáveis entre colunas
- [ ] Ações de reativação por cliente

## Módulos Financeiros
- [x] DRE simplificado por unidade
- [x] Fluxo de caixa (recebimentos vs saídas)
- [x] Metas por unidade
- [ ] Comparativo de faturamento entre unidades

## Copilot de Atendimento
- [x] Interface de chat com IA
- [x] Consulta de dados do cliente em tempo real via Belle API
- [ ] Sugestões de respostas e próximas ações
- [x] Contexto de atendimento por unidade

## Gerador de Lâminas
- [x] Templates de imagens para campanhas
- [x] Personalização por unidade
- [ ] Upload de imagens geradas

## Captura de Leads
- [x] Formulário de captura de leads
- [x] Envio automático para Belle via POST /cliente/gravar-lead
- [x] Confirmação de recebimento

## Testes
- [ ] Testes unitários (vitest)
- [ ] Testes de integração da API Belle
