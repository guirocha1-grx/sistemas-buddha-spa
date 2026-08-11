export type SyncStatus = "pending" | "running" | "success" | "error" | "skipped";

export type SyncStepKind = "inter" | "sicredi" | "caixa" | "mercadoPagoConta" | "mercadoPagoAdquirentes" | "comandaConsolidado" | "comandaItens" | "driveContas";

export type SyncUnit = {
  id: number;
  nome: string;
  interClientId?: string | null;
  interClientSecret?: string | null;
  interCertificado?: string | null;
  interChavePrivada?: string | null;
  sicrediClientId?: string | null;
  sicrediClientSecret?: string | null;
  sicrediCertificado?: string | null;
  sicrediChavePrivada?: string | null;
  mpAccessToken?: string | null;
};

export type SyncStep = {
  id: string;
  unidadeId: number;
  unidadeNome: string;
  category: "Contas Bancárias" | "Mercado Pago" | "Adquirentes" | "Google Drive / Comanda da Recepção";
  label: string;
  kind: SyncStepKind;
  status: SyncStatus;
  detail: string;
  error?: string;
};

const configured = (values: Array<string | null | undefined>) => values.every(Boolean);

function step(unidade: SyncUnit, category: SyncStep["category"], label: string, kind: SyncStepKind, available = true): SyncStep {
  return {
    id: `${unidade.id}-${kind}`,
    unidadeId: unidade.id,
    unidadeNome: unidade.nome,
    category,
    label,
    kind,
    status: available ? "pending" : "skipped",
    detail: available ? "Aguardando início" : "Integração não configurada para esta unidade",
  };
}

/** Monta o roteiro visível e garante que etapas sem credenciais não sejam disparadas. */
export function buildGlobalSyncPlan(unidades: SyncUnit[]): SyncStep[] {
  return [...unidades]
    .sort((a, b) => Number(/ribeir[aã]o|rbs/i.test(b.nome)) - Number(/ribeir[aã]o|rbs/i.test(a.nome)))
    .flatMap((unidade) => [
      step(unidade, "Contas Bancárias", "Conta corrente · Banco Inter", "inter", configured([unidade.interClientId, unidade.interClientSecret, unidade.interCertificado, unidade.interChavePrivada])),
      step(unidade, "Contas Bancárias", "Conta corrente · Sicredi", "sicredi", configured([unidade.sicrediClientId, unidade.sicrediClientSecret, unidade.sicrediCertificado, unidade.sicrediChavePrivada])),
      step(unidade, "Contas Bancárias", "Caixa físico · Google Sheets", "caixa"),
      step(unidade, "Mercado Pago", "Conta Mercado Pago · extrato", "mercadoPagoConta", Boolean(unidade.mpAccessToken)),
      step(unidade, "Adquirentes", "Mercado Pago · vendas aprovadas", "mercadoPagoAdquirentes", Boolean(unidade.mpAccessToken)),
      step(unidade, "Google Drive / Comanda da Recepção", "Comanda consolidada · recepção", "comandaConsolidado"),
      step(unidade, "Google Drive / Comanda da Recepção", "Comanda virtual · lançamentos", "comandaItens"),
      step(unidade, "Google Drive / Comanda da Recepção", "Contas bancárias → Drive", "driveContas"),
    ]);
}

export function getSyncProgress(steps: SyncStep[]) {
  if (steps.length === 0) return 0;
  return Math.round((steps.filter((item) => ["success", "error", "skipped"].includes(item.status)).length / steps.length) * 100);
}

export function getSyncSummary(steps: SyncStep[]) {
  return steps.reduce((summary, item) => {
    if (item.status === "success") summary.success += 1;
    if (item.status === "error") summary.error += 1;
    if (item.status === "skipped") summary.skipped += 1;
    return summary;
  }, { success: 0, error: 0, skipped: 0 });
}
