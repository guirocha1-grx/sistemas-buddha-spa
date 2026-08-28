export const INTENCOES_ATENDIMENTO = [
  "informacao_terapia",
  "day_spa_e_estrutura",
  "voucher",
  "preco_e_condicoes",
  "agendamento",
  "pagamento_e_comprovante",
  "cadastro_documentos",
  "saudacao",
  "pos_atendimento",
  "pesquisa_satisfacao_belle",
  "atendimento_humano",
  "fora_do_escopo",
  "sem_intencao_clara",
] as const;

export type IntencaoAtendimento = (typeof INTENCOES_ATENDIMENTO)[number];

type MensagemContexto = {
  direcao: string;
  conteudo?: string | null;
  transcricao?: string | null;
};

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function textoMensagem(mensagem: MensagemContexto | undefined) {
  return mensagem ? (mensagem.transcricao || mensagem.conteudo || "") : "";
}

export function intencaoAtendimentoValida(valor: unknown): IntencaoAtendimento | null {
  return typeof valor === "string" && (INTENCOES_ATENDIMENTO as readonly string[]).includes(valor)
    ? valor as IntencaoAtendimento
    : null;
}

export function rotuloIntencaoAtendimento(intencao: string | null | undefined) {
  const rotulos: Record<IntencaoAtendimento, string> = {
    informacao_terapia: "Informação sobre terapia",
    day_spa_e_estrutura: "Day Spa e informações gerais",
    voucher: "Voucher",
    preco_e_condicoes: "Valor e condição comercial",
    agendamento: "Agendamento",
    pagamento_e_comprovante: "Pagamento ou comprovante",
    cadastro_documentos: "Cadastro e documentos",
    saudacao: "Saudação inicial",
    pos_atendimento: "Pós-atendimento",
    pesquisa_satisfacao_belle: "Pesquisa de satisfação Belle",
    atendimento_humano: "Atendimento humano",
    fora_do_escopo: "Fora do escopo",
    sem_intencao_clara: "Sem intenção clara",
  };
  const chave = intencaoAtendimentoValida(intencao);
  return chave ? rotulos[chave] : null;
}

/**
 * A avaliação é reconhecida pelo convite anterior enviado pela equipe/Belle,
 * não pelo texto curto de nota. Isso evita confundir "10 - Excelente" com
 * uma solicitação comercial e preserva qualquer formato de resposta aceito
 * pelo Belle nas duas etapas da pesquisa.
 */
export function detectarPesquisaSatisfacaoBelle(mensagens: readonly MensagemContexto[]) {
  const ultimoConviteEquipe = [...mensagens].reverse().find((mensagem) => mensagem.direcao !== "recebida");
  const convite = normalizar(textoMensagem(ultimoConviteEquipe));
  if (/como foi sua experiencia buddha spa\??/.test(convite)) {
    return { intencao: "pesquisa_satisfacao_belle" as const, detalhe: "avaliação da experiência geral" };
  }
  if (/como foi o atendimento do nosso profissional\??/.test(convite)) {
    return { intencao: "pesquisa_satisfacao_belle" as const, detalhe: "avaliação do profissional" };
  }
  return null;
}

/** Casos previsíveis que não são atendimento de cliente e não devem consumir os especialistas. */
export function detectarForaDoEscopo(texto: string) {
  const valor = normalizar(texto);
  if (/\b(curriculo|curriculum|vaga|oportunidade de trabalho|contratacao|contratação)\b/.test(valor)) {
    return "currículo, candidatura ou recrutamento";
  }
  if (/\b(agencia|agência|trafego pago|tráfego pago|gestao de redes|gestão de redes|marketing digital|prospeccao|prospecção)\b/.test(valor)
    && /\b(divulgacao|divulgação|vendas|leads|clientes|anuncio|anúncio|campanha)\b/.test(valor)) {
    return "oferta de serviço B2B ou marketing";
  }
  if (/\b(parceria comercial|fornecedor|representante comercial|solucao para sua empresa|solução para sua empresa)\b/.test(valor)) {
    return "proposta comercial externa";
  }
  if (/\b(cassino|aposta|bitcoin|criptomoeda|emprestimo|empréstimo)\b/.test(valor)) {
    return "spam ou oferta financeira externa";
  }
  return null;
}

export function intencaoDaRotaDeterministica(rota: string | null, texto: string): IntencaoAtendimento | null {
  if (!rota) return null;
  const valor = normalizar(texto);
  if (rota === "bianca") return "informacao_terapia";
  if (rota === "fabricia") return "day_spa_e_estrutura";
  if (rota === "estela") return "preco_e_condicoes";
  if (rota === "carol") return "agendamento";
  if (rota === "diana") return "voucher";
  if (rota === "humano") return "atendimento_humano";
  if (/\b(oi|ola|bom dia|boa tarde|boa noite)\b/.test(valor)) return "saudacao";
  return null;
}
