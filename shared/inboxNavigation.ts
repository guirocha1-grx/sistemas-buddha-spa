export function rotaInboxConversa(conversaId: number) {
  if (!Number.isInteger(conversaId) || conversaId <= 0) {
    throw new Error("ID de conversa inválido");
  }
  return `/mensagens?conversaId=${encodeURIComponent(conversaId)}`;
}
