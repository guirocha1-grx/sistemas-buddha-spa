/**
 * A confirmação de agendamento que o Belle manda por WhatsApp tem
 * formato fixo, sempre com o nome exato do cliente (o mesmo que vem
 * na próxima planilha importada) logo depois de "Olá,":
 *
 *   Confirmação de Agendamento - Buddha Spa
 *
 *   Olá, Priscila Paiva ✨
 *   Seu agendamento na unidade ...
 *
 * Extrai esse nome pra usar como nomeContato de conversas @lid ainda
 * não identificadas (server/webhooks.ts) — só melhora a exibição no
 * Inbox enquanto o telefone real não é resolvido, não vincula cliente
 * nenhum sozinho (isso continua exigindo telefone batendo ou ação
 * manual, "automação só com certeza").
 *
 * Faixa À-ÿ (Latin-1 Supplement) cobre os acentos do português sem
 * precisar de \u{...}/flag "u" (gotcha já documentado nesta sessão —
 * não usar escape Unicode de code point, o alvo de compilação do
 * projeto não suporta).
 */
const REGEX_NOME_CONFIRMACAO = /Ol[áa],\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'.\s-]*[A-Za-zÀ-ÿ.])/;

export function extrairNomeConfirmacaoBelle(texto: string | undefined | null): string | undefined {
  if (!texto || !texto.includes("Agendamento")) return undefined;
  const match = texto.match(REGEX_NOME_CONFIRMACAO);
  const nome = match?.[1]?.trim();
  return nome && nome.length >= 2 ? nome : undefined;
}

export interface AgendamentoConfirmacaoBelle {
  nome?: string;
  servicoNome?: string;
  dataAtendimento: string; // AAAA-MM-DD
  horario: string; // HH:MM
}

const REGEX_SERVICO_CONFIRMACAO = /para o servi[çc]o\s+(.+?)\s+est[áa] marcado para:/i;
const REGEX_DATA_CONFIRMACAO = /📅\s*(\d{2})\/(\d{2})\/(\d{4})/;
const REGEX_HORARIO_CONFIRMACAO = /🕒\s*(\d{1,2}:\d{2})/;

/**
 * Extrai data/horário/serviço/nome da confirmação de agendamento fixa do
 * Belle (mesmo template documentado acima) — usada pra registrar um
 * agendamento "visto" na conversa mesmo antes da próxima planilha
 * importada trazer o dado oficial (ver server/webhooks.ts, gatilho no
 * fromMe). Só retorna algo quando 📅 e 🕒 aparecem — sem os dois não dá
 * pra montar uma linha útil de agendamento, mesmo sabendo o nome.
 */
export function extrairAgendamentoConfirmacaoBelle(texto: string | undefined | null): AgendamentoConfirmacaoBelle | undefined {
  if (!texto || !texto.includes("Agendamento")) return undefined;
  const dataMatch = texto.match(REGEX_DATA_CONFIRMACAO);
  const horarioMatch = texto.match(REGEX_HORARIO_CONFIRMACAO);
  if (!dataMatch || !horarioMatch) return undefined;
  const [, dia, mes, ano] = dataMatch;
  return {
    nome: extrairNomeConfirmacaoBelle(texto),
    servicoNome: texto.match(REGEX_SERVICO_CONFIRMACAO)?.[1]?.trim(),
    dataAtendimento: `${ano}-${mes}-${dia}`,
    horario: horarioMatch[1],
  };
}
