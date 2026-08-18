const CHAVES_AGENTES = ["aurea", "bianca", "fabricia", "estela", "carol", "diana"] as const;
const STATUS_FINAIS = ["in_process", "success", "failure", "enviar_resumo_dayspa"] as const;
const MOTIVOS_AVALIACAO = ["informacao", "tom", "roteamento", "contexto", "comercial", "operacional", "outro"] as const;

export type ChaveAgente = (typeof CHAVES_AGENTES)[number];
export type StatusAgente = (typeof STATUS_FINAIS)[number] | ChaveAgente;
export type MotivoAvaliacao = (typeof MOTIVOS_AVALIACAO)[number];

/** Retorna o destino somente quando ele pertence ao catálogo de especialistas ativo. */
export function destinoEspecialistaValido(destino: unknown, chavesPermitidas: string[]): string | null {
  if (typeof destino !== "string") return null;
  return chavesPermitidas.includes(destino) ? destino : null;
}

export function statusAgenteValido(status: unknown): StatusAgente | null {
  if (typeof status !== "string") return null;
  return ([...CHAVES_AGENTES, ...STATUS_FINAIS] as string[]).includes(status) ? status as StatusAgente : null;
}

export function motivoAvaliacaoValido(motivo: unknown): MotivoAvaliacao | null {
  if (typeof motivo !== "string") return null;
  return (MOTIVOS_AVALIACAO as readonly string[]).includes(motivo) ? motivo as MotivoAvaliacao : null;
}

/** Protege o estado contra estruturas arbitrárias devolvidas pelo modelo. */
export function normalizarVariaveis(valor: unknown): Record<string, string | number | boolean | null> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  return Object.fromEntries(Object.entries(valor).filter(([, item]) => (
    item === null || typeof item === "string" || typeof item === "number" || typeof item === "boolean"
  )).slice(0, 30));
}

/** Gatilhos de segurança e rotas de intenção sem depender do modelo. */
export function rotaDeterministica(texto: string): ChaveAgente | "humano" | null {
  const normalizado = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(humano|atendente|pessoa de verdade|reclamacao|reclamar|procon|advogado|processo)\b/.test(normalizado)) return "humano";
  if (/\b(preco|precos|valor|valores|quanto custa|promocao|promocoes|desconto|descontos|oferta|ofertas|combo|campanha)\b/.test(normalizado)) return "estela";
  if (/\b(agendar|agendamento|reservar|reserva|horario|horarios|disponibilidade|marcar)\b/.test(normalizado)) return "carol";
  if (/\b(voucher|vale presente|cartao presente|presentear|presente)\b/.test(normalizado)) return "diana";
  if (/\b(day spa|mini day|day spa prime|banheira|sala de casal|wellhub|totalpass|gympass|estrutura)\b/.test(normalizado)) return "fabricia";
  if (/\b(massagem|terapia|shiatsu|relaxante|drenagem|ayurvedica|reflexologia|candle|estetica)\b/.test(normalizado)) return "bianca";
  return null;
}

/** A autorização explícita libera qualquer especialista; receptor, falhas e ações pendentes continuam protegidos. */
export function envioAutomaticoPermitido(chaveAgente: string, status: string, acaoPendente?: string | null): boolean {
  return chaveAgente !== "aurea" && !acaoPendente && status !== "failure";
}

/** Taxa usada para a decisão de maturidade; pendentes e automações não distorcem a avaliação humana. */
export function taxaAprovacaoHumana(aprovadas: number, reprovadas: number): number | null {
  const avaliadas = aprovadas + reprovadas;
  return avaliadas > 0 ? Math.round((aprovadas / avaliadas) * 100) : null;
}
