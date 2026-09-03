export type SyncStatus = "pending" | "running" | "background" | "success" | "error" | "skipped";

export type SyncStepKind = "inter" | "sicredi" | "caixa" | "mercadoPagoConta" | "mercadoPagoAdquirentes" | "comandaItens" | "driveContas";

export type SyncUnit = {
  id: number;
  nome: string;
  slug?: string;
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

/**
 * Monta o roteiro visível e garante que etapas sem credenciais não
 * sejam disparadas.
 *
 * "Buddha Mkt" (slug sintética "buddha-mkt", ver getOrCreateUnidadeBuddhaMkt
 * em server/db.ts) é usada só pra disparos de WhatsApp Marketing — não
 * tem conta bancária, Comanda nem adquirente próprios, então nunca
 * entra no roteiro de sincronização (2026-08-17).
 *
 * Sicredi fica fora do roteiro por ora — API ainda em fase final de
 * teste, sem liberação (2026-08-17). Reativar trocando o "false" pela
 * checagem de credenciais (linha comentada abaixo) quando a API for
 * liberada.
 */
export function buildGlobalSyncPlan(unidades: SyncUnit[]): SyncStep[] {
  return unidades
    .filter((unidade) => unidade.slug !== "buddha-mkt")
    .sort((a, b) => Number(/ribeir[aã]o|rbs/i.test(b.nome)) - Number(/ribeir[aã]o|rbs/i.test(a.nome)))
    .flatMap((unidade) => [
      step(unidade, "Contas Bancárias", "Conta Corrente Mercado Pago", "mercadoPagoConta", Boolean(unidade.mpAccessToken)),
      step(unidade, "Contas Bancárias", "Conta corrente · Banco Inter", "inter", configured([unidade.interClientId, unidade.interClientSecret, unidade.interCertificado, unidade.interChavePrivada])),
      // Sicredi oculto por enquanto — API ainda não liberada (ver comentário acima).
      // step(unidade, "Contas Bancárias", "Conta corrente · Sicredi", "sicredi", configured([unidade.sicrediClientId, unidade.sicrediClientSecret, unidade.sicrediCertificado, unidade.sicrediChavePrivada])),
      step(unidade, "Contas Bancárias", "Caixa físico · Google Sheets", "caixa"),
      step(unidade, "Adquirentes", "Mercado Pago · vendas aprovadas", "mercadoPagoAdquirentes", Boolean(unidade.mpAccessToken)),
      step(unidade, "Google Drive / Comanda da Recepção", "Comanda virtual · lançamentos", "comandaItens"),
      step(unidade, "Google Drive / Comanda da Recepção", "Contas bancárias → Drive", "driveContas"),
    ]);
}

export function getSyncProgress(steps: SyncStep[]) {
  if (steps.length === 0) return 0;
  return Math.round((steps.filter((item) => ["background", "success", "error", "skipped"].includes(item.status)).length / steps.length) * 100);
}

export function getSyncSummary(steps: SyncStep[]) {
  return steps.reduce((summary, item) => {
    if (item.status === "success") summary.success += 1;
    if (item.status === "error") summary.error += 1;
    if (item.status === "skipped") summary.skipped += 1;
    if (item.status === "background") summary.background += 1;
    return summary;
  }, { success: 0, error: 0, skipped: 0, background: 0 });
}
