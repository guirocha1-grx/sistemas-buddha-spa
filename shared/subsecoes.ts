/**
 * Sub-seções dentro de um módulo que tem mais de uma tela (hoje só
 * Financeiro — ver os `children` de "Financeiro" em
 * DashboardLayout.tsx). Permite restringir uma conta a, por exemplo,
 * só "Comanda Recepção" dentro de Financeiro, sem liberar Contas/
 * Parâmetros/Adquirentes (2026-08-10, mesmo padrão de shared/modulos.ts
 * um nível abaixo). Chave sempre "modulo:subsecao".
 */
export const SUBSECOES: Record<string, { chave: string; label: string }[]> = {
  financeiro: [
    { chave: "financeiro:visao-geral", label: "Visão Geral" },
    { chave: "financeiro:contas", label: "Contas" },
    { chave: "financeiro:comanda-recepcao", label: "Comanda Recepção" },
    { chave: "financeiro:adquirentes", label: "Adquirentes" },
    { chave: "financeiro:parametros", label: "Parâmetros" },
  ],
};
