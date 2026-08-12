import type { SyncStep } from "./globalSyncPlan";

/**
 * Dispara a Conta Corrente Mercado Pago em segundo plano e mantém uma cadência
 * independente para as demais integrações. O polling do relatório pode levar
 * até dois minutos, mas não pode impedir a conclusão do painel global.
 */
export async function runGlobalSyncQueue(
  steps: SyncStep[],
  runStep: (step: SyncStep) => Promise<void>,
) {
  const mercadoPago = steps.filter((step) => step.kind === "mercadoPagoConta");
  const remaining = steps.filter((step) => step.kind !== "mercadoPagoConta");
  // A execução fica observável no painel, porém não faz o fluxo global aguardar
  // o relatório assíncrono do Mercado Pago para finalizar as outras fontes.
  void Promise.allSettled(mercadoPago.map(runStep));

  const remainingTask = (async () => {
    for (const step of remaining) await runStep(step);
  })();

  await remainingTask;
}
