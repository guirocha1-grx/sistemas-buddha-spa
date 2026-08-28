export type ContatoParaCadastro = {
  clienteNome?: string | null;
  nomeContato?: string | null;
  telefone?: string | null;
};

/** Nome do WhatsApp é apenas sugestão editável; números nunca viram nome de cliente. */
export function nomeSugeridoParaCadastro(contato: ContatoParaCadastro | null | undefined): string {
  const candidato = (contato?.clienteNome || contato?.nomeContato || "").trim();
  if (!candidato) return "";
  const somenteDigitos = candidato.replace(/\D/g, "");
  if (somenteDigitos.length >= 8 || candidato === contato?.telefone) return "";
  return candidato;
}
