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

/** Identifica casos que não devem depender de uma escolha de especialista pela IA. */
export function motivoEscalonamentoHumano(texto: string): string | null {
  const normalizado = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(humano|atendente|pessoa de verdade)\b/.test(normalizado)) return "solicitação explícita de atendimento humano";
  if (/\b(reclamacao|reclamar|insatisfacao|procon|advogado|processo)\b/.test(normalizado)) return "reclamação ou questão jurídica";
  if (/\b(ameaca|ameacar|ameaçou|ameaçando|assedio|constrangimento|violencia)\b/.test(normalizado)) return "situação sensível ou potencialmente insegura";
  if (/\b(nota fiscal|recibo fiscal)\b/.test(normalizado)) return "solicitação fiscal para a recepção";
  return null;
}

/**
 * Extrai intenções explícitas na ordem comercial: explicar valor percebido,
 * informar preço e só então concluir agendamento ou emissão. Isso evita que
 * “quero agendar, quanto custa a massagem?” pule direto para a reserva.
 */
export function rotasDeterministicas(texto: string): Array<ChaveAgente | "humano"> {
  const normalizado = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (motivoEscalonamentoHumano(texto)) return ["humano"];
  const explicacoes: ChaveAgente[] = [];
  const transacoes: ChaveAgente[] = [];
  const mencionaTerapia = /\b(massagem|massagens|terapia|terapias|shiatsu|relaxante|drenagem|ayurvedica|reflexologia|candle|estetica)\b/.test(normalizado);
  const mencionaDaySpa = /\b(day spa|mini day|day spa prime|banheira|sala de casal|wellhub|totalpass|gympass|estrutura)\b/.test(normalizado);
  const pedeExplicacao = /\b(como funciona|como e|o que e|o que esta incluso|qual a diferenca|quais|explica|explicar|entender|indicad[ao]|benefici[oa]|serve para|regras|informacoes|informacao|duvida|duvidas)\b/.test(normalizado);
  if (mencionaTerapia && pedeExplicacao) explicacoes.push("bianca");
  const mencionaVoucher = /\b(voucher|vale presente|cartao presente|presentear|presente)\b/.test(normalizado);
  const possuiVoucherExistente = mencionaVoucher && (
    /\b(ja|tenho|possuo|ganhei|recebi|usar|utilizar|agendar|marcar)\b[^.!?\n]{0,50}\b(voucher|vale presente|cartao presente)\b/.test(normalizado)
    || /\b(voucher|vale presente|cartao presente)\b[^.!?\n]{0,50}\b(ja|tenho|possuo|ganhei|recebi|usar|utilizar|agendar|marcar)\b/.test(normalizado)
  );
  const perguntaVoucher = mencionaVoucher && (
    pedeExplicacao
    || /\b(fisico|virtual|validade|receber|recebimento|entrega|regras|trabalham|aceitam|oferecem)\b/.test(normalizado)
  );
  const querEmitirVoucher = !possuiVoucherExistente && /\b(emitir|emissao|gerar|comprar|adquirir|fazer|presentear)\b/.test(normalizado) && mencionaVoucher;
  if (perguntaVoucher) explicacoes.push("diana");
  if (mencionaDaySpa && (pedeExplicacao || !/\b(preco|precos|valor|valores|quanto custa|agendar|agendamento|reservar|reserva|horario|horarios|disponibilidade|marcar)\b/.test(normalizado))) {
    explicacoes.push("fabricia");
  }

  const perguntaValor = /\b(preco|precos|valor|valores|quanto custa|promocao|promocoes|desconto|descontos|oferta|ofertas|combo|campanha)\b/.test(normalizado);
  if (perguntaValor) transacoes.push("estela");
  if (/\b(agendar|agendamento|reservar|reserva|horario|horarios|disponibilidade|marcar)\b/.test(normalizado) || possuiVoucherExistente) {
    transacoes.push("carol");
  }
  // Diana permanece uma única especialista: ela aparece primeiro quando a
  // dúvida é explicativa e volta ao fim somente para uma emissão explícita.
  if (querEmitirVoucher) transacoes.push("diana");

  // Prioridade comercial imutável: explicação do valor percebido, valor e
  // somente depois a transação. Remove duplicidade dentro de cada etapa, mas
  // preserva Diana no começo e no fim quando a mesma conversa exige ambos.
  return [...explicacoes, ...transacoes].filter((rota, indice, todas) => (
    rota !== "diana" || indice === todas.indexOf("diana") || indice === todas.lastIndexOf("diana")
  ));
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
