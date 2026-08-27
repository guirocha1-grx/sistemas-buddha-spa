import { z } from "zod";

export const SUGESTAO_PROXIMO_ATENDIMENTO_SCHEMA = z.object({
  dataAtendimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  horario: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  servicoNome: z.string().trim().min(2).max(250).nullable(),
  confianca: z.number().int().min(0).max(100),
  justificativa: z.string().trim().min(1).max(500),
});

export type SugestaoProximoAtendimento = z.infer<typeof SUGESTAO_PROXIMO_ATENDIMENTO_SCHEMA>;

/**
 * A IA apenas preenche a prévia editável. Este redutor impede que respostas
 * incompletas ou fora do formato esperado sejam persistidas por engano.
 */
export function normalizarSugestaoProximoAtendimento(conteudo: string | null | undefined): SugestaoProximoAtendimento {
  if (!conteudo) throw new Error("A IA não retornou uma sugestão estruturada");
  let bruto: unknown;
  try {
    bruto = JSON.parse(conteudo);
  } catch {
    throw new Error("A IA retornou uma sugestão em formato inválido");
  }
  const resultado = SUGESTAO_PROXIMO_ATENDIMENTO_SCHEMA.safeParse(bruto);
  if (!resultado.success) throw new Error("A IA retornou uma sugestão em formato inválido");
  return resultado.data;
}
