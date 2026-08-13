export function normalizarTelefone(valor: string | null | undefined) {
  return (valor ?? "").replace(/\D/g, "");
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
  const digitos = normalizarTelefone(valor);
  if (!digitos) return [];
  const semDDI = digitos.replace(/^55/, "");
  const variantes = new Set<string>([digitos, semDDI]);
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

export function telefonesCorrespondem(a: string | null | undefined, b: string | null | undefined) {
  const aDigits = normalizarTelefone(a);
  const bDigits = normalizarTelefone(b);
  if (!aDigits || !bDigits) return false;

  const aSemDdi = aDigits.replace(/^55/, "");
  const bSemDdi = bDigits.replace(/^55/, "");
  return aDigits === bDigits || aSemDdi === bSemDdi || aDigits.endsWith(bSemDdi) || bDigits.endsWith(aSemDdi);
}
