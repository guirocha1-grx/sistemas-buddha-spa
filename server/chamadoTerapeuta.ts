export const CONVERSA_TESTE_CHAMADOS_ID = 900001;
export const UNIDADE_TESTE_CHAMADOS_ID = 2;

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

export function montarMensagemChamadoTerapeuta(dados: DadosChamadoTerapeuta): string {
  const linhas = [
    dados.modalidade === "pre_chamado" ? "*Pré-chamado*" : "*Chamado*",
    `Terapeuta: ${dados.terapeutaNome}.`,
    dados.modalidade === "pre_chamado"
      ? `Cliente: ${dados.clienteNome} previsto(a) para chegar${dados.horarioPrevisto ? ` às ${dados.horarioPrevisto}` : ""}.`
      : `Cliente: ${dados.clienteNome} aguarda em: ${dados.aguardandoEm}.`,
  ];
  if (dados.modalidade === "pre_chamado") linhas.push(`Preparação: ${dados.aguardandoEm}.`);
  if (dados.terapiaBemEstar) linhas.push(`Terapia Bem-Estar: ${dados.terapiaBemEstar}.`);
  if (dados.terapiaEstetica) linhas.push(`Terapia Estética: ${dados.terapiaEstetica}.`);
  linhas.push(`Local: ${dados.sala}.`);
  linhas.push(`${dados.taa}. Pref.: ${dados.preferencial ? "Sim" : "Não"}.`);
  return linhas.join("\n");
}

export function destinoTesteChamadoValido(conversaId: number, unidadeId: number): boolean {
  return conversaId === CONVERSA_TESTE_CHAMADOS_ID && unidadeId === UNIDADE_TESTE_CHAMADOS_ID;
}
