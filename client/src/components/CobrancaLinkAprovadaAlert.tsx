import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, CreditCard } from "lucide-react";
import React, { useMemo, useState } from "react";

type CobrancaAprovada = {
  id: number;
  clienteNome: string;
  titulo: string;
  valor: string;
  paymentMethodId: string | null;
  paymentTypeId: string | null;
  paymentInstallments: number | null;
  paymentApprovedAt: string | Date | null;
};

function formatarData(data: string | Date | null) {
  if (!data) return "agora";
  const valor = new Date(data);
  return Number.isNaN(valor.getTime()) ? "agora" : valor.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function formatarValor(valor: string) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : valor;
}

/**
 * Forma de pagamento real usada no checkout (payment_method_id do
 * Mercado Pago primeiro — traz a bandeira/"pix"/"account_money" — com
 * payment_type_id como fallback), + parcelas quando for cartão
 * parcelado. Mesma prioridade e mesmo texto cru (sem tradução manual
 * de bandeira) já usados na tela de Confirmação de Pagamento.
 */
function formatarFormaPagamento(cobranca: CobrancaAprovada) {
  const bruto = cobranca.paymentMethodId ?? cobranca.paymentTypeId;
  if (!bruto) return null;
  const label = bruto.replaceAll("_", " ");
  return cobranca.paymentInstallments && cobranca.paymentInstallments > 1 ? `${label} · ${cobranca.paymentInstallments}x` : label;
}

/** Atualiza somente com o navegador aberto; o webhook é quem grava a aprovação. */
export default function CobrancaLinkAprovadaAlert() {
  const { unidadeSelecionada } = useUnidade();
  const utils = trpc.useUtils();
  const [dispensadoNaTela, setDispensadoNaTela] = useState<number | null>(null);
  const query = trpc.cobrancasLink.alertas.useQuery({ unidadeId: unidadeSelecionada?.id ?? 0 }, {
    enabled: !!unidadeSelecionada,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
  const reconhecer = trpc.cobrancasLink.reconhecerAlerta.useMutation({
    onSuccess: () => { if (unidadeSelecionada) utils.cobrancasLink.alertas.invalidate({ unidadeId: unidadeSelecionada.id }); },
  });
  const cobranca = useMemo(() => ((query.data ?? []) as CobrancaAprovada[]).find((item) => item.id !== dispensadoNaTela), [dispensadoNaTela, query.data]);
  const dispensar = () => {
    if (!cobranca || !unidadeSelecionada) return;
    setDispensadoNaTela(cobranca.id);
    reconhecer.mutate({ cobrancaId: cobranca.id, unidadeId: unidadeSelecionada.id });
  };
  const forma = cobranca ? formatarFormaPagamento(cobranca) : null;

  return <AlertDialog open={!!cobranca} onOpenChange={(aberto) => !aberto && dispensar()}>
    <AlertDialogContent className="max-w-md border-emerald-300 bg-emerald-50">
      <AlertDialogHeader>
        <div className="mb-2 flex items-center gap-2 text-emerald-800"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-200"><CreditCard className="h-5 w-5" /></span><Badge className="bg-emerald-700 text-white">Pagamento confirmado</Badge></div>
        <AlertDialogTitle className="font-serif text-2xl text-emerald-950">Link de Pagamento aprovado</AlertDialogTitle>
        <AlertDialogDescription className="space-y-2 text-base leading-6 text-emerald-950"><span className="block">O Link enviado para <strong>{cobranca?.clienteNome}</strong> foi pago em <strong>{formatarData(cobranca?.paymentApprovedAt ?? null)}</strong>.</span><span className="block rounded-md bg-emerald-100 px-3 py-2 text-sm"><strong>{cobranca?.titulo}</strong> · {cobranca ? formatarValor(cobranca.valor) : ""}{forma && <> · <span className="capitalize font-medium">{forma}</span></>}</span><span className="flex items-center gap-1.5 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />Pode seguir com o agendamento ou voucher.</span></AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogAction className="bg-emerald-700 hover:bg-emerald-800" onClick={dispensar}>Ciente</AlertDialogAction>
    </AlertDialogContent>
  </AlertDialog>;
}
