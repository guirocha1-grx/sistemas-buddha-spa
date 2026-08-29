/**
 * Sub-seções dentro de um módulo que tem mais de uma tela (por exemplo,
 * Financeiro e Terapeutas — ver os `children` no
 * DashboardLayout.tsx). Permite restringir uma conta a, por exemplo,
 * só "Comanda Recepção" dentro de Financeiro, sem liberar Contas/
 * Parâmetros/Adquirentes (2026-08-10, mesmo padrão de shared/modulos.ts
 * um nível abaixo). Chave sempre "modulo:subsecao".
 */
export const SUBSECOES: Record<string, { chave: string; label: string }[]> = {
  agenda: [
    { chave: "agenda:agenda", label: "Agenda" },
    { chave: "agenda:proximos-atendimentos", label: "Próximos atendimentos" },
  ],
  terapeutas: [
    { chave: "terapeutas:fidelizacao", label: "Fidelização" },
    { chave: "terapeutas:liberacoes", label: "Liberações de terapia" },
    { chave: "terapeutas:preferenciais", label: "Preferenciais" },
    { chave: "terapeutas:fechamento", label: "Fechamento de agenda" },
    { chave: "terapeutas:tempos", label: "Tempo de atendimento" },
  ],
  tabela_precos: [
    { chave: "tabela_precos:campanha_mes", label: "Gerenciar Campanha do Mês" },
  ],
  financeiro: [
    { chave: "financeiro:visao-geral", label: "Visão Geral" },
    { chave: "financeiro:contas", label: "Contas" },
    { chave: "financeiro:comanda-recepcao", label: "Conciliação PDV — Fase 1 (Comanda x Caixa)" },
    { chave: "financeiro:comanda-recepcao-belle", label: "Conciliação PDV — Fase 2 (Comanda x Belle)" },
    { chave: "financeiro:confirmacao-pagamento", label: "Confirmação de Pagamento" },
    { chave: "financeiro:adquirentes", label: "Adquirentes" },
    { chave: "financeiro:transacoes-entre-unidades", label: "Transações entre Unidades" },
    { chave: "financeiro:parametros", label: "Parâmetros" },
  ],
};
