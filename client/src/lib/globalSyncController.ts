import type { SyncStep } from "./globalSyncPlan";

export type GlobalSyncState = { isOpen: boolean; isMinimized: boolean; isRunning: boolean; steps: SyncStep[] };

export const initialGlobalSyncState: GlobalSyncState = { isOpen: false, isMinimized: false, isRunning: false, steps: [] };

export type GlobalSyncAction =
  | { type: "prepare" | "start"; steps: SyncStep[] }
  | { type: "updateStep"; id: string; patch: Partial<SyncStep> }
  | { type: "minimize" | "restore" | "complete" | "close" | "restartErrors" };

export function globalSyncReducer(state: GlobalSyncState, action: GlobalSyncAction): GlobalSyncState {
  if (action.type === "prepare") return { isOpen: true, isMinimized: false, isRunning: false, steps: action.steps };
  if (action.type === "start") return { isOpen: true, isMinimized: false, isRunning: true, steps: action.steps };
  if (action.type === "restartErrors") return {
    ...state,
    isOpen: true,
    isMinimized: false,
    isRunning: true,
    // "mercadoPagoConta" roda em segundo plano (Promise.allSettled, fora da
    // fila sequencial de runGlobalSyncQueue) e nunca entra na lista de
    // `falhas` que `start()` usa pra decidir o que retomar — se resetássemos
    // pra "pending" aqui, ela ficaria travada pra sempre (nada nunca a
    // retentaria), prendendo `finished` em false indefinidamente. Deixa como
    // "error" mesmo: um clique manual em "Sincronizar erros" ainda a pega
    // (retryErrors lê o status atual), e runGlobalSyncQueue sabe disparar
    // esse kind em segundo plano de novo.
    steps: state.steps.map((item) => item.status === "error" && item.kind !== "mercadoPagoConta" ? { ...item, status: "pending", detail: "Aguardando nova tentativa", error: undefined } : item),
  };
  if (action.type === "updateStep") return { ...state, steps: state.steps.map((item) => item.id === action.id ? { ...item, ...action.patch } : item) };
  if (action.type === "minimize") return state.isRunning ? { ...state, isMinimized: true } : state;
  if (action.type === "restore") return { ...state, isOpen: true, isMinimized: false };
  if (action.type === "complete") return { ...state, isRunning: false, isMinimized: false, isOpen: true };
  return state.isRunning ? state : { ...state, isOpen: false, isMinimized: false };
}
