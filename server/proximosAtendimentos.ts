export type ProximoAtendimentoListavel = {
  clienteNome: string;
  dataAtendimento: string;
  horario: string | null;
  servicoNome: string | null;
  status: string;
};

export function deduplicarProximosAtendimentos<T extends ProximoAtendimentoListavel>(
  registros: T[],
  statusSintetico = "Agendado (IA)",
): T[] {
  const porAtendimento = new Map<string, T>();
  for (const registro of registros) {
    const chave = [
      registro.clienteNome.trim().toLocaleLowerCase("pt-BR"),
      registro.dataAtendimento,
      registro.horario ?? "",
      (registro.servicoNome ?? "").trim().toLocaleLowerCase("pt-BR"),
    ].join("|");
    const atual = porAtendimento.get(chave);
    if (!atual || (atual.status === statusSintetico && registro.status !== statusSintetico)) {
      porAtendimento.set(chave, registro);
    }
  }
  return Array.from(porAtendimento.values());
}
