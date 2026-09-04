import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formata telefone pro padrão "+55 (16) 9 9393-8308" (mesmo formato do
 * mobai-crm). Cobre com/sem DDI 55, celular (9 dígitos) e fixo (8).
 * Sem match nos formatos esperados, devolve a string original.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4), p1 = digits.slice(4, 5), p2 = digits.slice(5, 9), p3 = digits.slice(9);
    return `+55 (${ddd}) ${p1} ${p2}-${p3}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4), p1 = digits.slice(4, 8), p2 = digits.slice(8);
    return `+55 (${ddd}) ${p1}-${p2}`;
  }
  if (digits.length === 11) {
    const ddd = digits.slice(0, 2), p1 = digits.slice(2, 3), p2 = digits.slice(3, 7), p3 = digits.slice(7);
    return `+55 (${ddd}) ${p1} ${p2}-${p3}`;
  }
  if (digits.length === 10) {
    const ddd = digits.slice(0, 2), p1 = digits.slice(2, 6), p2 = digits.slice(6);
    return `+55 (${ddd}) ${p1}-${p2}`;
  }
  return raw;
}

/** Dias corridos desde uma data "AAAA-MM-DD" até hoje — null se não houver data. */
export function diasDesde(data: string | null | undefined): number | null {
  if (!data) return null;
  const referencia = new Date(`${data}T00:00:00`);
  if (Number.isNaN(referencia.getTime())) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diffMs = hoje.getTime() - referencia.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Duas opções de gênero pra preferência de terapeuta (2026-09-04) — id
 * sintético negativo, mesmo padrão já usado pra lead sem belleId real
 * (nunca colide com id de terapeuta de verdade, que é sempre positivo).
 * Ficam só na lista de preferência: não são linha na tabela `terapeutas`,
 * então não aparecem no diálogo de "Chamar terapeuta" nem entram no nome
 * da mensagem de chamado.
 */
export const OPCOES_GENERO_PREFERENCIA_TERAPEUTA = [
  { id: -1, nomeAbreviado: "Terapeuta Mulher", nomeCompleto: "Terapeuta Mulher" },
  { id: -2, nomeAbreviado: "Terapeuta Homem", nomeCompleto: "Terapeuta Homem" },
];

/**
 * Monta a lista de opções pra selecionar preferência de terapeuta: remove o
 * terapeuta curinga "Pendente de sorteio" (não faz sentido como preferência)
 * e acrescenta as opções de gênero acima.
 */
export function opcoesPreferenciaTerapeuta<T extends { nomeCompleto: string }>(terapeutas: T[]) {
  return [
    ...terapeutas.filter((t) => t.nomeCompleto !== "Pendente de sorteio"),
    ...OPCOES_GENERO_PREFERENCIA_TERAPEUTA,
  ];
}
