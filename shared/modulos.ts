/**
 * Lista canônica dos módulos gerenciáveis por controle de acesso
 * (2026-08-10) — mesma fonte usada pelo filtro de menu no client
 * (DashboardLayout.tsx) e pela tela de administração (Usuarios.tsx),
 * pra nunca desalinhar. Configurações É um módulo gerenciável (guarda
 * credenciais sensíveis das unidades); só Log de Auditoria fica de
 * fora (já é admin-only por outro caminho).
 *
 * "dashboard" (2026-08-13, a pedido do usuário: "não faz sentido
 * aparecer pra recepção") era a página de pouso sempre acessível até
 * aqui — agora é opt-in como qualquer outro módulo. Conta restrita sem
 * "dashboard" marcado é redirecionada pro primeiro módulo liberado ao
 * cair em "/" (ver DashboardLayout.tsx). Todo módulo criado antes
 * dessa mudança, com "restrito" já ligado, nunca teve "dashboard"
 * marcado (não existia essa opção) — o efeito colateral esperado é
 * que toda conta já restrita perde a Dashboard também, não só a nova.
 */
export const MODULOS = [
  { chave: "dashboard", label: "Dashboard" },
  { chave: "clientes", label: "Clientes" },
  { chave: "reativacao", label: "Reativação" },
  { chave: "agenda", label: "Agenda" },
  { chave: "mensagens", label: "Mensagens (Inbox)" },
  { chave: "scripts", label: "Scripts" },
  { chave: "financeiro", label: "Financeiro" },
  { chave: "copilot", label: "Copilot" },
  { chave: "laminas", label: "Lâminas" },
  { chave: "leads", label: "Leads" },
  { chave: "fluxos", label: "Fluxos" },
  { chave: "configuracoes", label: "Configurações" },
  { chave: "sincronizacao", label: "Sincronização Global" },
] as const;

export type ModuloChave = (typeof MODULOS)[number]["chave"];

export const MODULOS_CHAVES = MODULOS.map((m) => m.chave) as ModuloChave[];
