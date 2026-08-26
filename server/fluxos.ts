/**
 * Motor de execução de Fluxos de automação de WhatsApp (porte do
 * mobai-crm, 2026-08-13, ver drizzle/schema.ts pro contexto completo).
 * Processa nó a nó na mesma chamada até bater num nó que precisa
 * esperar (aguardar/menu) ou terminar — nunca usa setTimeout (não
 * sobrevive a um restart), o avanço fica marcado em
 * fluxo_execucoes.proximaExecucaoEm e um cron externo retoma depois
 * (ver server/_core/index.ts, rota /api/scheduled/retomar-fluxos).
 *
 * Diferente do mobai-crm: sem os nós de IA "agente"/"assistente" (v1),
 * sem QStash (aguardar fica só com o piso de ~5s do cron), e a
 * âncora da execução é a conversa do Inbox, não o cliente.
 */
import type { Fluxo, FluxoExecucao, FluxoNoConfig, Unidade } from "../drizzle/schema";
import {
  createFluxoExecucao,
  getFluxoById,
  getFluxoExecucaoById,
  getFluxoNoByOrdem,
  getInboxConversaById,
  getUnidadeById,
  insertInboxMensagem,
  listFluxoExecucoesPausadasVencidas,
  listFluxoNos,
  updateFluxoExecucao,
} from "./db";
import { zapiApi } from "./zapiApi";
import { buddhaMktApi } from "./buddhaMktApi";
import { storageGetBase64, storageGetSignedUrl, storageExists } from "./storage";
import { obterCampanhaMensal } from "./agentesDb";

// Limite de passos processados em sequência numa única chamada
// (mensagem/condicional/salvar_variavel/webhook/randomizador/midia
// avançam recursivamente sem passar pelo cron). Evita loop infinito se
// um fluxo mal configurado tiver um ciclo sem nenhum "aguardar" no meio.
const LIMITE_PASSOS_SEQUENCIA = 50;

// Nome reservado dentro de fluxo_execucoes.variaveis — carrega o
// delayTyping (em segundos) do "aguardar" pro passo "mensagem" logo
// seguinte, sem precisar de coluna nova nem de passar parâmetro por toda
// a cadeia recursiva de avancar()/irParaOrdem(). Nunca aparece pro
// usuário (não é usado em nenhum {{...}} de interpolação) e é sempre
// consumida/limpa no primeiro "mensagem" alcançado, use-a ou não.
const VARIAVEL_DELAY_TYPING = "__delayTypingSegundos";
const DELAY_TYPING_MAX_SEGUNDOS = 15;

function interpolarVariaveis(texto: string, variaveis: Record<string, string>): string {
  return texto.replace(/\{\{(\w+)\}\}/g, (match, nome) => variaveis[nome] ?? match);
}

function avaliarCondicao(
  valorAtual: string | undefined,
  operador: "igual" | "diferente" | "contem" | "existe" | "nao_existe",
  valorEsperado?: string,
): boolean {
  switch (operador) {
    case "existe": return valorAtual !== undefined && valorAtual !== "";
    case "nao_existe": return valorAtual === undefined || valorAtual === "";
    case "igual": return valorAtual === valorEsperado;
    case "diferente": return valorAtual !== valorEsperado;
    case "contem": return !!valorAtual && !!valorEsperado && valorAtual.includes(valorEsperado);
    default: return false;
  }
}

function avaliarCondicoes(
  config: Extract<FluxoNoConfig, { logica: "E" | "OU" }>,
  variaveis: Record<string, string>,
): boolean {
  const resultados = config.condicoes.map((c) => avaliarCondicao(variaveis[c.variavel], c.operador, c.valor));
  return config.logica === "E" ? resultados.every(Boolean) : resultados.some(Boolean);
}

/**
 * Variáveis calculadas na hora — nome/telefone/email/unidade do
 * cliente ou contato da conversa — disponíveis em qualquer nó que
 * interpola texto (mensagem, menu, salvar_variavel) ou avalia
 * condição, junto das variáveis normais do fluxo. Nunca persistidas em
 * fluxo_execucoes.variaveis, recalculadas a cada passo. v1 não inclui
 * _horario_comercial/_cliente_novo do mobai-crm (fora de escopo por
 * enquanto — não existe config de horário por unidade aqui).
 *
 * `nome_cliente` é alias de `nome` (mesmo valor) — Scripts (2026-08-13,
 * ver ScriptPicker.tsx) usa esse nome pra variável de cliente; mantém
 * `nome` também pra não quebrar fluxo já montado antes dessa mudança.
 */
export async function computarVariaveisSistema(execucao: FluxoExecucao, fluxo: Fluxo): Promise<Record<string, string>> {
  const [conversa, unidade, campanha] = await Promise.all([
    getInboxConversaById(execucao.conversaId),
    getUnidadeById(fluxo.unidadeId),
    obterCampanhaMensal(fluxo.unidadeId),
  ]);
  const nomeCliente = conversa?.clienteNome || conversa?.nomeContato || "";
  return {
    nome: nomeCliente,
    nome_cliente: nomeCliente,
    first_name: nomeCliente.trim().split(/\s+/)[0] ?? "",
    telefone: conversa?.telefone || "",
    email: "",
    unidade: unidade?.nome || "",
    campanha_do_mes: campanha?.ativo ? (campanha.conteudo || "") : "",
  };
}

/** Sorteio ponderado entre os ramos do nó "randomizador" — pesos não precisam somar 100, são normalizados. */
function sortearRamo(ramos: Array<{ pesoPercentual: number; ordemDestino: number | null }>): number | null {
  const pesoTotal = ramos.reduce((soma, r) => soma + Math.max(0, r.pesoPercentual), 0);
  if (pesoTotal <= 0) return ramos[0]?.ordemDestino ?? null;
  const alvo = Math.random() * pesoTotal;
  let acumulado = 0;
  for (const ramo of ramos) {
    acumulado += Math.max(0, ramo.pesoPercentual);
    if (alvo < acumulado) return ramo.ordemDestino;
  }
  return ramos[ramos.length - 1]?.ordemDestino ?? null;
}

/** Resolve um path simples tipo "data.status" dentro de um objeto JSON já parseado. */
function resolverCaminhoJson(obj: unknown, caminho: string): unknown {
  return caminho.split(".").reduce<unknown>((atual, chave) => {
    if (atual == null || typeof atual !== "object") return undefined;
    return (atual as Record<string, unknown>)[chave];
  }, obj);
}

/**
 * Chama a URL configurada no nó "webhook" (POST, corpo = variáveis do
 * fluxo) — nunca lança, só loga e retorna `false` em caso de erro/
 * timeout, pra quem chamou decidir a saída (sucesso segue
 * proximoNoOrdem, erro segue ordemSeErro). Se `variavelResposta`
 * estiver configurado, tenta extrair `campoResposta` do JSON de
 * resposta e salvar na variável.
 */
async function dispararWebhook(
  execucaoId: number,
  config: Extract<FluxoNoConfig, { url: string; ordemSeErro: number | null }>,
  variaveis: Record<string, string>,
): Promise<boolean> {
  if (!config.url?.trim()) {
    console.error(`[Fluxos] Nó webhook sem URL configurada (execução ${execucaoId})`);
    return false;
  }
  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(variaveis),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[Fluxos] Webhook retornou ${res.status} (execução ${execucaoId}):`, await res.text().catch(() => ""));
      return false;
    }
    if (config.variavelResposta) {
      try {
        const json = await res.json();
        const valor = config.campoResposta ? resolverCaminhoJson(json, config.campoResposta) : json;
        await updateFluxoExecucao(execucaoId, {
          variaveis: { ...variaveis, [config.variavelResposta]: typeof valor === "string" ? valor : JSON.stringify(valor ?? "") },
        });
      } catch (e) {
        console.error(`[Fluxos] Erro ao extrair resposta do webhook (execução ${execucaoId}):`, e);
      }
    }
    return true;
  } catch (e) {
    console.error(`[Fluxos] Erro ao chamar webhook (execução ${execucaoId}):`, e);
    return false;
  }
}

async function extrairVariavelViaIa(conversaId: number, promptIa: string, nomeVariavel: string): Promise<string> {
  const { invokeLLM } = await import("./_core/llm");
  const { listInboxMensagens } = await import("./db");
  const mensagens = await listInboxMensagens(conversaId, 30);
  const historico = mensagens
    .map((m: any) => `${m.direcao === "recebida" ? "Cliente" : "Atendente"}: ${m.conteudo}`)
    .join("\n");
  const response = await invokeLLM({
    model: "gpt-5-mini",
    maxTokens: 300,
    messages: [
      { role: "system", content: promptIa || `Extraia o valor da variável "${nomeVariavel}" a partir da conversa abaixo. Se não for possível identificar, responda com string vazia.` },
      { role: "user", content: `CONVERSA:\n${historico}` },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "extracao_variavel",
        strict: true,
        schema: {
          type: "object",
          properties: { valor: { type: "string" } },
          required: ["valor"],
          additionalProperties: false,
        },
      },
    },
  } as any);
  const raw = response.choices?.[0]?.message?.content;
  const rawStr = typeof raw === "string" ? raw : JSON.stringify(raw);
  if (!rawStr) return "";
  try {
    const parsed = JSON.parse(rawStr) as { valor: string };
    return parsed.valor ?? "";
  } catch {
    return "";
  }
}

/**
 * Manda texto pela unidade dona do fluxo — nó nenhum guarda
 * telefone/instância direto, sempre resolve via fluxo → unidade, igual
 * o resto do app (inbox.mensagens.enviar, enviarMidia). Ramifica por
 * `unidade.canal`: a unidade sintética "Buddha Mkt" (WhatsApp Cloud API
 * oficial) não tem credencial Z-API nenhuma — usa a conta global lida
 * de `configuracoes` (ver server/buddhaMktApi.ts).
 */
export async function enviarPelaUnidade(unidade: Unidade, telefone: string, texto: string, delayTypingSegundos?: number): Promise<{ zapiMessageId: string | null }> {
  if (unidade.canal === "buddha_mkt") {
    // delayTyping é específico do /send-text da Z-API — sem equivalente
    // conhecido na Cloud API oficial do WhatsApp (Buddha Mkt).
    await buddhaMktApi.sendText(telefone, texto);
    return { zapiMessageId: null };
  }
  if (!unidade.zapiInstanceId || !unidade.zapiToken || !unidade.zapiClientToken) {
    throw new Error("Z-API não configurado para a unidade do fluxo");
  }
  const resultado = await zapiApi.sendText(unidade.zapiInstanceId, unidade.zapiToken, unidade.zapiClientToken, telefone, texto, undefined, delayTypingSegundos);
  return { zapiMessageId: resultado.messageId ?? null };
}

/**
 * Cria a execução no nó de entrada do fluxo (fluxos.entradaNoOrdem, ou
 * o de menor `ordem` se não definido) e a processa imediatamente.
 * `variaveisIniciais` semeia a execução (ex.: `nome_atendente`, quando
 * quem disparou foi uma pessoa de verdade — um Script tipo "fluxo" ou
 * o "Executar fluxo" do Inbox — e não um gatilho automático, que não
 * tem ninguém "atendendo").
 */
export async function iniciarExecucaoFluxo(
  fluxoId: number,
  conversaId: number,
  clienteId?: number | null,
  variaveisIniciais?: Record<string, string>,
): Promise<number> {
  const [fluxo, nos] = await Promise.all([getFluxoById(fluxoId), listFluxoNos(fluxoId)]);
  if (nos.length === 0) throw new Error("Fluxo sem nenhum passo configurado");
  const ordemInicial = fluxo?.entradaNoOrdem ?? nos[0].ordem; // nos[0] = menor ordem (listFluxoNos ordena asc)
  const execucaoId = await createFluxoExecucao({
    fluxoId, conversaId, clienteId: clienteId ?? null, noAtualOrdem: ordemInicial,
    variaveis: variaveisIniciais,
  });
  await processarNo(execucaoId);
  return execucaoId;
}

export async function processarNo(execucaoId: number): Promise<void> {
  await processarPasso(execucaoId, 0);
}

async function processarPasso(execucaoId: number, profundidade: number): Promise<void> {
  const execucao = await getFluxoExecucaoById(execucaoId);
  if (!execucao || (execucao.status !== "ativo" && execucao.status !== "pausado")) return;

  if (profundidade >= LIMITE_PASSOS_SEQUENCIA) {
    await updateFluxoExecucao(execucaoId, {
      status: "erro",
      erroMsg: `Mais de ${LIMITE_PASSOS_SEQUENCIA} passos em sequência sem um "aguardar" — provável ciclo no fluxo.`,
    });
    return;
  }

  try {
    const [no, fluxo] = await Promise.all([
      getFluxoNoByOrdem(execucao.fluxoId, execucao.noAtualOrdem),
      getFluxoById(execucao.fluxoId),
    ]);
    if (!no) {
      await updateFluxoExecucao(execucaoId, { status: "erro", erroMsg: `Passo de ordem ${execucao.noAtualOrdem} não encontrado no fluxo` });
      return;
    }
    if (!fluxo) {
      await updateFluxoExecucao(execucaoId, { status: "erro", erroMsg: "Fluxo não encontrado" });
      return;
    }
    const variaveis = (execucao.variaveis as Record<string, string>) ?? {};

    switch (no.tipo) {
      case "fim": {
        await updateFluxoExecucao(execucaoId, { status: "concluido", concluidoEm: new Date() });
        return;
      }

      case "mensagem": {
        const config = no.config as Extract<FluxoNoConfig, { texto: string }>;
        const conversa = await getInboxConversaById(execucao.conversaId);
        const variaveisComSistema = { ...variaveis, ...(await computarVariaveisSistema(execucao, fluxo)) };
        const texto = interpolarVariaveis(config.texto, variaveisComSistema);
        // Consome VARIAVEL_DELAY_TYPING (gravada por retomarExecucoesPendentes
        // quando o "aguardar" anterior tinha "mostrarDigitando" marcado) — só
        // vale pro passo "mensagem" imediatamente seguinte, por isso é
        // sempre limpa aqui, tenha sido usada ou não.
        const delayTypingBruto = variaveis[VARIAVEL_DELAY_TYPING];
        if (delayTypingBruto !== undefined) {
          const { [VARIAVEL_DELAY_TYPING]: _descartado, ...semDelayTyping } = variaveis;
          await updateFluxoExecucao(execucaoId, { variaveis: semDelayTyping });
        }
        const delayTypingSegundos = delayTypingBruto !== undefined ? Number(delayTypingBruto) : undefined;
        if (conversa?.telefone) {
          const unidade = await getUnidadeById(fluxo.unidadeId);
          if (!unidade) {
            await updateFluxoExecucao(execucaoId, { status: "erro", erroMsg: "Unidade do fluxo não encontrada" });
            return;
          }
          let zapiMessageId: string | null;
          try {
            ({ zapiMessageId } = await enviarPelaUnidade(unidade, conversa.telefone, texto, delayTypingSegundos));
          } catch (e) {
            // Não grava como "enviada" quando o envio de verdade falhou —
            // mesmo bug que a mídia tinha antes (ver storageExists acima)
            // e que a Manus achou e corrigiu no mobai-crm: aceitar 2xx sem
            // confirmação de entrega e registrar como se tivesse sido
            // enviada. Marca a execução como erro em vez de seguir
            // silenciosamente.
            const erroMsg = e instanceof Error ? e.message : String(e);
            console.error(`[Fluxos] Erro ao enviar mensagem (execução ${execucaoId}):`, e);
            await updateFluxoExecucao(execucaoId, { status: "erro", erroMsg: `Falha ao enviar mensagem: ${erroMsg}` });
            return;
          }
          await insertInboxMensagem({
            conversaId: execucao.conversaId,
            direcao: "enviada",
            tipo: "texto",
            conteudo: texto,
            enviadaPorIa: true,
            zapiMessageId,
          });
        }
        await avancar(execucaoId, no.proximoNoOrdem, profundidade);
        return;
      }

      case "aguardar": {
        const config = no.config as Extract<FluxoNoConfig, { valor: number; unidade: "segundos" | "minutos" | "horas" | "dias" }>;
        const msPorUnidade = { segundos: 1_000, minutos: 60_000, horas: 3_600_000, dias: 86_400_000 }[config.unidade];
        const delayMs = config.valor * msPorUnidade;
        const delaySegundos = Math.round(delayMs / 1000);
        if (config.mostrarDigitando && delaySegundos <= DELAY_TYPING_MAX_SEGUNDOS) {
          // A espera some daqui e vira o próprio delayTyping do /send-text
          // seguinte — a Z-API sempre soma o tempo de "Digitando..." ANTES
          // de mandar a mensagem, então pausar aqui pelo tempo cheio e
          // ainda mandar delayTyping depois dobrava a espera real (ex.:
          // "aguardar 3s" virava ~6s). Passando direto sem pausar (só
          // grava a variável e avança na mesma chamada, sem passar pelo
          // cron), a Z-API espera o tempo certo de uma vez só, com o
          // "Digitando..." cobrindo o período inteiro.
          await updateFluxoExecucao(execucaoId, { variaveis: { ...variaveis, [VARIAVEL_DELAY_TYPING]: String(Math.max(1, delaySegundos)) } });
          await avancar(execucaoId, no.proximoNoOrdem, profundidade);
          return;
        }
        await updateFluxoExecucao(execucaoId, {
          status: "pausado",
          proximaExecucaoEm: new Date(Date.now() + delayMs),
        });
        // Sem QStash aqui — retomada só pelo cron de ~5s (ver
        // server/_core/scheduler.ts), diferente do mobai-crm que tem um
        // caminho rápido pra "segundos". Precisão de poucos segundos é
        // aceitável mesmo pra "aguardar" curtos.
        return;
      }

      case "condicional": {
        const config = no.config as Extract<FluxoNoConfig, { logica: "E" | "OU" }>;
        const variaveisComSistema = { ...variaveis, ...(await computarVariaveisSistema(execucao, fluxo)) };
        const verdadeiro = avaliarCondicoes(config, variaveisComSistema);
        const proximaOrdem = verdadeiro ? config.ordemSeVerdadeiro : config.ordemSeFalso;
        await avancar(execucaoId, proximaOrdem, profundidade);
        return;
      }

      case "salvar_variavel": {
        const config = no.config as Extract<FluxoNoConfig, { nome: string; origem: "fixo" | "ia" }>;
        const valor = config.origem === "fixo"
          ? interpolarVariaveis((config as any).valorFixo ?? "", { ...variaveis, ...(await computarVariaveisSistema(execucao, fluxo)) })
          : await extrairVariavelViaIa(execucao.conversaId, (config as any).promptIa ?? "", config.nome);
        await updateFluxoExecucao(execucaoId, { variaveis: { ...variaveis, [config.nome]: valor } });
        await avancar(execucaoId, no.proximoNoOrdem, profundidade);
        return;
      }

      case "randomizador": {
        const config = no.config as Extract<FluxoNoConfig, { ramos: Array<{ pesoPercentual: number; ordemDestino: number | null }> }>;
        const proximaOrdem = sortearRamo(config.ramos);
        await avancar(execucaoId, proximaOrdem, profundidade);
        return;
      }

      case "webhook": {
        const config = no.config as Extract<FluxoNoConfig, { url: string; ordemSeErro: number | null }>;
        const sucesso = await dispararWebhook(execucaoId, config, variaveis);
        await avancar(execucaoId, sucesso ? no.proximoNoOrdem : config.ordemSeErro, profundidade);
        return;
      }

      case "midia": {
        const config = no.config as Extract<FluxoNoConfig, { tipoMidia: "imagem" | "audio" | "documento"; storageKey: string }>;
        const conversa = await getInboxConversaById(execucao.conversaId);
        if (conversa?.telefone && config.storageKey) {
          // Confere se o arquivo existe de verdade no bucket atual antes de
          // tentar enviar — uma referência gravada antes da troca de
          // backend Forge → R2 (2026-08-23) nunca mais existe, e sem essa
          // checagem o erro só aparecia num console.error engolido: o
          // fluxo seguia em frente como se a mídia tivesse sido enviada
          // (ver registro_recuperacao_fotos_2026-08-25.md pro mesmo
          // problema nos avatares do Inbox). Diferente do avatar, não tem
          // self-heal automático aqui — é conteúdo de campanha, só
          // recuperável reenviando o arquivo pelo editor do Fluxo.
          if (!(await storageExists(config.storageKey))) {
            await updateFluxoExecucao(execucaoId, {
              status: "erro",
              erroMsg: `Mídia não encontrada no storage atual (chave "${config.storageKey}") — provavelmente um arquivo de antes da troca de backend pra R2. Reenvie o arquivo nesse passo do Fluxo.`,
            });
            return;
          }
          let zapiMessageId: string | null = null;
          let erroEnvio: string | null = null;
          const unidade = await getUnidadeById(fluxo.unidadeId);
          if (unidade?.canal === "buddha_mkt") {
            // Envio de mídia pela Cloud API oficial exige upload prévio
            // via endpoint próprio da Graph API — fora de escopo por
            // ora. Fallback: manda ao menos a legenda como texto, pra
            // não perder o passo do fluxo silenciosamente.
            try {
              await enviarPelaUnidade(unidade, conversa.telefone, config.legenda || config.nomeArquivo || `[${config.tipoMidia}]`);
            } catch (e) {
              erroEnvio = e instanceof Error ? e.message : String(e);
              console.error(`[Fluxos] Erro ao enviar mídia via Buddha Mkt (execução ${execucaoId}):`, e);
            }
          } else if (unidade?.zapiInstanceId && unidade.zapiToken && unidade.zapiClientToken) {
            const creds = { instanceId: unidade.zapiInstanceId, token: unidade.zapiToken, clientToken: unidade.zapiClientToken };
            try {
              // Base64 direto pra Z-API pra imagem/documento — URL
              // assinada do storage se mostrou não-confiável nesse
              // projeto (mesmo caminho de inbox.mensagens.enviarMidia).
              // Áudio continua por URL (sem sendAudioBase64 ainda).
              if (config.tipoMidia === "imagem") {
                const base64 = await storageGetBase64(config.storageKey);
                const resultado = await zapiApi.sendImageBase64(creds.instanceId, creds.token, creds.clientToken, conversa.telefone, base64, "image/jpeg", config.legenda);
                zapiMessageId = resultado.messageId ?? null;
              } else if (config.tipoMidia === "audio") {
                const url = await storageGetSignedUrl(config.storageKey);
                const resultado = await zapiApi.sendAudio(creds.instanceId, creds.token, creds.clientToken, conversa.telefone, url);
                zapiMessageId = resultado.messageId ?? null;
              } else {
                const base64 = await storageGetBase64(config.storageKey);
                const resultado = await zapiApi.sendDocumentBase64(creds.instanceId, creds.token, creds.clientToken, conversa.telefone, base64, "application/octet-stream", config.nomeArquivo);
                zapiMessageId = resultado.messageId ?? null;
              }
            } catch (e) {
              erroEnvio = e instanceof Error ? e.message : String(e);
              console.error(`[Fluxos] Erro ao enviar mídia (execução ${execucaoId}):`, e);
            }
          }
          if (erroEnvio) {
            await updateFluxoExecucao(execucaoId, { status: "erro", erroMsg: `Falha ao enviar mídia: ${erroEnvio}` });
            return;
          }
          await insertInboxMensagem({
            conversaId: execucao.conversaId,
            direcao: "enviada",
            tipo: config.tipoMidia,
            conteudo: config.legenda || config.nomeArquivo || config.tipoMidia,
            enviadaPorIa: true,
            zapiMessageId,
            metadados: JSON.stringify({ storageKey: config.storageKey, legenda: config.legenda ?? null, fileName: config.nomeArquivo ?? null }),
          });
        }
        await avancar(execucaoId, no.proximoNoOrdem, profundidade);
        return;
      }

      case "menu": {
        // Manda o texto + opções e fica "aguardando_resposta" —
        // retomado por server/webhooks.ts quando o cliente responder,
        // ou pelo timeout do cron de retomar-fluxos.
        const { processarNoMenu } = await import("./fluxosMenu");
        await processarNoMenu(execucaoId);
        return;
      }
    }
  } catch (e: any) {
    console.error(`[Fluxos] Erro ao processar execução ${execucaoId}:`, e);
    await updateFluxoExecucao(execucaoId, { status: "erro", erroMsg: String(e?.message ?? e) });
  }
}

async function avancar(execucaoId: number, proximoNoOrdem: number | null, profundidade: number): Promise<void> {
  if (proximoNoOrdem === null) {
    await updateFluxoExecucao(execucaoId, { status: "concluido", concluidoEm: new Date() });
    return;
  }
  await irParaOrdem(execucaoId, proximoNoOrdem, profundidade);
}

async function irParaOrdem(execucaoId: number, ordem: number, profundidade: number): Promise<void> {
  const execucao = await getFluxoExecucaoById(execucaoId);
  if (!execucao) return;
  const proximoNo = await getFluxoNoByOrdem(execucao.fluxoId, ordem);
  if (!proximoNo) {
    await updateFluxoExecucao(execucaoId, { status: "concluido", concluidoEm: new Date() });
    return;
  }
  await updateFluxoExecucao(execucaoId, { status: "ativo", noAtualOrdem: ordem });
  await processarPasso(execucaoId, profundidade + 1);
}

/**
 * Retoma o nó atual de uma execução "aguardando_resposta" com a
 * resposta do cliente já persistida em inbox_mensagens — chamado por
 * server/webhooks.ts assim que uma mensagem do cliente chega. Hoje só
 * o nó "menu" fica aguardando_resposta (v1 sem agente/assistente).
 */
export async function retomarNoAguardandoResposta(execucaoId: number): Promise<void> {
  const execucao = await getFluxoExecucaoById(execucaoId);
  if (!execucao) return;
  const no = await getFluxoNoByOrdem(execucao.fluxoId, execucao.noAtualOrdem);
  if (no?.tipo === "menu") {
    const { processarRespostaMenu } = await import("./fluxosMenu");
    await processarRespostaMenu(execucaoId);
  }
}

/**
 * Chamado pelo cron "retomar-fluxos" (server/_core/scheduler.ts, piso de ~5s) —
 * retoma execuções "pausado" com prazo vencido (nó "aguardar") e trata
 * por timeout as execuções "aguardando_resposta" (menu) que passaram
 * do diasTimeoutSemResposta sem o cliente responder.
 */
export async function retomarExecucoesPendentes(limite = 20): Promise<{ processadas: number; escaladasPorTimeout: number }> {
  const pendentes = await listFluxoExecucoesPausadasVencidas(limite);
  for (const execucao of pendentes) {
    // `noAtualOrdem` ainda aponta pro próprio nó "aguardar" (só o
    // status/prazo mudaram ao pausar) — chamar processarNo aqui re-
    // executaria o MESMO nó "aguardar" e pausaria de novo pra sempre,
    // sem nunca avançar. Tem que avançar direto pro próximo passo,
    // igual condicional/mensagem já fazem.
    const no = await getFluxoNoByOrdem(execucao.fluxoId, execucao.noAtualOrdem);
    if (no) {
      if (no.tipo === "aguardar") {
        const config = no.config as Extract<FluxoNoConfig, { valor: number; unidade: "segundos" | "minutos" | "horas" | "dias" }>;
        if (config.mostrarDigitando) {
          const msPorUnidade = { segundos: 1_000, minutos: 60_000, horas: 3_600_000, dias: 86_400_000 }[config.unidade];
          const segundos = Math.min(Math.max(1, Math.round((config.valor * msPorUnidade) / 1000)), DELAY_TYPING_MAX_SEGUNDOS);
          const variaveis = (execucao.variaveis as Record<string, string>) ?? {};
          await updateFluxoExecucao(execucao.id, { variaveis: { ...variaveis, [VARIAVEL_DELAY_TYPING]: String(segundos) } });
        }
      }
      await avancar(execucao.id, no.proximoNoOrdem, 0);
    }
  }

  const { listFluxoExecucoesAguardandoRespostaVencidas } = await import("./db");
  const vencidas = await listFluxoExecucoesAguardandoRespostaVencidas(limite);
  for (const { execucao, noTipo } of vencidas) {
    try {
      if (noTipo === "menu") {
        const { avancarMenuPorTimeout } = await import("./fluxosMenu");
        await avancarMenuPorTimeout(execucao.id);
      }
    } catch (e) {
      console.error(`[Fluxos] Erro ao tratar timeout da execução ${execucao.id} (${noTipo}):`, e);
    }
  }

  return { processadas: pendentes.length, escaladasPorTimeout: vencidas.length };
}
