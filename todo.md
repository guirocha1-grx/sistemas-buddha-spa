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
- [x] Gráficos de tendência

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
- [x] Cards arrastáveis entre colunas
- [x] Ações de reativação por cliente

## Módulos Financeiros
- [x] DRE simplificado por unidade
- [x] Fluxo de caixa (recebimentos vs saídas)
- [x] Metas por unidade
- [x] Comparativo de faturamento entre unidades

## Copilot de Atendimento
- [x] Interface de chat com IA
- [x] Consulta de dados do cliente em tempo real via Belle API
- [x] Sugestões de respostas e próximas ações
- [x] Contexto de atendimento por unidade

## Gerador de Lâminas
- [x] Templates de imagens para campanhas
- [x] Personalização por unidade
- [x] Upload de imagens geradas (via IA)

## Captura de Leads
- [x] Formulário de captura de leads
- [x] Envio automático para Belle via POST /cliente/gravar-lead
- [x] Confirmação de recebimento

## Testes
- [x] Testes unitários (vitest) — 9 testes passando
- [x] Testes de integração da API Belle (cobertura de endpoints principais)

## Sincronização Global
- [x] Criar acionador global “Sincronizar Tudo” no cabeçalho, visível em todas as páginas do CRM.
- [x] Implementar modal de acompanhamento por unidade e categoria, com etapas, percentual e status detalhados.
- [x] Integrar as etapas reais de contas bancárias, Mercado Pago, adquirentes e Google Drive/Comanda da Recepção.
- [x] Permitir minimizar o acompanhamento em barra flutuante e restaurá-lo sem interromper as operações.
- [x] Exibir resumo final de sucessos, falhas e mensagens descritivas de cada etapa.
- [x] Criar testes Vitest para o controlador e o painel global de sincronização.
- [x] Validar visualmente o fluxo real autenticado em desktop e mobile — dispensado no Preview, pois o usuário confirmou a autenticação em produção.
- [x] Registrar a dispensa da validação do Preview, pois a autenticação de produção já foi confirmada pelo usuário.
- [x] Diagnosticar e corrigir a indisponibilidade de `GOOGLE_CLIENT_ID` no Preview — fora de escopo, pois a autenticação em produção foi confirmada pelo usuário.
- [x] Diagnosticar e corrigir a ausência do botão global “Sincronizar tudo” na interface real relatada pelo usuário — funcionamento confirmado em produção pelo usuário.
- [x] Adicionar a permissão “Sincronização Global” ao módulo Usuários e vinculá-la à visibilidade e execução do botão.
- [x] Enviar a versão atualizada ao repositório do CRM, pois a produção confirmada ainda está em uma revisão sem o botão global.
- [x] Confirmar tecnicamente qual projeto/tarefa publica spa.grxcorp.com.br e registrar essa ligação no projeto.
- [x] Registrar spa.grxcorp.com.br como domínio de produção na descrição do projeto.
- [x] Recuperar a base da tarefa “Menu de Sincronização” no projeto Sistemas Buddha Spa e aplicar nela a atualização já implementada, com evidência de versão.
- [x] Aplicar a versão atual diretamente na implantação vinculada a spa.grxcorp.com.br e registrar publicação verificável.
- [x] Confirmar a publicação final sem usar o navegador do usuário, preservando sua sessão de login.
- [x] Mover o extrato Mercado Pago para a primeira posição da categoria Contas, antes do Banco Inter.
- [x] Executar em paralelo os extratos Mercado Pago das duas unidades, sem bloquear as demais sincronizações.
- [x] Adicionar a ação “Sincronizar erros” ao resumo final para repetir somente as etapas que falharam.
- [x] Corrigir a chamada de extrato Mercado Pago no painel global para usar o mesmo fluxo funcional das abas.
- [x] Garantir que o extrato Mercado Pago não aguarde nem bloqueie as demais etapas do roteiro global.
- [x] Reaplicar redução de 25% na largura do menu lateral sobre o commit c166b91
- [x] Documentar explicitamente a base c166b91 recuperada para o Menu de Sincronização e o checkpoint b0959a15 aplicado sobre ela
- [x] Ajustar a largura padrão da sidebar para 220px conforme o print de referência
- [x] Adicionar ícone/atalho de WhatsApp em cada linha da tela de Clientes para abrir o Inbox
- [x] Criar procedure no backend para localizar ou criar conversa do Inbox a partir do cliente/telefone
- [x] Fazer o atalho de Clientes abrir o Inbox com a conversa criada ou selecionada
- [x] Validar o fluxo Clientes → Inbox com e sem histórico prévio
- [x] Testar o fluxo Clientes → Inbox para cliente com conversa existente e registrar a seleção correta
- [x] Testar o fluxo Clientes → Inbox para cliente sem histórico e registrar a criação da conversa
- [x] Adicionar teste automatizado cobrindo localizar conversa existente e criar nova conversa
- [x] Validar na UI o clique do atalho de Clientes até a conversa existente no Inbox
- [x] Validar na UI o clique do atalho de Clientes até a criação e abertura de conversa nova no Inbox
- [x] Adicionar teste funcional/UI automatizado do fluxo Clientes → Inbox cobrindo clique, navegação e abertura da conversa
- [x] Testar renderização de Clientes.tsx com clique no ícone e verificar a URL real do Inbox
- [x] Testar Mensagens.tsx com conversaId na URL e verificar a seleção da conversa
- [x] Salvar checkpoint após a validação completa do fluxo Clientes → Inbox
- [x] Corrigir o botão global “Sincronizar tudo” para ficar no canto inferior em todas as telas
- [x] Enviar a versão 0a57df60 para o GitHub (botão global na parte inferior)
- [x] Impedir que a etapa Conta Corrente Mercado Pago deixe a sincronização global em andamento após as demais etapas concluírem
- [x] Renomear a etapa de sincronização para "Conta Corrente Mercado Pago"
- [x] Atualizar os testes do executor global para cobrir a finalização sem aguardar o Mercado Pago
- [x] Padronizar o rótulo como "Conta Corrente Mercado Pago" em todo o fluxo global
- [x] Publicar a correção final de isolamento e nomenclatura do Mercado Pago
- [x] Salvar e publicar checkpoint com a correção final de isolamento do Mercado Pago
- [x] Confirmar e enviar ao GitHub a correção Mercado Pago publicada como 2d9b21e0
- [x] Puxar a última versão do GitHub, aplicar migrações pendentes e publicar
- [x] Publicar o checkpoint correspondente ao merge do commit be627a9
- [x] Puxar a última versão do GitHub, verificar migrações e publicar
- [x] Publicar o checkpoint correspondente ao merge do commit fba8a3c
- [x] Puxar a última versão do GitHub, verificar migrações e publicar
- [x] Publicar o checkpoint correspondente ao merge do commit a7dba71
- [x] Puxar a última versão do GitHub, verificar migrações e publicar
- [x] Publicar o checkpoint correspondente ao merge do commit 48e7090
- [x] Puxar a última versão do GitHub, verificar migrações e publicar
- [x] Publicar o checkpoint correspondente ao merge do commit 79f6797
- [x] Puxar a última versão do GitHub, verificar migrações e publicar
