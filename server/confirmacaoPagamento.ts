import { classificarOrigemPagamentoMp, type MpPagamento } from "./mercadoPagoApi";
import { extrairContraparte, type InterTransacaoCompleta } from "./interApi";

export type ConfirmacaoPixInter = {
  idTransacao: string;
  dataHora: string;
  valor: string;
  pagador: string | null;
  cpfCnpjPagador: string | null;
  descricao: string | null;
  endToEndId: string | null;
};

export type ConfirmacaoLinkMercadoPago = {
  idPagamento: string;
  dataHora: string;
  valorBruto: string | null;
  valorLiquido: string | null;
  parcelas: number | null;
  formaPagamento: string | null;
  pagador: string | null;
  identificacaoPagador: string | null;
  descricao: string | null;
};

/** Data AAAA-MM-DD no fuso operacional das unidades. */
export function dataSaoPaulo(data: Date): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(data);
  const valor = (tipo: string) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

function ocorreuNasUltimas48Horas(dataHora: string | undefined, dataFallback: string, inicio: Date): boolean {
  if (dataHora) {
    // A API do Inter envia dataInclusao sem offset. Ela representa o
    // horário de Brasília; explicitar -03:00 evita o Node tratá-la como UTC.
    const comFuso = /^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(dataHora)
      ? `${dataHora.replace(" ", "T")}-03:00`
      : dataHora;
    const timestamp = Date.parse(comFuso);
    if (Number.isFinite(timestamp)) return timestamp >= inicio.getTime();
  }
  // A API pode omitir o horário em registros antigos. Nesse caso, o
  // fallback é por data operacional, sem afirmar precisão de horário.
  return dataFallback >= dataSaoPaulo(inicio);
}

export function ePixRecebidoInter(transacao: InterTransacaoCompleta): boolean {
  if (transacao.tipoOperacao !== "C") return false;
  const descricao = `${transacao.tipoTransacao} ${transacao.titulo} ${transacao.descricao}`.toLowerCase();
  return descricao.includes("pix");
}

export function listarPixInterRecentes(transacoes: InterTransacaoCompleta[], inicio: Date): ConfirmacaoPixInter[] {
  return transacoes
    .filter((transacao) => ePixRecebidoInter(transacao) && ocorreuNasUltimas48Horas(transacao.dataInclusao, transacao.dataTransacao, inicio))
    .map((transacao) => {
      const contraparte = extrairContraparte(transacao);
      return {
        idTransacao: transacao.idTransacao,
        dataHora: transacao.dataInclusao ?? transacao.dataTransacao,
        valor: transacao.valor,
        pagador: contraparte.nomeOrigem ?? null,
        cpfCnpjPagador: contraparte.cpfCnpjOrigem ?? null,
        descricao: transacao.descricao || null,
        endToEndId: typeof transacao.detalhes?.endToEndId === "string" ? transacao.detalhes.endToEndId : null,
      };
    })
    .sort((a, b) => b.dataHora.localeCompare(a.dataHora));
}

export function listarLinksMercadoPagoRecentes(pagamentos: MpPagamento[], inicio: Date): ConfirmacaoLinkMercadoPago[] {
  return pagamentos
    .filter((pagamento) => pagamento.status === "approved")
    .filter((pagamento) => classificarOrigemPagamentoMp(pagamento) === "link_pagamento")
    .filter((pagamento) => ocorreuNasUltimas48Horas(pagamento.date_approved ?? undefined, (pagamento.date_approved ?? "").slice(0, 10), inicio))
    .map((pagamento) => ({
      idPagamento: String(pagamento.id),
      dataHora: pagamento.date_approved ?? "",
      valorBruto: pagamento.transaction_amount?.toFixed(2) ?? null,
      valorLiquido: pagamento.transaction_details?.net_received_amount?.toFixed(2) ?? null,
      parcelas: pagamento.installments ?? null,
      formaPagamento: pagamento.payment_method_id ?? pagamento.payment_type_id ?? null,
      pagador: [pagamento.payer?.first_name, pagamento.payer?.last_name].filter(Boolean).join(" ") || pagamento.payer?.email || null,
      identificacaoPagador: pagamento.payer?.identification?.number ?? null,
      descricao: pagamento.description ?? null,
    }))
    .sort((a, b) => b.dataHora.localeCompare(a.dataHora));
}
