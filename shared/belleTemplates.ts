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
