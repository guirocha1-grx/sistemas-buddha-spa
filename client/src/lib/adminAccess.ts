export function podeAcessarRotaAdministrativa(role: string | null | undefined): boolean {
  return role === "admin";
}
