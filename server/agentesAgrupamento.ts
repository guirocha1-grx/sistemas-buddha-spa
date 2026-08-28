import * as agentesDb from "./agentesDb";
import { processarMensagemRecebida } from "./agentesService";

/**
 * Libera somente blocos que ficaram dez segundos sem mensagem nova. A troca
 * de versão protege contra uma Áurea lenta: se chegar nova mensagem enquanto
 * um bloco estiver em processamento, o resultado antigo não é aproveitado e
 * a versão nova volta à fila com a janela mais recente preservada.
 */
export async function processarAgrupamentosProntos(agora = new Date()) {
  await agentesDb.recuperarAgrupamentosTravados(agora);
  const pendentes = await agentesDb.listarAgrupamentosProntos(agora);
  for (const agrupamento of pendentes) {
    const assumido = await agentesDb.assumirAgrupamentoMensagem(agrupamento.id, agrupamento.versao, agora);
    if (!assumido) continue;
    try {
      const resultado = await processarMensagemRecebida({
        conversaId: agrupamento.conversaId,
        mensagemEntradaId: agrupamento.ultimaMensagemId,
      });
      await agentesDb.concluirAgrupamentoMensagem({
        id: agrupamento.id,
        versao: agrupamento.versao,
        agora,
        erro: resultado.status === "erro" ? "Falha no processamento assistido" : null,
      });
    } catch (error) {
      const mensagem = error instanceof Error ? error.message : String(error);
      await agentesDb.concluirAgrupamentoMensagem({ id: agrupamento.id, versao: agrupamento.versao, erro: mensagem, agora });
      console.error(`[Agentes agrupamento] Falha na conversa ${agrupamento.conversaId}:`, error);
    }
  }
}
