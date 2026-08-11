export function normalizarTelefone(valor: string | null | undefined) {
  return (valor ?? "").replace(/\D/g, "");
}

export function telefonesCorrespondem(a: string | null | undefined, b: string | null | undefined) {
  const aDigits = normalizarTelefone(a);
  const bDigits = normalizarTelefone(b);
  if (!aDigits || !bDigits) return false;

  const aSemDdi = aDigits.replace(/^55/, "");
  const bSemDdi = bDigits.replace(/^55/, "");
  return aDigits === bDigits || aSemDdi === bSemDdi || aDigits.endsWith(bSemDdi) || bDigits.endsWith(aSemDdi);
}
