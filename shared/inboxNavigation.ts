/** `mensagem`, quando informado, pré-preenche a caixa de texto do Inbox (só quando não há rascunho em andamento — ver Mensagens.tsx). */
export function rotaInboxConversa(conversaId: number, mensagem?: string) {
  if (!Number.isInteger(conversaId) || conversaId <= 0) {
    throw new Error("ID de conversa inválido");
  }
  const params = new URLSearchParams({ conversaId: String(conversaId) });
  if (mensagem?.trim()) params.set("mensagem", mensagem.trim());
  return `/mensagens?${params.toString()}`;
}
