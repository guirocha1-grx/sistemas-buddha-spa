export const CONVERSA_GRUPO_GERAL_RBS_ID = 960001;
export const UNIDADE_GRUPO_GERAL_RBS_ID = 2;

// Aos domingos só o RBS abre (SSU fecha por custo) e TODO chamado do
// dia — de qualquer terapeuta, do RBS ou visitante — roda dentro desse
// grupo de plantão em vez do Grupo Geral normal. Não é uma escolha
// ligada a QUAL terapeuta está sendo chamada (isso é outro controle,
// ver "terapeuta de outra unidade" em ChamadoTerapeutaDialog.tsx) —
// é uma escolha de QUAL GRUPO, independente, com o padrão sugerido
// mudando conforme o dia da semana só pra agilizar (2026-08-30,
// esclarecido pelo usuário depois da primeira versão acoplar errado
// os dois controles). Ver memória de grupos WhatsApp conhecidos.
export const CONVERSA_GRUPO_DOMINGO_PLANTAO_RBS_ID = 3180018;

export const GRUPOS_CHAMADO_RBS = [
  { chave: "geral", label: "Equipe Buddha Spa Ribeirão Shopping", conversaId: CONVERSA_GRUPO_GERAL_RBS_ID },
  { chave: "domingo_plantao", label: "Domingo - plantão RBS", conversaId: CONVERSA_GRUPO_DOMINGO_PLANTAO_RBS_ID },
] as const;

export type ChaveGrupoChamado = typeof GRUPOS_CHAMADO_RBS[number]["chave"];

// Dia da semana em horário de Brasília, não do servidor (que pode
// rodar em UTC) — perto da meia-noite, `data.getDay()` direto erraria
// o dia certo em até 3h.
export function grupoChamadoPadrao(data: Date): ChaveGrupoChamado {
  const diaSemana = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(data);
  return diaSemana === "Sun" ? "domingo_plantao" : "geral";
}

export function conversaIdDoGrupoChamado(chave: ChaveGrupoChamado): number {
  return GRUPOS_CHAMADO_RBS.find((g) => g.chave === chave)!.conversaId;
}

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
