// Rotas de cron dos Fluxos de automação — registradas via botão admin
// (fluxos.registrarHeartbeat/registrarHeartbeatGatilhosAgendados, ver
// server/routers.ts) usando server/_core/heartbeat.ts, não no boot do
// servidor. Mesmo padrão de guarda de server/autoDeploy.ts
// (sdk.authenticateRequest(req).isCron).
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { retomarExecucoesPendentes, iniciarExecucaoFluxo } from "./fluxos";
import {
  existeConversaZapiComMensagemApos,
  existeFluxoExecucaoEmAndamento,
  getUltimaMensagemEnviadaEm,
  getUnidades,
  listConversasBuddhaMktSemAlerta,
  listConversasSemContatoHaDias,
  listFluxosPorGatilho,
  marcarBuddhaMktAlertado,
} from "./db";
import { sendTelegramParaRecepcao } from "./telegramApi";

const AVISO_10MIN_MS = 10 * 60 * 1000;

export function registerFluxosScheduledRoutes(app: Express) {
  app.post("/api/scheduled/retomar-fluxos", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) {
        return res.status(403).json({ error: "cron-only" });
      }
      const resultado = await retomarExecucoesPendentes();
      res.json({ ok: true, ...resultado });
    } catch (error) {
      console.error("[Fluxos] Erro no cron de retomada:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "erro desconhecido" });
    }
  });

  app.post("/api/scheduled/disparar-fluxos-agendados", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) {
        return res.status(403).json({ error: "cron-only" });
      }
      // Varre por unidade (fluxos são escopados por unidade) — pra cada
      // fluxo com gatilho "dias_sem_contato", busca conversas dessa
      // mesma unidade sem mensagem há N dias e inicia direto (não passa
      // pelo dispatcher genérico de fluxosGatilhos.ts, que só cobre os
      // gatilhos disparados a partir de um ponto de escrita — este é
      // varredura periódica, mesmo padrão do mobai-crm).
      // existeFluxoExecucaoEmAndamento evita duplicar se já tiver uma
      // execução em andamento pra essa conversa.
      const unidadesTodas = await getUnidades();
      let disparados = 0;
      for (const unidade of unidadesTodas) {
        const fluxosCandidatos = await listFluxosPorGatilho(unidade.id, "dias_sem_contato");
        for (const fluxo of fluxosCandidatos) {
          const config = fluxo.gatilhoConfig as { dias?: number } | null;
          const dias = config?.dias ?? 7;
          const conversas = await listConversasSemContatoHaDias(unidade.id, dias);
          for (const conversa of conversas) {
            try {
              const jaEmAndamento = await existeFluxoExecucaoEmAndamento(fluxo.id, conversa.id);
              if (jaEmAndamento) continue;
              await iniciarExecucaoFluxo(fluxo.id, conversa.id, conversa.clienteId);
              disparados++;
            } catch (e) {
              console.error(`[Fluxos] Erro ao iniciar fluxo ${fluxo.id} (dias_sem_contato) pra conversa ${conversa.id}:`, e);
            }
          }
        }
      }
      res.json({ ok: true, disparados });
    } catch (error) {
      console.error("[Fluxos] Erro no cron de gatilhos agendados:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "erro desconhecido" });
    }
  });

  app.post("/api/scheduled/alertar-buddha-mkt-sem-retorno", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) {
        return res.status(403).json({ error: "cron-only" });
      }
      // Varre conversas do roteador Buddha Mkt ainda não alertadas: se
      // passaram 10min desde o último envio nosso e o cliente não
      // seguiu o link pro WhatsApp real da unidade (nenhuma mensagem
      // nova na conversa Z-API do mesmo telefone desde então), avisa a
      // recepção pelo Telegram pra ligar. buddhaMktAlertadoEm marca a
      // conversa como já tratada — não repete o aviso a cada tick.
      const conversas = await listConversasBuddhaMktSemAlerta();
      let alertados = 0;
      for (const conversa of conversas) {
        try {
          const ultimoEnvio = await getUltimaMensagemEnviadaEm(conversa.id);
          if (!ultimoEnvio) continue;
          if (Date.now() - ultimoEnvio.getTime() < AVISO_10MIN_MS) continue;
          const seguiuOLink = await existeConversaZapiComMensagemApos(conversa.telefone, ultimoEnvio);
          if (seguiuOLink) {
            await marcarBuddhaMktAlertado(conversa.id);
            continue;
          }
          const nome = conversa.nomeContato || conversa.telefone;
          await sendTelegramParaRecepcao(
            `⚠️ Buddha Mkt: ${nome} (${conversa.telefone}) recebeu o disparo há mais de 10min e não escolheu unidade. Ligar pra atender.`,
          );
          await marcarBuddhaMktAlertado(conversa.id);
          alertados++;
        } catch (e) {
          console.error(`[Fluxos] Erro ao avaliar aviso Buddha Mkt (conversa ${conversa.id}):`, e);
        }
      }
      res.json({ ok: true, alertados });
    } catch (error) {
      console.error("[Fluxos] Erro no cron de aviso Buddha Mkt:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "erro desconhecido" });
    }
  });
}
