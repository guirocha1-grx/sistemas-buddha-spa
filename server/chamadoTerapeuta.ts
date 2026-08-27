export const CONVERSA_GRUPO_GERAL_RBS_ID = 960001;
export const UNIDADE_GRUPO_GERAL_RBS_ID = 2;

export type DadosChamadoTerapeuta = {
  modalidade: "chamado" | "pre_chamado";
  clienteNome: string;
  horarioPrevisto?: string | null;
  aguardandoEm: string;
  terapeutaNome: string;
  terapiaBemEstar?: string | null;
  terapiaEstetica?: string | null;
  sala: string;
  taa: string;
  preferencial: boolean;
};

export function primeiroNomeTerapeuta(nome: string): string {
  return nome.trim().split(/\s+/)[0] || "—";
}

/** Preserva nomes compostos frequentes, como Ana Paula e Maria Angélica. */
export function nomeCurtoCliente(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length < 2) return partes[0] || "Cliente";
  const primeirosCompostos = new Set(["ana", "maria", "joao", "josé", "jose", "luiz", "luis"]);
  return primeirosCompostos.has(partes[0].toLocaleLowerCase("pt-BR")) ? `${partes[0]} ${partes[1]}` : partes[0];
}

export function montarMensagemChamadoTerapeuta(dados: DadosChamadoTerapeuta): string {
  const linhas = [
    dados.modalidade === "pre_chamado" ? "*Pré-chamado*" : "*Chamado*",
    `Terapeuta: ${primeiroNomeTerapeuta(dados.terapeutaNome)}.`,
    dados.modalidade === "pre_chamado"
      ? `Cliente: ${nomeCurtoCliente(dados.clienteNome)} previsto(a) para chegar${dados.horarioPrevisto ? ` às ${dados.horarioPrevisto}` : ""}.`
      : `Cliente: ${nomeCurtoCliente(dados.clienteNome)} aguarda em: ${dados.aguardandoEm}.`,
  ];
  if (dados.modalidade === "pre_chamado") linhas.push(`Preparação: ${dados.aguardandoEm}.`);
  if (dados.terapiaBemEstar) linhas.push(`Terapia Bem-Estar: ${dados.terapiaBemEstar}.`);
  if (dados.terapiaEstetica) linhas.push(`Terapia Estética: ${dados.terapiaEstetica}.`);
  linhas.push(`Local: ${dados.sala}.`);
  linhas.push(`${dados.taa}. Pref.: ${dados.preferencial ? "Sim" : "Não"}.`);
  if (dados.preferencial) linhas.push("🟩 PREFERENCIAL");
  return linhas.join("\n");
}

export function destinoGrupoGeralRbsValido(conversaId: number, unidadeId: number): boolean {
  return conversaId === CONVERSA_GRUPO_GERAL_RBS_ID && unidadeId === UNIDADE_GRUPO_GERAL_RBS_ID;
}
