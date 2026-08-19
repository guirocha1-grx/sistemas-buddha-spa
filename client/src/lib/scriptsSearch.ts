export type ScriptPesquisavel = {
  titulo?: string | null;
  descricao?: string | null;
  script?: string | null;
};

function normalizarBusca(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

/**
 * A busca do seletor deve refletir somente o conteúdo consultável pela equipe:
 * título, descrição de uso e o texto do Script. Categoria e nome de fluxo são
 * apenas metadados de organização e não devem produzir resultados inesperados.
 */
export function scriptCorrespondeBusca(script: ScriptPesquisavel, busca: string) {
  const termo = normalizarBusca(busca);
  if (!termo) return true;
  return [script.titulo, script.descricao, script.script]
    .some((campo) => normalizarBusca(campo ?? "").includes(termo));
}
