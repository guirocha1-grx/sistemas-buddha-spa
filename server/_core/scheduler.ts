// Agendador em processo — substitui o Heartbeat da Manus (que chamava de
// volta rotas HTTP autenticadas via /api/scheduled/*). Cada tarefa roda
// direto dentro deste mesmo processo Node, sem round-trip de rede nem
// identidade especial de cron. Expressões cron mantidas idênticas às
// registradas antes no Heartbeat (6 campos com segundos, UTC).
import cron from "node-cron";
import { retomarFluxosPendentes, dispararFluxosAgendados, alertarBuddhaMktSemRetorno } from "../fluxosScheduled";
import { executarEtapaSincronizacaoDiaria, enviarRelatorioDiario, ETAPAS_AGENDADAS } from "../dailySyncReport";
import { processarAgrupamentosProntos } from "../agentesAgrupamento";
import { verificarQualidadeAgentes } from "../agentesQualidadeAlerta";

/**
 * O TiDB é compartilhado entre Railway e desenvolvimento. Tarefas que
 * acionam Fluxos, Z-API ou sincronizações só podem rodar na produção.
 */
export function deveRegistrarTarefasAgendadas(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production";
}

function schedule(nome: string, expressao: string, tarefa: () => Promise<unknown>) {
  // Guarda contra sobreposição: sem isso, se uma execução ainda estiver
  // rodando quando o próximo tick disparar (lote grande, Z-API lenta),
  // as duas rodadas pegam as MESMAS execuções "pausado" pendentes (a
  // leitura não trava a linha) e processam cada uma duas vezes — foi
  // isso que gerou mensagens duplicadas de Fluxos em produção.
  let emExecucao = false;
  cron.schedule(expressao, async () => {
    if (emExecucao) {
      console.warn(`[Scheduler] "${nome}" ainda rodando da execução anterior — pulando este tick.`);
      return;
    }
    emExecucao = true;
    try {
      await tarefa();
    } catch (error) {
      console.error(`[Scheduler] Falha em "${nome}":`, error);
    } finally {
      emExecucao = false;
    }
  }, { timezone: "UTC" });
}

export function registerScheduledJobs() {
  // A cada 5s (não mais a cada minuto): um "aguardar" de poucos segundos
  // configurado num Fluxo ficava esperando até ~1min pelo próximo tick do
  // cron pra retomar (ex.: 3s configurados viravam ~40s reais). node-cron
  // aceita segundos no cron de 6 campos — sem limitação da Manus/Heartbeat
  // aqui, e a guarda contra sobreposição em schedule() torna esse
  // intervalo curto seguro mesmo se um lote demorar mais que 5s.
  schedule("retomar-fluxos", "*/5 * * * * *", retomarFluxosPendentes);
  // O banco decide o vencimento do bloco. O tick curto só descobre quem
  // ficou 10s em silêncio, sem guardar timeout em memória do processo.
  schedule("agrupar-mensagens-agentes", "*/1 * * * * *", processarAgrupamentosProntos);
  schedule("disparar-fluxos-agendados", "0 0 6 * * *", dispararFluxosAgendados);
  schedule("alertar-buddha-mkt-sem-retorno", "0 * * * * *", alertarBuddhaMktSemRetorno);
  // A cada 4h: pega sugestão repetida na mesma conversa ou taxa de reprovação
  // subindo sem depender de alguém da recepção notar e avisar dias depois
  // (ver análise de evolução dos agentes, 30/08).
  schedule("alertar-qualidade-agentes", "0 0 */4 * * *", verificarQualidadeAgentes);

  for (const { chave, minuto } of ETAPAS_AGENDADAS) {
    schedule(`sync-diaria-${chave}`, `0 ${minuto} 10 * * *`, () => executarEtapaSincronizacaoDiaria(chave));
  }
  schedule("relatorio-sincronizacao-diaria", "0 20 10 * * *", enviarRelatorioDiario);

  console.log(`[Scheduler] ${5 + ETAPAS_AGENDADAS.length + 1} tarefas agendadas em processo.`);
}
