/**
 * Fluxos de automação — gatilhos automáticos. Chamado a partir dos
 * pontos de escrita reais (mensagem recebida, cliente novo) e de um
 * cron diário (dias_sem_contato, ver server/_core/index.ts) — nunca
 * bloqueia a operação principal que disparou o gatilho, por isso é
 * sempre best-effort com try/catch por fluxo.
 *
 * Diferente do mobai-crm: sem o gatilho "mudanca_fase" (buddha-spa não
 * tem funil de vendas) — por isso todo call site já tem `conversaId`
 * em mãos, sem precisar resolver a partir do cliente.
 */
import type { FluxoGatilhoConfig } from "../drizzle/schema";
import { existeFluxoExecucaoEmAndamento, listFluxosPorGatilho } from "./db";

type GatilhoEvento = "mensagem_recebida" | "cliente_novo";

export async function dispararGatilhosFluxo(
  unidadeId: number,
  tipo: GatilhoEvento,
  params: { conversaId: number; clienteId?: number | null; canalCaptacao?: string },
): Promise<void> {
  let fluxosCandidatos;
  try {
    fluxosCandidatos = await listFluxosPorGatilho(unidadeId, tipo);
  } catch (e) {
    console.error(`[FluxosGatilhos] Erro ao buscar fluxos com gatilho "${tipo}":`, e);
    return;
  }
  if (fluxosCandidatos.length === 0) return;

  for (const fluxo of fluxosCandidatos) {
    try {
      if (!gatilhoConfigCombina(tipo, fluxo.gatilhoConfig, params)) continue;
      const jaEmAndamento = await existeFluxoExecucaoEmAndamento(fluxo.id, params.conversaId);
      if (jaEmAndamento) continue;
      const { iniciarExecucaoFluxo } = await import("./fluxos");
      await iniciarExecucaoFluxo(fluxo.id, params.conversaId, params.clienteId);
    } catch (e) {
      console.error(`[FluxosGatilhos] Erro ao iniciar fluxo ${fluxo.id} (gatilho "${tipo}") pra conversa ${params.conversaId}:`, e);
    }
  }
}

function gatilhoConfigCombina(
  tipo: GatilhoEvento,
  config: FluxoGatilhoConfig | null | undefined,
  params: { canalCaptacao?: string },
): boolean {
  switch (tipo) {
    case "cliente_novo": {
      const cfg = config as Extract<FluxoGatilhoConfig, { canalCaptacao?: string }> | null | undefined;
      if (!cfg?.canalCaptacao) return true; // sem filtro configurado = qualquer canal
      return cfg.canalCaptacao === params.canalCaptacao;
    }
    case "mensagem_recebida":
      return true; // v1 sem filtro extra
  }
}
