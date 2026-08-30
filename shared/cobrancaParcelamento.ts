/**
 * Regras de parcelamento da Cobrança por Link — mesma lógica no client
 * (decide se mostra o modal de justificativa) e no server (valida de
 * verdade antes de criar o Link, não confia só no client).
 */
export const PARCELA_MINIMA_VALOR = 100;
export const PARCELAS_MAXIMO_PADRAO = 3;

/**
 * Fora do padrão quando parcela mais que o máximo (3x) ou quando o
 * valor de cada parcela fica abaixo do mínimo (R$100). Não bloqueia o
 * envio — só decide se a Exceção de parcelamento (motivo + autorizador)
 * é exigida antes de mandar o Link.
 */
export function parcelamentoForaDoPadrao(valor: number, parcelas: number): boolean {
  if (parcelas > PARCELAS_MAXIMO_PADRAO) return true;
  if (parcelas > 0 && valor / parcelas < PARCELA_MINIMA_VALOR) return true;
  return false;
}
