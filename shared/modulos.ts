/**
 * Lista canônica dos módulos gerenciáveis por controle de acesso
 * (2026-08-10) — mesma fonte usada pelo filtro de menu no client
 * (DashboardLayout.tsx) e pela tela de administração (Usuarios.tsx),
 * pra nunca desalinhar. Dashboard, Configurações... espera, ver nota:
 * Configurações É um módulo gerenciável (guarda credenciais sensíveis
 * das unidades); só Dashboard e Log de Auditoria (este já é admin-only
 * por outro caminho) ficam de fora — Dashboard é a página de pouso,
 * sempre acessível.
 */
export const MODULOS = [
  { chave: "clientes", label: "Clientes" },
  { chave: "reativacao", label: "Reativação" },
  { chave: "agenda", label: "Agenda" },
  { chave: "mensagens", label: "Mensagens (Inbox)" },
  { chave: "financeiro", label: "Financeiro" },
  { chave: "copilot", label: "Copilot" },
  { chave: "laminas", label: "Lâminas" },
  { chave: "leads", label: "Leads" },
  { chave: "configuracoes", label: "Configurações" },
  { chave: "sincronizacao", label: "Sincronização Global" },
] as const;

export type ModuloChave = (typeof MODULOS)[number]["chave"];

export const MODULOS_CHAVES = MODULOS.map((m) => m.chave) as ModuloChave[];
