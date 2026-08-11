import type { SyncStep } from "./globalSyncPlan";

/**
 * Dispara os relatórios Mercado Pago imediatamente e mantém uma cadência
 * independente para as demais integrações. Assim, o polling de até dois
 * minutos do relatório não atrasa Inter, Sicredi, Caixa ou Comanda.
 */
export async function runGlobalSyncQueue(
  steps: SyncStep[],
  runStep: (step: SyncStep) => Promise<void>,
) {
  const mercadoPago = steps.filter((step) => step.kind === "mercadoPagoConta");
  const remaining = steps.filter((step) => step.kind !== "mercadoPagoConta");
  const mercadoPagoTasks = mercadoPago.map(runStep);

  const remainingTask = (async () => {
    for (const step of remaining) await runStep(step);
  })();

  await Promise.all([...mercadoPagoTasks, remainingTask]);
}
