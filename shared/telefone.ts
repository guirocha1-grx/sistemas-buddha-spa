export function normalizarTelefone(valor: string | null | undefined) {
  return (valor ?? "").replace(/\D/g, "");
}

/**
 * Só considera "55" inicial como DDI quando o comprimento total já
 * bate com número-COM-DDI (12 ou 13 dígitos: DDI+DDD+8 ou 9 dígitos).
 * Sem essa checagem de tamanho, um número de 10/11 dígitos cujo DDD é
 * literalmente 55 (Santa Maria/RS e região) tinha o "55" cortado como
 * se fosse DDI, quebrando o número (2026-08-14, bug real — nenhuma
 * variante com DDI correto era gerada pra esses clientes).
 */
function removerDDI(digitos: string): string {
  const temDDI = (digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55");
  return temDDI ? digitos.slice(2) : digitos;
}

/**
 * Remove o "0" de discagem antiga em formato "0DDXXXXXXXX" (ex.:
 * cadastro Belle com "016981735275" → DDD 16 + celular 981735275).
 * Só depois de já ter tirado o DDI — o "0" de tronco nunca convive com
 * DDI no mesmo número.
 */
function removerZeroInicialDDD(digitos: string): string {
  if ((digitos.length === 11 || digitos.length === 12) && digitos[0] === "0") {
    return digitos.slice(1);
  }
  return digitos;
}

function semDdiELimpo(digitos: string): string {
  return removerZeroInicialDDD(removerDDI(digitos));
}

/**
 * Todas as formas plausíveis de um telefone brasileiro — com/sem DDI
 * (55) e com/sem o "9" do celular. Cadastro antigo no Belle às vezes
 * guarda sem o 9 (formato pré-2012); o WhatsApp sempre manda com. Sem
 * considerar essa variante, um cliente já cadastrado não batia com o
 * número que chega no webhook e o Inbox tratava como contato novo —
 * usado em buscarClientesPorTelefone (server/db.ts) pra vincular
 * automaticamente com segurança (só quando dá exatamente 1 match).
 */
export function variantesTelefone(valor: string | null | undefined): string[] {
  const digitosBrutos = normalizarTelefone(valor);
  if (!digitosBrutos) return [];
  const semDDI = semDdiELimpo(digitosBrutos);
  const variantes = new Set<string>([digitosBrutos, semDDI, `55${semDDI}`]);
  if (semDDI.length === 11 && semDDI[2] === "9") {
    const sem9 = semDDI.slice(0, 2) + semDDI.slice(3);
    variantes.add(sem9);
    variantes.add(`55${sem9}`);
  } else if (semDDI.length === 10) {
    const com9 = semDDI.slice(0, 2) + "9" + semDDI.slice(2);
    variantes.add(com9);
    variantes.add(`55${com9}`);
  }
  return Array.from(variantes);
}

/**
 * Forma canônica única (55+DDD+9+número, 13 dígitos) — diferente de
 * variantesTelefone (que gera todas as formas plausíveis pra casar
 * contra dado legado), essa função devolve só UMA representação, usada
 * pra indexar (cliente_telefones.numeroCanonico,
 * inboxConversas.telefoneNormalizado) em vez de comparar via REPLACE()
 * em SQL toda hora. undefined quando não dá pra confiar no formato
 * (nem 10 nem 11 dígitos depois de tirar DDI/zero de tronco).
 */
export function telefoneCanonico(valor: string | null | undefined): string | undefined {
  const digitosBrutos = normalizarTelefone(valor);
  if (!digitosBrutos) return undefined;
  const semDDI = semDdiELimpo(digitosBrutos);
  if (semDDI.length === 11) return `55${semDDI}`;
  if (semDDI.length === 10) return `55${semDDI.slice(0, 2)}9${semDDI.slice(2)}`;
  return undefined;
}

/**
 * Compara dois telefones considerando toda a ambiguidade de formato
 * (com/sem DDI, com/sem o "9" do celular) — reaproveita variantesTelefone
 * em vez de manter uma segunda lógica de comparação mais simples.
 *
 * Bug real encontrado 2026-08-29: a versão anterior só tratava diferença
 * de DDI (comparação exata + sufixo), nunca a diferença "com 9 / sem 9".
 * Uma terapeuta cadastrada com celular "38998516356" (com 9) nunca batia
 * contra o número que o WhatsApp realmente manda pra ela,
 * "553898516356" (sem 9) — resolverIdentidadeParticipante (server/db.ts)
 * nunca reconhecia essa terapeuta em mensagens de grupo por causa disso,
 * mesmo com o cadastro certo.
 */
export function telefonesCorrespondem(a: string | null | undefined, b: string | null | undefined) {
  const variantesA = variantesTelefone(a);
  if (variantesA.length === 0) return false;
  const conjuntoA = new Set(variantesA);
  return variantesTelefone(b).some((variante) => conjuntoA.has(variante));
}
