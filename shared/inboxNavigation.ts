export function rotaInboxConversa(conversaId: number) {
  if (!Number.isInteger(conversaId) || conversaId <= 0) {
    throw new Error("ID de conversa inválido");
  }
  return `/mensagens?conversaId=${encodeURIComponent(conversaId)}`;
}

/**
 * Chave de sessionStorage do rascunho de uma conversa no Inbox — mesma
 * chave usada pelo Mensagens.tsx pra carregar o texto salvo ao trocar de
 * conversa. Escrever aqui ANTES de navegar pra rotaInboxConversa(conversaId)
 * é o jeito confiável de abrir o Inbox já com uma mensagem pré-preenchida:
 * reaproveita o mecanismo de rascunho que já é testado, em vez de um
 * parâmetro de URL que depende da ordem de efeitos do componente.
 */
export function chaveRascunhoConversa(conversaId: number): string {
  return `buddha_inbox_rascunho:${conversaId}`;
}
