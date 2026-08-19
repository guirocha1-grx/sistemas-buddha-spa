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

/**
 * Extrai intenções explícitas na ordem comercial: explicar valor percebido,
 * informar preço e só então concluir agendamento ou emissão. Isso evita que
 * “quero agendar, quanto custa a massagem?” pule direto para a reserva.
 */
export function rotasDeterministicas(texto: string): Array<ChaveAgente | "humano"> {
  const normalizado = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(humano|atendente|pessoa de verdade|reclamacao|reclamar|procon|advogado|processo|nota fiscal|recibo fiscal)\b/.test(normalizado)) return ["humano"];
  const rotas: ChaveAgente[] = [];
  if (/\b(massagem|massagens|terapia|terapias|shiatsu|relaxante|drenagem|ayurvedica|reflexologia|candle|estetica)\b/.test(normalizado)) rotas.push("bianca");
  if (/\b(day spa|mini day|day spa prime|banheira|sala de casal|wellhub|totalpass|gympass|estrutura)\b/.test(normalizado)) rotas.push("fabricia");
  const mencionaVoucher = /\b(voucher|vale presente|cartao presente|presentear|presente)\b/.test(normalizado);
  const querEmitirVoucher = /\b(emitir|emissao|gerar|comprar|adquirir|fazer)\b/.test(normalizado) && mencionaVoucher;
  if (mencionaVoucher) rotas.push("diana");
  if (/\b(preco|precos|valor|valores|quanto custa|promocao|promocoes|desconto|descontos|oferta|ofertas|combo|campanha)\b/.test(normalizado)) rotas.push("estela");
  if (/\b(agendar|agendamento|reservar|reserva|horario|horarios|disponibilidade|marcar)\b/.test(normalizado)) rotas.push("carol");
  // Diana pode aparecer de novo no fim: primeiro explica voucher, depois de
  // preço/experiência a emissão é preparada sem atropelar as etapas anteriores.
  if (querEmitirVoucher && rotas.length > 1) rotas.push("diana");
  return rotas;
}

/** Detecta uma primeira mensagem cordial, curta e ainda sem demanda comercial. */
export function aberturaSemIntencao(texto: string): boolean {
  const normalizado = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  if (!normalizado || normalizado.length > 80 || rotasDeterministicas(texto).length > 0) return false;
  return /\b(oi|ola|bom dia|boa tarde|boa noite)\b/.test(normalizado);
}

/** Compatibilidade para chamadas que precisam apenas do primeiro destino. */
export function rotaDeterministica(texto: string): ChaveAgente | "humano" | null {
  return rotasDeterministicas(texto)[0] ?? null;
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
