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

/** O catálogo é pequeno; filtrar localmente evita exibir dados anteriores enquanto uma consulta remota é renovada. */
export function filtrarScriptsPorBusca<T extends ScriptPesquisavel>(scripts: T[], busca: string) {
  return scripts.filter((script) => scriptCorrespondeBusca(script, busca));
}

/** Rótulo compacto e descritivo exibido antes do conteúdo completo do Script. */
export function descricaoExibicaoScript(script: ScriptPesquisavel) {
  return script.titulo?.trim() || script.descricao?.trim() || "Sem descrição";
}
