import { useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

function fmtCurrencyCom(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function toIso(date: Date): string {
  return date.toISOString().split("T")[0];
}

function segundaFeiraDa(date: Date): Date {
  const d = new Date(date);
  const diaSemana = d.getDay(); // 0 = domingo
  const deslocamento = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + deslocamento);
  return d;
}

function fmtDiaCurto(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const DIAS_SEMANA_ABREV = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function fmtDiaSemana(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return DIAS_SEMANA_ABREV[new Date(y, m - 1, d).getDay()];
}

const FORMAS = [
  { chave: "dinheiro" as const, label: "Dinheiro" },
  { chave: "cartaoDebito" as const, label: "Cartão de débito" },
  { chave: "cartaoCredito" as const, label: "Cartão de crédito" },
  { chave: "pix" as const, label: "Pix" },
];

type ValoresForma = { dinheiro: number; cartaoDebito: number; cartaoCredito: number; pix: number };

function total(v: ValoresForma): number {
  return v.dinheiro + v.cartaoDebito + v.cartaoCredito + v.pix;
}

export default function ComandaRecepcao() {
  const { unidadeSelecionada } = useUnidade();
  const unidadeId = unidadeSelecionada?.id;
  const utils = trpc.useUtils();

  const [inicioSemana, setInicioSemana] = useState(() => toIso(segundaFeiraDa(new Date())));

  const dataInicio = inicioSemana;
  const fimDate = new Date(inicioSemana);
  fimDate.setDate(fimDate.getDate() + 6);
  const dataFim = toIso(fimDate);

  const resumoQuery = trpc.comandaRecepcao.resumo.useQuery(
    { unidadeId: unidadeId!, dataInicio, dataFim },
    { enabled: !!unidadeId },
  );

  const sincronizarMutation = trpc.comandaRecepcao.sincronizar.useMutation({
    onError: (err) => toast.error(`Erro na sincronização: ${err.message}`),
  });

  async function handleSincronizar() {
    if (!unidadeId) return;
    // Sincroniza o(s) mês(es) que a semana visível cobre (pode virar o mês).
    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    const meses = new Set<string>();
    for (const d = new Date(inicio); d <= fim; d.setDate(d.getDate() + 1)) {
      meses.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
    }
    try {
      for (const chave of Array.from(meses)) {
        const [ano, mes] = chave.split("-").map(Number);
        await sincronizarMutation.mutateAsync({ unidadeId, ano, mes });
      }
      toast.success("Comanda sincronizada.");
      utils.comandaRecepcao.resumo.invalidate();
    } catch {
      // erro já reportado via onError da mutation
    }
  }

  function mudarSemana(deltaDias: number) {
    const d = new Date(inicioSemana);
    d.setDate(d.getDate() + deltaDias);
    setInicioSemana(toIso(d));
  }

  const dias = resumoQuery.data ?? [];
  const carregando = resumoQuery.isLoading;

  function totais(campo: "comanda" | "contasBancarias" | "diferenca") {
    return dias.reduce<ValoresForma>(
      (acc, dia) => {
        const v = dia[campo];
        return {
          dinheiro: acc.dinheiro + v.dinheiro,
          cartaoDebito: acc.cartaoDebito + v.cartaoDebito,
          cartaoCredito: acc.cartaoCredito + v.cartaoCredito,
          pix: acc.pix + v.pix,
        };
      },
      { dinheiro: 0, cartaoDebito: 0, cartaoCredito: 0, pix: 0 },
    );
  }

  function Secao({
    titulo,
    campo,
    destacarDiferenca,
  }: {
    titulo: string;
    campo: "comanda" | "contasBancarias" | "diferenca";
    destacarDiferenca?: boolean;
  }) {
    const totaisSecao = totais(campo);
    return (
      <>
        <tr className="bg-muted/60">
          <td className="sticky left-0 bg-muted/60 px-3 py-2 text-xs font-semibold whitespace-nowrap">{titulo}</td>
          {dias.map((dia) => (
            <td key={dia.data} />
          ))}
          <td />
        </tr>
        {FORMAS.map((forma) => (
          <tr key={forma.chave} className="border-b">
            <td className="sticky left-0 bg-background px-3 py-1.5 text-xs text-muted-foreground whitespace-nowrap">
              {forma.label}
            </td>
            {dias.map((dia) => {
              const valor = dia[campo][forma.chave];
              const diferente = destacarDiferenca && Math.abs(dia.diferenca[forma.chave]) > 0.005;
              return (
                <td
                  key={dia.data}
                  className={`px-3 py-1.5 text-xs text-right whitespace-nowrap ${diferente ? "bg-red-100 text-red-700 font-medium" : ""}`}
                >
                  {fmtCurrencyCom(valor)}
                </td>
              );
            })}
            <td className="px-3 py-1.5 text-xs text-right whitespace-nowrap font-medium border-l">
              {fmtCurrencyCom(totaisSecao[forma.chave])}
            </td>
          </tr>
        ))}
        <tr className="border-b-2">
          <td className="sticky left-0 bg-background px-3 py-1.5 text-xs font-semibold whitespace-nowrap">
            Total de pagamentos
          </td>
          {dias.map((dia) => {
            const valor = total(dia[campo]);
            const diferente = destacarDiferenca && Math.abs(total(dia.diferenca)) > 0.005;
            return (
              <td
                key={dia.data}
                className={`px-3 py-1.5 text-xs text-right font-semibold whitespace-nowrap ${diferente ? "bg-red-100 text-red-700" : ""}`}
              >
                {fmtCurrencyCom(valor)}
              </td>
            );
          })}
          <td className="px-3 py-1.5 text-xs text-right font-semibold whitespace-nowrap border-l">
            {fmtCurrencyCom(total(totaisSecao))}
          </td>
        </tr>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Comanda Recepção
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conciliação semanal: comanda lançada pela recepção x o que realmente entrou nas contas.
          </p>
        </div>
        <UnidadeSelector />
      </div>

      {!unidadeId ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          Selecione uma unidade para continuar.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => mudarSemana(-7)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium px-2 whitespace-nowrap">
                {fmtDiaCurto(dataInicio)} – {fmtDiaCurto(dataFim)}
              </span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => mudarSemana(7)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setInicioSemana(toIso(segundaFeiraDa(new Date())))}
              >
                Semana atual
              </Button>
            </div>
            <Button
              size="sm"
              disabled={sincronizarMutation.isPending}
              onClick={handleSincronizar}
            >
              {sincronizarMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sincronizar Comanda
            </Button>
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              {carregando ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="sticky left-0 bg-muted/30 px-3 py-2 text-left text-xs font-medium whitespace-nowrap">
                        {" "}
                      </th>
                      {dias.map((dia) => (
                        <th key={dia.data} className="px-3 py-2 text-right text-xs font-medium whitespace-nowrap">
                          {fmtDiaCurto(dia.data)}
                          <span className="text-muted-foreground font-normal ml-1">{fmtDiaSemana(dia.data)}</span>
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right text-xs font-medium whitespace-nowrap border-l">
                        Semana
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <Secao titulo="Comanda (Recepção)" campo="comanda" />
                    <Secao titulo="Contas bancárias" campo="contasBancarias" />
                    <Secao titulo="Diferença" campo="diferenca" destacarDiferenca />
                  </tbody>
                </table>
              )}
            </div>
          </Card>
          <p className="text-xs text-muted-foreground">
            Diferença positiva = recepção lançou a mais na comanda; negativa = lançou a menos.
            Células destacadas em vermelho indicam uma diferença a investigar.
          </p>
        </>
      )}
    </div>
  );
}
