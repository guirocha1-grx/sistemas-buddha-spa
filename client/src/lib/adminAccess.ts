export const ROTAS_ADMINISTRATIVAS = ["/agentes", "/configuracoes"] as const;

export function podeAcessarRotaAdministrativa(rota: string, role: string | null | undefined): boolean {
  return !ROTAS_ADMINISTRATIVAS.includes(rota as (typeof ROTAS_ADMINISTRATIVAS)[number]) || role === "admin";
}
