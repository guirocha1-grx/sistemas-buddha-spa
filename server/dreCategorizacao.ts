/**
 * Plano de contas do DRE + regras de categorização automática.
 *
 * Estrutura definida com o usuário em 2026-08-04, a partir da planilha
 * real de conciliação (Conciliação de contas PJ - Inter.xlsx) e de uma
 * estrutura de DRE completa que ele forneceu. Pontos que ficaram em
 * aberto pra retomar — NÃO têm regra automática aqui de propósito,
 * porque adivinhar errado nisso distorce o DRE:
 *
 * - Pronampe (empréstimo Sicredi): não decidido se separa juros de
 *   amortização ou lança tudo em "Juros + Multas".
 * - "Boleto Shopping" (Aluguel + Condomínio + IPTU, maior valor do
 *   DRE): não tenho o texto bruto real da contraparte no extrato pra
 *   montar uma regra seguro — fica pendente até eu ter um exemplo.
 * - Lavanderia vs Limpeza: hoje é um item só na planilha antiga
 *   ("Limpeza terceirizada e lavanderia"), precisa separar em duas
 *   contrapartes diferentes — ainda não sei distinguir uma da outra.
 * - "Bonificação Terapeutas (Líder técnico)" vs "Custos Terapeutas":
 *   não sei diferenciar no extrato ainda.
 * - "Taxas Diversas" (seção Impostos): não sei o que é, diferente de
 *   "Impostos diversos".
 * - Totalpass/Wellhub → "Parcerias Comerciais": mencionado no
 *   calendário de pagamentos, mas ainda não vi o texto bruto real da
 *   transação pra montar regra confiável.
 *
 * Todas essas categorias já existem no plano de contas abaixo (pra dar
 * pra categorizar manualmente), só não têm regra de match automático.
 *
 * "Receitas de Vendas" foi decidida em 2026-08-07 (áudio): composta por
 * 4 Descrições (Receita de Pix/Espécie/C. Débito/C. Crédito), atribuídas
 * de forma determinística a partir de adquirente_vendas (débito/crédito/
 * pix de máquina) e inter_extratos (Pix direto no banco, Caixa Físico) —
 * ver categorizarTransacaoAutomaticamente e classificarDescricaoAdquirente
 * em server/db.ts. Não vem mais do Belle.
 */

export type DreSecao =
  | "receitas"
  | "impostos"
  | "custos_diretos"
  | "despesas_pessoal"
  | "marketing"
  | "despesas_administrativas"
  | "despesas_financeiras"
  | "devolucoes"
  | "excluido";

export const EXCLUIDO_NOME = "Excluído do DRE";

export const DRE_CATEGORIAS_SEED: { nome: string; secao: DreSecao; ordem: number }[] = [
  // Receitas
  { nome: "Receitas de Vendas", secao: "receitas", ordem: 1 },
  { nome: "Parcerias Comerciais", secao: "receitas", ordem: 2 },
  { nome: "Receita de Vouchers", secao: "receitas", ordem: 3 },

  // Impostos
  { nome: "Impostos (DAS e demais Impostos)", secao: "impostos", ordem: 1 },
  { nome: "Taxas Diversas", secao: "impostos", ordem: 2 },

  // Custos Diretos
  { nome: "Bonificação Terapeutas (Líder técnico)", secao: "custos_diretos", ordem: 1 },
  { nome: "Compras de Materiais p/ Uso e Consumo", secao: "custos_diretos", ordem: 2 },
  { nome: "Compra de Cosméticos", secao: "custos_diretos", ordem: 3 },
  { nome: "Custos Terapeutas", secao: "custos_diretos", ordem: 4 },
  { nome: "DAS - Terapeutas", secao: "custos_diretos", ordem: 5 },
  { nome: "Descartáveis", secao: "custos_diretos", ordem: 6 },
  { nome: "Lavanderia", secao: "custos_diretos", ordem: 7 },
  { nome: "Produtos Adquiridos para Revenda", secao: "custos_diretos", ordem: 8 },
  { nome: "Taxa de Propaganda", secao: "custos_diretos", ordem: 9 },
  { nome: "Taxa de Royalties", secao: "custos_diretos", ordem: 10 },
  { nome: "Uniformes e Rouparia", secao: "custos_diretos", ordem: 11 },

  // Despesas com Pessoal
  { nome: "13º Salário", secao: "despesas_pessoal", ordem: 1 },
  { nome: "Contribuição Sindical", secao: "despesas_pessoal", ordem: 2 },
  { nome: "Exame Admissional / Demissional", secao: "despesas_pessoal", ordem: 3 },
  { nome: "Férias", secao: "despesas_pessoal", ordem: 4 },
  { nome: "FGTS", secao: "despesas_pessoal", ordem: 5 },
  { nome: "Impostos sobre folha", secao: "despesas_pessoal", ordem: 6 },
  { nome: "Rescisões", secao: "despesas_pessoal", ordem: 7 },
  { nome: "Salários e Adiantamentos", secao: "despesas_pessoal", ordem: 8 },
  { nome: "Benefícios (Vale transporte, Plano de saude, Vale Alimentação e Seguro de Vida)", secao: "despesas_pessoal", ordem: 9 },
  // Separado de "Salários e Adiantamentos" (CLT) porque tem regra
  // trabalhista diferente — decidido com o usuário em 2026-08-07.
  { nome: "Freelancers / Prestadores Autônomos", secao: "despesas_pessoal", ordem: 10 },

  // Marketing
  { nome: "Despesas com Marketing", secao: "marketing", ordem: 1 },

  // Despesas Administrativas
  { nome: "Água", secao: "despesas_administrativas", ordem: 1 },
  { nome: "Alimentação", secao: "despesas_administrativas", ordem: 2 },
  { nome: "Aluguel + Condomínio + IPTU", secao: "despesas_administrativas", ordem: 3 },
  { nome: "Consultoria / Assessoria / Contabilidade / Advocacia", secao: "despesas_administrativas", ordem: 4 },
  { nome: "Dedetização", secao: "despesas_administrativas", ordem: 5 },
  { nome: "Energia Elétrica e Gás (incluso boleto shopping)", secao: "despesas_administrativas", ordem: 6 },
  { nome: "Limpeza", secao: "despesas_administrativas", ordem: 7 },
  { nome: "Manutenções", secao: "despesas_administrativas", ordem: 8 },
  { nome: "Papelaria e Materiais Gráficos", secao: "despesas_administrativas", ordem: 9 },
  { nome: "Segurança e Seguros", secao: "despesas_administrativas", ordem: 10 },
  { nome: "Serviços de Manobrista / Vallet", secao: "despesas_administrativas", ordem: 11 },
  { nome: "Sistemas / Softwares", secao: "despesas_administrativas", ordem: 12 },
  { nome: "Telefonia/Internet", secao: "despesas_administrativas", ordem: 13 },
  { nome: "Transporte e Locomoção", secao: "despesas_administrativas", ordem: 14 },

  // Despesas Financeiras / Bancos
  { nome: "Juros + Multas", secao: "despesas_financeiras", ordem: 1 },
  { nome: "Rendimentos de Aplicações", secao: "despesas_financeiras", ordem: 2 },
  { nome: "Tarifas Bancárias", secao: "despesas_financeiras", ordem: 3 },
  { nome: "Taxa de Adquirência e Antecipações", secao: "despesas_financeiras", ordem: 4 },
  { nome: "Taxa de Parcerias", secao: "despesas_financeiras", ordem: 5 },

  // Devoluções
  { nome: "Devoluções de Compra de Mercadoria", secao: "devolucoes", ordem: 1 },
  { nome: "Devoluções de Compra de Ativo", secao: "devolucoes", ordem: 2 },
  { nome: "Devoluções de Compra de Serviços", secao: "devolucoes", ordem: 3 },

  // Excluído (não é receita/despesa real de DRE)
  { nome: EXCLUIDO_NOME, secao: "excluido", ordem: 1 },
];

// Chaves estáveis das Descrições especiais — o código interno (Comanda
// Recepção, classificação de adquirente, exclusão automática) sempre
// busca por uma dessas chaves, nunca pelo `nome` de exibição, que o
// usuário pode renomear livremente em Parâmetros sem quebrar nada
// (confirmado em 2026-08-07: renomeou "Receita C. Débito"/"Receita C.
// Crédito" pra "Receita Cartão de Débito"/"Receita Cartão de Crédito").
export const CHAVE_EXCLUIDO = "excluido";
export const CHAVE_RECEITA_PIX = "receita_pix";
export const CHAVE_RECEITA_ESPECIE = "receita_especie";
export const CHAVE_RECEITA_CARTAO_DEBITO = "receita_c_debito";
export const CHAVE_RECEITA_CARTAO_CREDITO = "receita_c_credito";
// "Líq." = o depósito no extrato bancário (Sicredi/Inter), valor líquido
// já descontada a taxa da adquirente — separado das duas acima (valor
// bruto da venda na maquininha, via adquirente_vendas), pra não misturar
// as duas coisas com o mesmo nome (2026-08-07: mesmo Descrição sendo
// usada pelos dois lados causava dupla contagem na Comanda Recepção).
export const CHAVE_RECEITA_LIQ_CARTAO_DEBITO = "receita_liq_c_debito";
export const CHAVE_RECEITA_LIQ_CARTAO_CREDITO = "receita_liq_c_credito";
// Transferência bancária real entre a conta de uma unidade e a de
// outra (ex.: RBS manda dinheiro pro SSU cobrir uma conta) — detectada
// por CNPJ (server/db.ts, categorizarTransacaoAutomaticamente), nunca
// afeta o DRE, e ao ser confirmada gera 1 linha em
// transacoes_entre_unidades (server/db.ts, confirmarSugestao).
export const CHAVE_TRANSACAO_ENTRE_UNIDADES = "transacao_entre_unidades";

/**
 * Descrições semeadas — o nível intermediário entre Categoria e
 * lançamento (ver server/db.ts: ensureDreSeed). Toda Descrição usada em
 * DRE_REGRAS_SEED abaixo precisa estar listada aqui, com a Categoria a
 * que pertence. Quando a Descrição tem o mesmo nome da Categoria (ex.:
 * "Sistemas / Softwares"), é porque essa Categoria ainda não foi
 * quebrada em Descrições mais específicas — fica um bucket genérico até
 * o usuário refinar em Parâmetros.
 *
 * As 5 com `chave` são especiais — Excluído do DRE e as 4 de "Receitas
 * de Vendas" (confirmadas pelo usuário em 2026-08-07, áudio), atribuídas
 * de forma determinística (não por regra de texto) — ver
 * categorizarTransacaoAutomaticamente e classificarDescricaoAdquirente
 * em server/db.ts. O `nome` delas pode mudar; a `chave` não.
 */
export const DRE_DESCRICOES_SEED: { nome: string; categoriaNome: string; chave?: string }[] = [
  { nome: "Sistemas / Softwares", categoriaNome: "Sistemas / Softwares" },
  { nome: "Yamada Contabilidade", categoriaNome: "Consultoria / Assessoria / Contabilidade / Advocacia" },
  { nome: "Herdade, Martini Advogados", categoriaNome: "Consultoria / Assessoria / Contabilidade / Advocacia" },
  { nome: "Benefícios (Vale transporte, Plano de saude, Vale Alimentação e Seguro de Vida)", categoriaNome: "Benefícios (Vale transporte, Plano de saude, Vale Alimentação e Seguro de Vida)" },
  { nome: "Contribuição Sindical", categoriaNome: "Contribuição Sindical" },
  { nome: "Juros + Multas", categoriaNome: "Juros + Multas" },
  { nome: EXCLUIDO_NOME, categoriaNome: EXCLUIDO_NOME, chave: CHAVE_EXCLUIDO },
  { nome: "Transação entre Unidades", categoriaNome: EXCLUIDO_NOME, chave: CHAVE_TRANSACAO_ENTRE_UNIDADES },
  { nome: "Parcerias Comerciais", categoriaNome: "Parcerias Comerciais" },
  { nome: "Totalpass", categoriaNome: "Parcerias Comerciais" },
  { nome: "Wellhub", categoriaNome: "Parcerias Comerciais" },
  { nome: "Limpeza", categoriaNome: "Limpeza" },
  { nome: "Lavanderia", categoriaNome: "Lavanderia" },
  { nome: "Receita de Pix", categoriaNome: "Receitas de Vendas", chave: CHAVE_RECEITA_PIX },
  { nome: "Receita em Espécie", categoriaNome: "Receitas de Vendas", chave: CHAVE_RECEITA_ESPECIE },
  { nome: "Receita Cartão de Débito", categoriaNome: "Receitas de Vendas", chave: CHAVE_RECEITA_CARTAO_DEBITO },
  { nome: "Receita Cartão de Crédito", categoriaNome: "Receitas de Vendas", chave: CHAVE_RECEITA_CARTAO_CREDITO },
  { nome: "Receita Líq. Cartão de Débito", categoriaNome: "Receitas de Vendas", chave: CHAVE_RECEITA_LIQ_CARTAO_DEBITO },
  { nome: "Receita Líq. Cartão de Crédito", categoriaNome: "Receitas de Vendas", chave: CHAVE_RECEITA_LIQ_CARTAO_CREDITO },
];

export interface DreRegraSeed {
  padrao: string;
  descricaoNome: string;
  valorMin?: number;
  valorMax?: number;
  alertaSeRepetirNoMes?: boolean;
}

/**
 * Regras conservadoras — só as que têm padrão de texto confirmado e
 * confiável. Confiança > cobertura: prefiro deixar "Pendente" (revisão
 * manual) a arriscar categorizar errado um valor grande. Toda
 * `descricaoNome` aqui precisa existir em DRE_DESCRICOES_SEED acima.
 */
export const DRE_REGRAS_SEED: DreRegraSeed[] = [
  { padrao: "Eleva", descricaoNome: "Sistemas / Softwares" },
  { padrao: "Belle", descricaoNome: "Sistemas / Softwares" },
  { padrao: "Mywork", descricaoNome: "Sistemas / Softwares" },
  { padrao: "YAMADA CONTABILIDADE", descricaoNome: "Yamada Contabilidade" },
  { padrao: "HERDADE, MARTINI", descricaoNome: "Herdade, Martini Advogados" },
  { padrao: "Caju", descricaoNome: "Benefícios (Vale transporte, Plano de saude, Vale Alimentação e Seguro de Vida)" },
  { padrao: "Sindicato", descricaoNome: "Contribuição Sindical" },
  // "Vanessa" é nome próprio genérico — funciona hoje (único Pix conhecido
  // com esse nome), mas reavaliar se aparecer outro "Vanessa" não
  // relacionado ao empréstimo.
  { padrao: "Vanessa", descricaoNome: "Juros + Multas" },
  { padrao: "Transferência", descricaoNome: EXCLUIDO_NOME },

  // Confirmada pelo usuário em 2026-08-05: "Pix recebido no Inter é
  // sempre receita" — a expressão só aparece nesse formato no
  // vocabulário do Inter (sync/PDF), fica naturalmente restrita a esse
  // canal (Pix via adquirente é tratado à parte, ver
  // classificarDescricaoAdquirente).
  { padrao: "Pix recebido", descricaoNome: "Receita de Pix" },
  { padrao: "voucher", descricaoNome: "Parcerias Comerciais" },
  { padrao: "convênio", descricaoNome: "Parcerias Comerciais" },
  { padrao: "Totalpass", descricaoNome: "Totalpass" },
  { padrao: "Wellhub", descricaoNome: "Wellhub" },
  // MDS Serviços Terceirizados: até R$1.600 é limpeza, acima é lavanderia
  // — mesma contraparte, categoria decidida pelo valor. Alerta se repetir
  // no mês (normalmente só tem 1 de cada por mês).
  { padrao: "MDS SERVICOS TERCEIRIZADOS", descricaoNome: "Limpeza", valorMax: 1600, alertaSeRepetirNoMes: true },
  { padrao: "MDS SERVICOS TERCEIRIZADOS", descricaoNome: "Lavanderia", valorMin: 1600.01, alertaSeRepetirNoMes: true },
];

export interface RegraMatch {
  padrao: string;
  descricaoNome: string;
  valorMin: number | null;
  valorMax: number | null;
}

/**
 * Match simples: primeira regra ativa cujo padrão aparece (case-
 * insensitive) no texto combinado da transação E cujo valor (se a regra
 * tiver faixa) cai dentro do intervalo. Sem match = null (Pendente,
 * revisão manual).
 */
export function sugerirDescricaoNome(
  textoTransacao: string,
  valor: number,
  regras: RegraMatch[],
): string | null {
  const texto = textoTransacao.toLowerCase();
  for (const regra of regras) {
    if (!texto.includes(regra.padrao.toLowerCase())) continue;
    if (regra.valorMin !== null && valor < regra.valorMin) continue;
    if (regra.valorMax !== null && valor > regra.valorMax) continue;
    return regra.descricaoNome;
  }
  return null;
}

/**
 * CNPJ de origem ou destino batendo com alguma conta própria cadastrada
 * = transferência entre contas, sempre excluída do DRE. Prioridade
 * máxima — roda antes das regras de texto porque é exato, não um
 * chute por padrão.
 */
export function ehTransferenciaEntreContas(
  cpfCnpjOrigem: string | null | undefined,
  cpfCnpjDestino: string | null | undefined,
  cnpjsContas: string[],
): boolean {
  if (cnpjsContas.length === 0) return false;
  const origemLimpo = cpfCnpjOrigem?.replace(/\D/g, "");
  const destinoLimpo = cpfCnpjDestino?.replace(/\D/g, "");
  return !!(
    (origemLimpo && cnpjsContas.includes(origemLimpo)) ||
    (destinoLimpo && cnpjsContas.includes(destinoLimpo))
  );
}

const MIN_TAMANHO_PADRAO_APRENDIDO = 5;

/**
 * Limpa o texto de contraparte pra virar um padrão de regra reutilizável.
 * O mesmo pagamento recorrente aparece com prefixos numéricos diferentes
 * a cada mês (ex.: "Cp :90400888-DAIANA..." ou "00019 340114355 53 829
 * 744 CRISLANE..."), então tira esse ruído antes de usar o nome como
 * padrão — senão a regra aprendida nunca bate de novo.
 *
 * Retorna null se não sobrar nada útil (evita aprender regra genérica
 * demais, tipo só um número de documento).
 */
export function extrairPadraoContraparte(texto: string): string | null {
  let limpo = texto
    .replace(/^Cp\s*:\s*\d+\s*-\s*/i, "")
    .replace(/^\d[\d\s]{4,}(?=[A-Za-zÀ-ÿ])/, "")
    .replace(/^\d+\s*-\s*/, "")
    .trim();

  // Se depois de limpar ainda começa com dígito (não achou um nome de
  // verdade), não é seguro generalizar.
  if (/^\d/.test(limpo)) return null;
  if (limpo.length < MIN_TAMANHO_PADRAO_APRENDIDO) return null;

  return limpo;
}
