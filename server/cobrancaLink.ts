import { z } from "zod";

export const EXTRACAO_COBRANCA_LINK_SCHEMA = z.object({
  titulo: z.string().max(200).nullable(),
  descricao: z.string().max(700).nullable(),
  valor: z.number().positive().nullable(),
  formaPagamentoMencionada: z.string().max(80).nullable(),
  confianca: z.number().int().min(0).max(100),
  justificativa: z.string().max(500),
});

export type ExtracaoCobrancaLink = z.infer<typeof EXTRACAO_COBRANCA_LINK_SCHEMA>;

/** A IA é uma sugestão; este limite impede mais de duas casas decimais. */
export function normalizarValorCobranca(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Aceita somente o JSON previsto. Valor nulo é o resultado obrigatório quando
 * a conversa não traz preço explícito, e não é convertido em estimativa.
 */
export function normalizarExtracaoCobrancaLink(conteudo: string | null | undefined): ExtracaoCobrancaLink {
  if (!conteudo) throw new Error("A IA não retornou uma sugestão estruturada");
  let bruto: unknown;
  try {
    bruto = JSON.parse(conteudo);
  } catch {
    throw new Error("A IA retornou uma sugestão em formato inválido");
  }
  const resultado = EXTRACAO_COBRANCA_LINK_SCHEMA.safeParse(bruto);
  if (!resultado.success) throw new Error("A IA retornou uma sugestão em formato inválido");
  return { ...resultado.data, valor: resultado.data.valor === null ? null : normalizarValorCobranca(resultado.data.valor) };
}
