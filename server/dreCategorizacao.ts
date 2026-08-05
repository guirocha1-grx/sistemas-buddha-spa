/**
 * Plano de contas do DRE + regras de categorização automática.
 *
 * Estrutura definida com o usuário em 2026-08-04, a partir da planilha
 * real de conciliação (Conciliação de contas PJ - Inter.xlsx) e de uma
 * estrutura de DRE completa que ele forneceu. Pontos que ficaram em
 * aberto pra retomar — NÃO têm regra automática aqui de propósito,
 * porque adivinhar errado nisso distorce o DRE:
 *
 * - Receitas de Vendas: vai vir do Belle (fonte de verdade), não do
 *   extrato bancário. Os créditos da adquirente de cartão no banco só
 *   servem, no futuro, pra calcular "Taxa de Adquirência e
 *   Antecipações" por diferença contra o que o Belle registrou. Por
 *   enquanto esses créditos ficam sem regra (caem em "Pendente").
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

export interface DreRegraSeed {
  padrao: string;
  categoriaNome: string;
  valorMin?: number;
  valorMax?: number;
  alertaSeRepetirNoMes?: boolean;
}

/**
 * Regras conservadoras — só as que têm padrão de texto confirmado e
 * confiável. Confiança > cobertura: prefiro deixar "Pendente" (revisão
 * manual) a arriscar categorizar errado um valor grande.
 */
export const DRE_REGRAS_SEED: DreRegraSeed[] = [
  { padrao: "Eleva", categoriaNome: "Sistemas / Softwares" },
  { padrao: "Belle", categoriaNome: "Sistemas / Softwares" },
  { padrao: "Mywork", categoriaNome: "Sistemas / Softwares" },
  { padrao: "YAMADA CONTABILIDADE", categoriaNome: "Consultoria / Assessoria / Contabilidade / Advocacia" },
  { padrao: "HERDADE, MARTINI", categoriaNome: "Consultoria / Assessoria / Contabilidade / Advocacia" },
  { padrao: "Caju", categoriaNome: "Benefícios (Vale transporte, Plano de saude, Vale Alimentação e Seguro de Vida)" },
  { padrao: "Sindicato", categoriaNome: "Contribuição Sindical" },
  // "Vanessa" é nome próprio genérico — funciona hoje (único Pix conhecido
  // com esse nome), mas reavaliar se aparecer outro "Vanessa" não
  // relacionado ao empréstimo.
  { padrao: "Vanessa", categoriaNome: "Juros + Multas" },
  { padrao: "Transferência", categoriaNome: EXCLUIDO_NOME },

  // Confirmadas pelo usuário em 2026-08-05:
  // "Pix recebido no Inter é sempre receita" — a expressão "Pix recebido"
  // só aparece nesse formato no vocabulário do Inter (sync/PDF), então
  // essa regra já fica naturalmente restrita a esses dois canais.
  { padrao: "Pix recebido", categoriaNome: "Receitas de Vendas" },
  { padrao: "voucher", categoriaNome: "Parcerias Comerciais" },
  { padrao: "convênio", categoriaNome: "Parcerias Comerciais" },
  { padrao: "Totalpass", categoriaNome: "Parcerias Comerciais" },
  { padrao: "Wellhub", categoriaNome: "Parcerias Comerciais" },
  // MDS Serviços Terceirizados: até R$1.600 é limpeza, acima é lavanderia
  // — mesma contraparte, categoria decidida pelo valor. Alerta se repetir
  // no mês (normalmente só tem 1 de cada por mês).
  { padrao: "MDS SERVICOS TERCEIRIZADOS", categoriaNome: "Limpeza", valorMax: 1600, alertaSeRepetirNoMes: true },
  { padrao: "MDS SERVICOS TERCEIRIZADOS", categoriaNome: "Lavanderia", valorMin: 1600.01, alertaSeRepetirNoMes: true },
];

export interface RegraMatch {
  padrao: string;
  categoriaNome: string;
  valorMin: number | null;
  valorMax: number | null;
}

/**
 * Match simples: primeira regra ativa cujo padrão aparece (case-
 * insensitive) no texto combinado da transação E cujo valor (se a regra
 * tiver faixa) cai dentro do intervalo. Sem match = null (Pendente,
 * revisão manual).
 */
export function sugerirCategoriaNome(
  textoTransacao: string,
  valor: number,
  regras: RegraMatch[],
): string | null {
  const texto = textoTransacao.toLowerCase();
  for (const regra of regras) {
    if (!texto.includes(regra.padrao.toLowerCase())) continue;
    if (regra.valorMin !== null && valor < regra.valorMin) continue;
    if (regra.valorMax !== null && valor > regra.valorMax) continue;
    return regra.categoriaNome;
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
