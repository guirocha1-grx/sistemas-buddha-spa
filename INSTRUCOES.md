# Sistemas Buddha Spa — CRM Interno

Sistema de gestão interno para as unidades **Shopping Santa Úrsula** e **Ribeirão Shopping** do Buddha Spa, com integração total à API do Belle Software como fonte de verdade.

---

## Visão Geral

O Sistemas Buddha Spa é um CRM interno que centraliza operações, dados financeiros, atendimento e marketing em uma única plataforma. O Belle Software permanece como **fonte de verdade** para clientes, agendamentos, planos e dados financeiros. O sistema complementa o Belle com módulos que ele não oferece: Inbox WhatsApp, Copilot com IA, Kanban de vendas, lâminas de divulgação e reativação de clientes.

**Domínio de produção:** `buddhaspa-4g2wufs4.manus.space`

**Repositório:** `https://github.com/guirocha1-grx/sistemas-buddha-spa`

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Tailwind CSS 4 + shadcn/ui + wouter |
| Backend | Express 4 + tRPC 11 + Drizzle ORM |
| Banco de dados | MySQL (TiDB) |
| Autenticação | Manus OAuth |
| IA | Manus Forge LLM (invokeLLM) |
| Geração de imagens | Manus Forge Image Generation |
| WhatsApp | Z-API (integração via API REST) |
| API externa | Belle Software (Integração Externa v1.0) |

---

## Unidades

| Unidade | codEstab | Email master |
|---|---|---|
| Shopping Santa Úrsula | (a definir pelo Belle) | `adm.shoppingsantaursula@buddhaspa.com.br` |
| Ribeirão Shopping | (a definir pelo Belle) | `adm.ribeiraooshopping@buddhaspa.com.br` |

As unidades são cadastradas na tabela `unidades` do banco e gerenciadas via tela de Configurações.

---

## Variáveis de Ambiente

### Variáveis de sistema (injetadas automaticamente pelo Manus)

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | String de conexão MySQL/TiDB |
| `JWT_SECRET` | Secret para assinatura de cookies de sessão |
| `VITE_APP_ID` | ID da aplicação Manus OAuth |
| `OAUTH_SERVER_URL` | URL do servidor OAuth Manus |
| `VITE_OAUTH_PORTAL_URL` | URL do portal de login Manus |
| `OWNER_OPEN_ID` | Open ID do proprietário |
| `OWNER_NAME` | Nome do proprietário |
| `BUILT_IN_FORGE_API_URL` | URL da API Forge (LLM, imagens, etc.) |
| `BUILT_IN_FORGE_API_KEY` | Bearer token para API Forge (server-side) |
| `VITE_FRONTEND_FORGE_API_KEY` | Bearer token para API Forge (frontend) |
| `VITE_FRONTEND_FORGE_API_URL` | URL da API Forge (frontend) |
| `VITE_ANALYTICS_ENDPOINT` | Endpoint de analytics |
| `VITE_ANALYTICS_WEBSITE_ID` | ID do site no analytics |
| `VITE_APP_TITLE` | Título da aplicação |
| `VITE_APP_LOGO` | URL do logo |

### Variáveis que precisam ser configuradas

| Variável | Descrição | Onde obter |
|---|---|---|
| `ZAPI_INSTANCE_ID` | ID da instância no Z-API | Painel z-api.io |
| `ZAPI_TOKEN` | Token da instância Z-API | Painel z-api.io |
| `ZAPI_CLIENT_TOKEN` | Client token Z-API (para webhooks) | Painel z-api.io |
| `BELLE_DEFAULT_TOKEN` | Token fallback do Belle (opcional) | Suporte Belle Software |

Os tokens do Belle por unidade **não** são variáveis de ambiente — são armazenados no banco de dados na tabela `unidades` (campo `belleToken`) e gerenciados via tela de Configurações.

---

## Integração com Belle Software

### Base URL

```
https://app.bellesoftware.com.br/api/release/controller/IntegraçãoExterna/v1.0
```

### Autenticação

Header `Authorization` com o token da unidade. Cada unidade tem seu próprio token, obtido via suporte do Belle Software.

### Rate Limit

O Belle impõe um limite de **40 requisições por minuto**. O sistema respeita isso com um rate limiter de 1.5 segundos entre requisições (`server/belleApi.ts`).

### Endpoints mapeados

| Endpoint Belle | Método | Uso no sistema |
|---|---|---|
| `/clientes` | GET | Listar clientes com paginação e filtros |
| `/cliente/buscar` | GET | Buscar cliente por CPF, email, celular ou ID |
| `/cliente/planos` | GET | Listar planos e saldo de sessões do cliente |
| `/cliente` | PUT | Atualizar dados do cliente |
| `/cliente/gravar-lead` | POST | Enviar leads capturados para o Belle |
| `/agendamentos` | GET | Listar agendamentos por período |
| `/servicos` | GET | Catálogo de serviços da unidade |
| `/planos` | GET | Planos disponíveis da unidade |
| `/relatorios/vendas` | GET | Relatório de vendas por período |
| `/financeiro/recebimentos` | GET | Recebimentos financeiros por período |

---

## Módulos do Sistema

### 1. Dashboard Consolidado

Visão geral das duas unidades lado a lado com KPIs de faturamento, agendamentos do dia e clientes ativos. Gráfico comparativo de faturamento entre unidades. Dados vindos em tempo real do Belle.

### 2. Inbox WhatsApp

Central de conversas WhatsApp integrado via Z-API. Lista de conversas com busca, contador de não lidas, envio de mensagens de texto, auto-refresh a cada 5 segundos. Requer configuração prévia do Z-API.

**Como ativar:**
1. Criar conta no [z-api.io](https://z-api.io)
2. Criar uma instância e escanear QR code
3. Copiar `Instance ID`, `Token` e `Client Token`
4. Inserir via tela de Configurações ou variáveis de ambiente

### 3. Clientes

Listagem e busca de clientes (por CPF, celular ou email). Cada cliente tem perfil detalhado com 4 abas:
- **Perfil:** dados cadastrais locais + dados do Belle (código, rating, temperatura, tags, última presença)
- **Planos & Sessões:** planos ativos e saldo de sessões vindos do Belle
- **Histórico:** histórico de compras do cliente no Belle
- **Atendimentos:** atendimentos registrados localmente no sistema

### 4. Kanban de Reativação

Kanban segmentado por temperatura (Quente, Morno, Frio) alimentado automaticamente pela API do Belle. Cards arrastáveis entre colunas com ações de reativação (Ligar, WhatsApp, Agendar).

### 5. Kanban de Vendas (Persistente)

Kanban de vendas com drag-and-drop que persiste no banco de dados. 9 fases (Contato Inicial → Perdido). Dialog para registrar motivo de perda. Alimentado por atendimentos locais.

### 6. Agenda

Lista de agendamentos do dia vindos do Belle, com filtro por período.

### 7. Financeiro

Três módulos:
- **DRE Simplificado:** receitas e despesas por unidade
- **Fluxo de Caixa:** recebimentos vs. saídas
- **Metas:** metas de faturamento, recebimento, agendamentos e novos clientes por unidade/mês

### 8. Copilot de Atendimento

Chat com IA (Manus Forge LLM) que consulta dados do cliente no Belle em tempo real e sugere respostas e próximas ações. O atendente digita o CPF do cliente, o Copilot busca no Belle e constrói um contexto com nome, planos, saldo de sessões, temperatura e tags.

### 9. Lâminas de Divulgação

Gerador de imagens para campanhas de marketing com templates personalizáveis por unidade. Usa IA de geração de imagem do Manus Forge.

### 10. Leads

Formulário de captura de leads com envio automático para o Belle via `POST /cliente/gravar-lead`. Status de envio rastreado localmente.

### 11. Configurações

Gerenciamento de tokens do Belle e Z-API por unidade. Atualização de código de estabelecimento e cor de tema.

---

## Banco de Dados

### Tabelas

| Tabela | Descrição |
|---|---|
| `users` | Usuários do sistema com roles (admin, gerente, consultor, suporte, user) |
| `unidades` | Unidades do spa (Santa Úrsula e Ribeirão Shopping) |
| `configuracoes` | Configurações gerais chave-valor |
| `tipo_classificacao` | Tipos de classificação (lookup) |
| `fase_venda` | Fases do Kanban de vendas (lookup) |
| `clientes` | Clientes locais (complementar ao Belle) |
| `atendimentos` | Atendimentos registrados localmente |
| `scripts` | Scripts de atendimento por categoria |
| `scripts_uso` | Registro de uso de scripts |
| `tarefas_dia` | Tarefas diárias por usuário |
| `inbox_conversas` | Conversas do WhatsApp |
| `inbox_mensagens` | Mensagens das conversas |
| `alertas_qualificacao` | Alertas de qualificação de leads |
| `audit_log` | Log de auditoria do sistema |
| `leads` | Leads capturados e enviados ao Belle |
| `metas` | Metas financeiras por unidade/mês/ano |
| `laminas` | Lâminas de divulgação geradas |
| `sync_logs` | Logs de sincronização com o Belle |
| `copilot_conversas` | Conversas do Copilot com IA |

### Schema

O schema é gerenciado via Drizzle ORM (`drizzle/schema.ts`). Para aplicar mudanças:

```bash
pnpm drizzle-kit generate   # Gera SQL de migração
# Aplicar o SQL gerado via webdev_execute_sql
```

---

## Estrutura de Arquivos

```
sistemas-buddha-spa/
├── client/                     # Frontend
│   ├── src/
│   │   ├── pages/              # Páginas do sistema
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Inbox.tsx
│   │   │   ├── Clientes.tsx
│   │   │   ├── ClienteDetalhe.tsx
│   │   │   ├── Reativacao.tsx
│   │   │   ├── KanbanPersistente.tsx
│   │   │   ├── Agenda.tsx
│   │   │   ├── Financeiro.tsx
│   │   │   ├── Copilot.tsx
│   │   │   ├── Laminas.tsx
│   │   │   ├── Leads.tsx
│   │   │   └── Configuracoes.tsx
│   │   ├── components/         # Componentes reutilizáveis
│   │   ├── contexts/           # Contextos (Tema, Unidade)
│   │   └── lib/trpc.ts         # Cliente tRPC
│   └── index.html
├── server/                     # Backend
│   ├── _core/                  # Framework Manus (não editar)
│   ├── belleApi.ts             # Camada de integração Belle Software
│   ├── zapi.ts                 # Camada de integração Z-API (WhatsApp)
│   ├── db.ts                   # Query helpers (Drizzle)
│   ├── routers.ts              # Routers tRPC (todos os endpoints)
│   ├── storage.ts              # Helpers de S3
│   └── auth.logout.test.ts     # Teste de exemplo
├── drizzle/                    # Schema e migrações
│   └── schema.ts               # Definição de tabelas
├── shared/                     # Constantes e tipos compartilhados
├── package.json
└── drizzle.config.ts
```

---

## Desenvolvimento

### Pré-requisitos

- Node.js 22+
- pnpm 10+
- Acesso ao projeto no Manus WebDev

### Comandos

```bash
pnpm dev          # Servidor de desenvolvimento
pnpm build        # Build de produção
pnpm test         # Rodar testes (vitest)
pnpm drizzle-kit generate  # Gerar migração de schema
```

### Testes

O projeto tem 9 testes vitest passando cobrindo autenticação e unidades. Para adicionar testes:

```bash
# Criar arquivo server/*.test.ts
# Usar o padrão em server/auth.logout.test.ts como referência
pnpm test
```

---

## Setup Inicial (Checklist)

1. **Configurar tokens do Belle por unidade**
   - Acessar tela de Configurações
   - Inserir `belleToken` e `codEstab` para cada unidade
   - Os tokens são obtidos via solicitação ao suporte do Belle Software

2. **Configurar Z-API (WhatsApp)**
   - Criar conta no z-api.io
   - Criar instância e escanear QR code
   - Inserir `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN` via variáveis de ambiente ou Configurações

3. **Configurar webhook do Z-API**
   - Apontar webhook do Z-API para `/api/zapi/webhook` (endpoint a ser implementado)
   - Isso permite receber mensagens automaticamente no Inbox

4. **Sincronização inicial de clientes**
   - Executar importação de clientes do Belle para a tabela local `clientes`
   - Isso habilita o ClienteDetalhe sem depender de busca por CPF em toda consulta

5. **Promover usuário a admin**
   - O primeiro usuário que loga via Manus OAuth é automaticamente admin se for o `OWNER_OPEN_ID`
   - Para promover outros usuários, atualizar o campo `role` na tabela `users`

---

## Contatos

| Role | Nome | Email |
|---|---|---|
| Responsável | Guilherme Rocha | — |
| Unidade Santa Úrsula | Administração | `adm.shoppingsantaursula@buddhaspa.com.br` |
| Unidade Ribeirão Shopping | Administração | `adm.ribeiraooshopping@buddhaspa.com.br` |

---

## Notas Técnicas

- O Belle Software é a **fonte de verdade** para clientes, agendamentos, planos e dados financeiros. O sistema nunca sobrescreve dados do Belle sem intenção explícita.
- O rate limit de 40 req/min do Belle é respeitado globalmente via rate limiter no `belleApi.ts`.
- O Kanban de Reativação faz até 5 páginas de chamadas ao Belle (500 clientes) por consulta. Em produção com muitos clientes, considere paginar ou cachear.
- O Copilot usa o LLM do Manus Forge (`invokeLLM`). O modelo pode ser configurado no `server/_core/llm.ts`.
- As lâminas usam a API de geração de imagem do Manus Forge (`server/_core/imageGeneration.ts`).
- O sistema não tem sincronização automática (cron) ainda. Todas as chamadas ao Belle são on-demand.
