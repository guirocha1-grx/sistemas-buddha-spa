/**
 * Fluxos de automação — nó "menu": manda o texto + opções (texto
 * numerado, botões ou lista nativos do WhatsApp) e espera a resposta
 * do cliente pra ramificar. Mesmo status "aguardando_resposta" e
 * mecanismo de retomada do resto do motor (ver server/fluxos.ts).
 */
import type { FluxoNoConfig } from "../drizzle/schema";
import {
  getFluxoById,
  getFluxoExecucaoById,
  getFluxoNoByOrdem,
  getInboxConversaById,
  getUnidadeById,
  incrementarFluxoNoEnviados,
  incrementarFluxoNoOpcaoClique,
  insertInboxMensagem,
  listInboxMensagens,
  updateFluxoExecucao,
} from "./db";
import { zapiApi } from "./zapiApi";
import { enviarPelaUnidade } from "./fluxos";

type MenuConfig = Extract<FluxoNoConfig, { texto: string; opcoes: Array<{ label: string; ordemDestino: number | null }> }>;

function interpolarVariaveis(texto: string, variaveis: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (match, nome) => variaveis[nome] ?? match);
}

/** Envia o texto do menu + opções e marca a execução aguardando a resposta do cliente. */
export async function processarNoMenu(execucaoId: number): Promise<void> {
  const execucao = await getFluxoExecucaoById(execucaoId);
  if (!execucao) return;
  const [no, fluxo] = await Promise.all([
    getFluxoNoByOrdem(execucao.fluxoId, execucao.noAtualOrdem),
    getFluxoById(execucao.fluxoId),
  ]);
  if (!no || no.tipo !== "menu" || !fluxo) return;
  const config = no.config as MenuConfig;
  const variaveis = (execucao.variaveis as Record<string, string>) ?? {};

  if (!config.opcoes || config.opcoes.length === 0) {
    await updateFluxoExecucao(execucaoId, { status: "erro", erroMsg: "Nó Menu sem nenhuma opção configurada" });
    return;
  }

  const conversa = await getInboxConversaById(execucao.conversaId);
  if (!conversa?.telefone) {
    await updateFluxoExecucao(execucaoId, { status: "erro", erroMsg: "Conversa sem telefone associado (nó menu)" });
    return;
  }

  const unidade = await getUnidadeById(fluxo.unidadeId);
  if (!unidade) {
    await updateFluxoExecucao(execucaoId, { status: "erro", erroMsg: "Unidade do fluxo não encontrada" });
    return;
  }
  if (unidade.canal !== "buddha_mkt" && (!unidade.zapiInstanceId || !unidade.zapiToken || !unidade.zapiClientToken)) {
    await updateFluxoExecucao(execucaoId, { status: "erro", erroMsg: "Z-API não configurado para a unidade do fluxo" });
    return;
  }

  const { computarVariaveisSistema } = await import("./fluxos");
  const variaveisComSistema = { ...variaveis, ...(await computarVariaveisSistema(execucao, fluxo)) };
  const textoBase = interpolarVariaveis(config.texto, variaveisComSistema);
  // Estilo "botões"/"lista" nativos do WhatsApp são exclusivos do
  // caminho Z-API — a Cloud API oficial (Buddha Mkt) sempre usa texto
  // numerado, igual ao "Menu" do BotConversa mandava por fora da janela
  // de template.
  const estilo = unidade.canal === "buddha_mkt" ? "texto" : (config.estilo ?? "texto");

  // Texto gravado no histórico do Inbox — o WhatsApp só renderiza os
  // botões/lista no aparelho do cliente, não reconstruímos isso na tela.
  const textoRegistrado = estilo === "texto"
    ? `${textoBase}\n\n${config.opcoes.map((o, i) => `${i + 1}. ${o.label}`).join("\n")}`
    : textoBase;

  try {
    if (estilo === "botoes" && unidade.zapiInstanceId && unidade.zapiToken && unidade.zapiClientToken) {
      await zapiApi.sendButtonList(
        unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken,
        conversa.telefone, textoBase,
        config.opcoes.slice(0, 3).map((o, i) => ({ id: String(i + 1), label: o.label })),
      );
    } else if (estilo === "lista" && unidade.zapiInstanceId && unidade.zapiToken && unidade.zapiClientToken) {
      await zapiApi.sendOptionList(
        unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken,
        conversa.telefone, textoBase, "Opções", "Ver opções",
        config.opcoes.slice(0, 10).map((o, i) => ({ id: String(i + 1), title: o.label, description: o.descricao })),
      );
    } else {
      await enviarPelaUnidade(unidade, conversa.telefone, textoRegistrado);
    }
    await incrementarFluxoNoEnviados(no.id);
  } catch (e) {
    console.error(`[FluxosMenu] Erro ao enviar menu (execução ${execucaoId}):`, e);
  }
  await insertInboxMensagem({
    conversaId: execucao.conversaId,
    direcao: "enviada",
    tipo: "texto",
    conteudo: textoRegistrado,
    enviadaPorIa: true,
  });

  await updateFluxoExecucao(execucaoId, { status: "aguardando_resposta" });
}

/** Casa a última resposta do cliente com uma opção (por número ou por substring do label) e avança. */
export async function processarRespostaMenu(execucaoId: number): Promise<void> {
  const execucao = await getFluxoExecucaoById(execucaoId);
  if (!execucao || execucao.status !== "aguardando_resposta") return;
  const no = await getFluxoNoByOrdem(execucao.fluxoId, execucao.noAtualOrdem);
  if (!no || no.tipo !== "menu") return;
  const config = no.config as MenuConfig;
  const opcoes = config.opcoes ?? [];

  const mensagens = await listInboxMensagens(execucao.conversaId, 10);
  const ultimaDoCliente = [...mensagens].reverse().find((m: any) => m.direcao === "recebida");
  const resposta = (ultimaDoCliente?.conteudo ?? "").trim().toLowerCase();

  let ordemDestino: number | null = null;
  let opcaoIndex: number | null = null;
  const porNumero = parseInt(resposta, 10);
  if (!isNaN(porNumero) && opcoes[porNumero - 1]) {
    opcaoIndex = porNumero - 1;
    ordemDestino = opcoes[porNumero - 1].ordemDestino;
  } else {
    const idxPorLabel = opcoes.findIndex((o) => resposta.includes(o.label.toLowerCase()) || o.label.toLowerCase().includes(resposta));
    opcaoIndex = idxPorLabel >= 0 ? idxPorLabel : null;
    ordemDestino = idxPorLabel >= 0 ? opcoes[idxPorLabel].ordemDestino : config.ordemSeNaoEntendeu;
  }

  if (opcaoIndex !== null) {
    await incrementarFluxoNoOpcaoClique(no.id, opcaoIndex);
  }

  await avancarMenu(execucaoId, ordemDestino);
}

/** Chamado pelo cron de retomar-fluxos pras execuções "menu" que passaram do timeout sem resposta — segue pro "se não entender". */
export async function avancarMenuPorTimeout(execucaoId: number): Promise<void> {
  const execucao = await getFluxoExecucaoById(execucaoId);
  if (!execucao || execucao.status !== "aguardando_resposta") return;
  const no = await getFluxoNoByOrdem(execucao.fluxoId, execucao.noAtualOrdem);
  if (!no || no.tipo !== "menu") return;
  const config = no.config as MenuConfig;
  await avancarMenu(execucaoId, config.ordemSeNaoEntendeu);
}

async function avancarMenu(execucaoId: number, proximoNoOrdem: number | null): Promise<void> {
  if (proximoNoOrdem === null) {
    await updateFluxoExecucao(execucaoId, { status: "concluido", concluidoEm: new Date() });
    return;
  }
  const { processarNo } = await import("./fluxos");
  await updateFluxoExecucao(execucaoId, { status: "ativo", noAtualOrdem: proximoNoOrdem });
  await processarNo(execucaoId);
}
