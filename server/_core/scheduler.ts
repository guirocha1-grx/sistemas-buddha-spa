// Agendador em processo — substitui o Heartbeat da Manus (que chamava de
// volta rotas HTTP autenticadas via /api/scheduled/*). Cada tarefa roda
// direto dentro deste mesmo processo Node, sem round-trip de rede nem
// identidade especial de cron. Expressões cron mantidas idênticas às
// registradas antes no Heartbeat (6 campos com segundos, UTC).
import cron from "node-cron";
import { retomarFluxosPendentes, dispararFluxosAgendados, alertarBuddhaMktSemRetorno } from "../fluxosScheduled";
import { executarEtapaSincronizacaoDiaria, enviarRelatorioDiario, ETAPAS_AGENDADAS } from "../dailySyncReport";

function schedule(nome: string, expressao: string, tarefa: () => Promise<unknown>) {
  cron.schedule(expressao, async () => {
    try {
      await tarefa();
    } catch (error) {
      console.error(`[Scheduler] Falha em "${nome}":`, error);
    }
  }, { timezone: "UTC" });
}

export function registerScheduledJobs() {
  schedule("retomar-fluxos", "0 * * * * *", retomarFluxosPendentes);
  schedule("disparar-fluxos-agendados", "0 0 6 * * *", dispararFluxosAgendados);
  schedule("alertar-buddha-mkt-sem-retorno", "0 * * * * *", alertarBuddhaMktSemRetorno);

  for (const { chave, minuto } of ETAPAS_AGENDADAS) {
    schedule(`sync-diaria-${chave}`, `0 ${minuto} 10 * * *`, () => executarEtapaSincronizacaoDiaria(chave));
  }
  schedule("relatorio-sincronizacao-diaria", "0 20 10 * * *", enviarRelatorioDiario);

  console.log(`[Scheduler] ${3 + ETAPAS_AGENDADAS.length + 1} tarefas agendadas em processo.`);
}
