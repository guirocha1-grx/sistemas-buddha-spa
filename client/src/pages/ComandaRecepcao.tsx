import { useMemo, useRef, useState, type ReactNode } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Loader2, RefreshCw, UploadCloud, ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { toast } from "sonner";
import { gerarTextoConciliacao } from "@shared/conciliacao";

type FormaServer = "dinheiro" | "debito" | "credito" | "pix";
interface ItemDetalhe {
  data: string;
  forma: FormaServer;
  horario?: string;
  descricao: string;
  valor: number;
}

function fileParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

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

const MESES_NOME = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function fmtMesLabel(mesReferencia: string): string {
  const [ano, mes] = mesReferencia.split("-").map(Number);
  return `${MESES_NOME[mes - 1]}/${ano}`;
}

const FORMAS = [
  { chave: "dinheiro" as const, label: "Dinheiro", formaServer: "dinheiro" as const },
  { chave: "cartaoDebito" as const, label: "Cartão de débito", formaServer: "debito" as const },
  { chave: "cartaoCredito" as const, label: "Cartão de crédito", formaServer: "credito" as const },
  { chave: "pix" as const, label: "Pix", formaServer: "pix" as const },
];

const TODAS_FORMAS_SERVER: FormaServer[] = ["dinheiro", "debito", "credito", "pix"];

type ValoresForma = { dinheiro: number; cartaoDebito: number; cartaoCredito: number; pix: number };

function total(v: ValoresForma): number {
  return v.dinheiro + v.cartaoDebito + v.cartaoCredito + v.pix;
}

export default function ComandaRecepcao() {
  const { unidadeSelecionada } = useUnidade();
  const unidadeId = unidadeSelecionada?.id;
  const utils = trpc.useUtils();

  const [modoVisualizacao, setModoVisualizacao] = useState<"semana" | "mes">("semana");
  const [inicioSemana, setInicioSemana] = useState(() => toIso(segundaFeiraDa(new Date())));
  const [mesReferencia, setMesReferencia] = useState(() => {
    const hoje = new Date();
    return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`; // "AAAA-MM"
  });

  const [anoRef, mesRef] = mesReferencia.split("-").map(Number);
  const dataInicioMes = toIso(new Date(anoRef, mesRef - 1, 1));
  const dataFimMes = toIso(new Date(anoRef, mesRef, 0));

  const fimSemanaDate = new Date(inicioSemana);
  fimSemanaDate.setDate(fimSemanaDate.getDate() + 6);
  const dataFimSemana = toIso(fimSemanaDate);

  const dataInicio = modoVisualizacao === "semana" ? inicioSemana : dataInicioMes;
  const dataFim = modoVisualizacao === "semana" ? dataFimSemana : dataFimMes;

  function mudarMes(deltaMeses: number) {
    const d = new Date(anoRef, mesRef - 1 + deltaMeses, 1);
    setMesReferencia(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const resumoQuery = trpc.comandaRecepcao.resumo.useQuery(
    { unidadeId: unidadeId!, dataInicio, dataFim },
    { enabled: !!unidadeId },
  );

  const detalheQuery = trpc.comandaRecepcao.detalhe.useQuery(
    { unidadeId: unidadeId!, dataInicio, dataFim },
    { enabled: !!unidadeId },
  );

  // Item a item da "Comanda virtual" — alimenta o hover de auditoria da
  // linha "Comanda (Recepção)", mesmo padrão do detalheQuery acima pro
  // lado de Contas bancárias.
  const itensComandaQuery = trpc.comandaRecepcao.itensDetalhe.useQuery(
    { unidadeId: unidadeId!, dataInicio, dataFim },
    { enabled: !!unidadeId },
  );

  // Agrupa os lançamentos individuais por "data|forma" pra alimentar o
  // hover de auditoria nas células de Contas bancárias.
  const itensPorCelula = useMemo(() => {
    const mapa = new Map<string, ItemDetalhe[]>();
    for (const item of (detalheQuery.data ?? []) as ItemDetalhe[]) {
      const chave = `${item.data}|${item.forma}`;
      const lista = mapa.get(chave) ?? [];
      lista.push(item);
      mapa.set(chave, lista);
    }
    return mapa;
  }, [detalheQuery.data]);

  const itensComandaPorCelula = useMemo(() => {
    const mapa = new Map<string, ItemDetalhe[]>();
    for (const item of (itensComandaQuery.data ?? []) as ItemDetalhe[]) {
      const chave = `${item.data}|${item.forma}`;
      const lista = mapa.get(chave) ?? [];
      lista.push(item);
      mapa.set(chave, lista);
    }
    return mapa;
  }, [itensComandaQuery.data]);

  const sincronizarMutation = trpc.comandaRecepcao.sincronizar.useMutation({
    onError: (err) => toast.error(`Erro na sincronização: ${err.message}`),
  });

  const sincronizarItensMutation = trpc.comandaRecepcao.sincronizarItens.useMutation({
    onError: (err) => toast.error(`Erro ao sincronizar item a item: ${err.message}`),
  });

  async function handleSincronizar() {
    if (!unidadeId) return;
    // Sincroniza o(s) mês(es) que a semana visível cobre (pode virar o mês) —
    // a Consolidado comanda tem uma aba por mês.
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
      // Comanda virtual tem uma aba POR DIA — sincroniza só o período
      // exato visível (não o mês inteiro), pra não ficar caro à toa.
      await sincronizarItensMutation.mutateAsync({ unidadeId, dataInicio, dataFim });
      utils.comandaRecepcao.resumo.invalidate();
      utils.comandaRecepcao.itensDetalhe.invalidate();

      // Recalcula "Contas bancárias" e a conciliação (linha 20 da
      // planilha) na sequência — um clique só. Sem isso, a célula de
      // conciliação de um dia já corrigido só sumia se a pessoa
      // lembrasse de clicar em "Sincronizar com Drive" também.
      await sincronizarContasBancariasMutation.mutateAsync({ unidadeId, dataInicio, dataFim });

      toast.success("Comanda sincronizada.");
    } catch {
      // erro já reportado via onError de cada mutation
    }
  }

  const importarHistoricoRef = useRef<HTMLInputElement>(null);
  const importarHistoricoMutation = trpc.comandaRecepcao.importarHistoricoItensXlsx.useMutation({
    onSuccess: (data) => {
      toast.success(`Histórico importado: ${data.inseridos} novo(s), ${data.atualizados} atualizado(s), ${data.totalDias} dia(s).`);
      utils.comandaRecepcao.itensDetalhe.invalidate();
    },
    onError: (err) => toast.error(`Erro ao importar histórico: ${err.message}`),
  });

  async function handleImportarHistorico(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !unidadeId) return;
    try {
      const xlsxBase64 = await fileParaBase64(file);
      importarHistoricoMutation.mutate({ unidadeId, xlsxBase64 });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao ler o arquivo");
    } finally {
      e.target.value = "";
    }
  }

  const sincronizarContasBancariasMutation = trpc.comandaRecepcao.sincronizarContasBancariasParaDrive.useMutation({
    onError: (err) => toast.error(`Erro ao enviar pro Drive: ${err.message}`),
  });

  async function handleSincronizarContasBancarias() {
    if (!unidadeId) return;
    try {
      const r = await sincronizarContasBancariasMutation.mutateAsync({ unidadeId, dataInicio, dataFim });
      toast.success(`Enviado pro Drive: ${r.totalDias} dia(s).`);
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

  // Texto de conciliação por dia (server/shared/conciliacao.ts) — mesma
  // lógica usada pelo server pra escrever a linha 20 da planilha, aqui
  // calculada ao vivo com os itens já carregados (nenhuma chamada extra)
  // pra alimentar o hover das células vermelhas em "Diferença".
  const conciliacaoPorDia = useMemo(() => {
    const mapa = new Map<string, string | null>();
    for (const dia of dias) {
      const comandaItens = TODAS_FORMAS_SERVER.flatMap((f) => itensComandaPorCelula.get(`${dia.data}|${f}`) ?? []);
      const contasItens = TODAS_FORMAS_SERVER.flatMap((f) => itensPorCelula.get(`${dia.data}|${f}`) ?? []);
      mapa.set(dia.data, gerarTextoConciliacao(dia.data, comandaItens, contasItens));
    }
    return mapa;
  }, [dias, itensComandaPorCelula, itensPorCelula]);

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

  function itensDoDia(data: string, formas: FormaServer[]): ItemDetalhe[] {
    return formas.flatMap((f) => itensPorCelula.get(`${data}|${f}`) ?? []);
  }

  function itensDoDiaComanda(data: string, formas: FormaServer[]): ItemDetalhe[] {
    return formas.flatMap((f) => itensComandaPorCelula.get(`${data}|${f}`) ?? []);
  }

  function ConteudoAuditoria({ itens, valor }: { itens: ItemDetalhe[]; valor: number }) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span>{itens.length} lançamento{itens.length === 1 ? "" : "s"}</span>
          <span>{fmtCurrencyCom(valor)}</span>
        </div>
        {itens.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum lançamento encontrado nessa data.</p>
        ) : (
          <ul className="space-y-1 max-h-64 overflow-y-auto">
            {itens.map((item, i) => (
              <li key={i} className="flex items-start justify-between gap-2 text-xs border-t pt-1 first:border-t-0 first:pt-0">
                <span className="text-muted-foreground">
                  {item.horario && <span className="tabular-nums">{item.horario} — </span>}
                  {item.descricao}
                </span>
                <span className="whitespace-nowrap font-medium">{fmtCurrencyCom(item.valor)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  function CelulaValor({
    valor,
    diferente,
    itens,
    auditavel,
    negrito,
    textoConciliacao,
  }: {
    valor: number;
    diferente?: boolean;
    itens?: ItemDetalhe[];
    auditavel?: boolean;
    negrito?: boolean;
    textoConciliacao?: string | null;
  }) {
    const comHover = auditavel || !!textoConciliacao;
    const conteudo = (
      <span className={`tabular-nums ${comHover ? "underline decoration-dotted decoration-muted-foreground/50 cursor-help" : ""}`}>
        {fmtCurrencyCom(valor)}
      </span>
    );
    const classe = `px-3 py-1.5 text-xs text-right whitespace-nowrap ${negrito ? "font-semibold" : ""} ${diferente ? "bg-red-100 text-red-700 font-medium" : ""}`;
    if (!comHover) return <td className={classe}>{conteudo}</td>;
    return (
      <td className={classe}>
        <HoverCard openDelay={150}>
          <HoverCardTrigger asChild>{conteudo}</HoverCardTrigger>
          <HoverCardContent className={textoConciliacao ? "w-96" : "w-72"}>
            {textoConciliacao ? (
              <div className="text-xs whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">{textoConciliacao}</div>
            ) : (
              <ConteudoAuditoria itens={itens ?? []} valor={valor} />
            )}
          </HoverCardContent>
        </HoverCard>
      </td>
    );
  }

  function Secao({
    titulo,
    campo,
    destacarDiferenca,
    auditavel,
    acao,
    buscarItens,
    formasSemAuditoria = [],
    buscarTextoConciliacao,
  }: {
    titulo: string;
    campo: "comanda" | "contasBancarias" | "diferenca";
    destacarDiferenca?: boolean;
    auditavel?: boolean;
    acao?: ReactNode;
    buscarItens?: (data: string, formas: FormaServer[]) => ItemDetalhe[];
    formasSemAuditoria?: FormaServer[];
    buscarTextoConciliacao?: (data: string) => string | null | undefined;
  }) {
    const totaisSecao = totais(campo);
    return (
      <>
        <tr className="bg-muted/60">
          <td className="sticky left-0 bg-muted/60 px-3 py-2 text-xs font-semibold whitespace-nowrap">
            <div className="flex items-center gap-2">
              <span>{titulo}</span>
              {acao}
            </div>
          </td>
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
              const podeAuditar = auditavel && !formasSemAuditoria.includes(forma.formaServer);
              return (
                <CelulaValor
                  key={dia.data}
                  valor={valor}
                  diferente={diferente}
                  auditavel={podeAuditar}
                  itens={podeAuditar ? buscarItens?.(dia.data, [forma.formaServer]) ?? [] : undefined}
                  textoConciliacao={diferente ? buscarTextoConciliacao?.(dia.data) : undefined}
                />
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
              <CelulaValor
                key={dia.data}
                valor={valor}
                diferente={diferente}
                negrito
                auditavel={auditavel}
                itens={auditavel ? buscarItens?.(dia.data, ["dinheiro", "debito", "credito", "pix"]) ?? [] : undefined}
                textoConciliacao={diferente ? buscarTextoConciliacao?.(dia.data) : undefined}
              />
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
          <div className="flex items-center gap-1 flex-wrap">
            <div className="flex items-center gap-1 rounded-lg border border-border p-1 mr-1">
              <Button
                variant={modoVisualizacao === "semana" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setModoVisualizacao("semana")}
              >
                Semana
              </Button>
              <Button
                variant={modoVisualizacao === "mes" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => setModoVisualizacao("mes")}
              >
                Mês
              </Button>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => (modoVisualizacao === "semana" ? mudarSemana(-7) : mudarMes(-1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium px-2 whitespace-nowrap">
              {modoVisualizacao === "semana" ? `${fmtDiaCurto(dataInicio)} – ${fmtDiaCurto(dataFim)}` : fmtMesLabel(mesReferencia)}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => (modoVisualizacao === "semana" ? mudarSemana(7) : mudarMes(1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => {
                if (modoVisualizacao === "semana") {
                  setInicioSemana(toIso(segundaFeiraDa(new Date())));
                } else {
                  const hoje = new Date();
                  setMesReferencia(`${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`);
                }
              }}
            >
              {modoVisualizacao === "semana" ? "Semana atual" : "Mês atual"}
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
                    <Secao
                      titulo="Comanda (Recepção)"
                      campo="comanda"
                      auditavel
                      buscarItens={itensDoDiaComanda}
                      acao={
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs font-normal"
                            disabled={sincronizarMutation.isPending || sincronizarItensMutation.isPending || sincronizarContasBancariasMutation.isPending}
                            onClick={handleSincronizar}
                            title="Sincronizar comanda com dados Drive"
                          >
                            {sincronizarMutation.isPending || sincronizarItensMutation.isPending || sincronizarContasBancariasMutation.isPending ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3 mr-1" />
                            )}
                            Sincronizar
                          </Button>
                          <input
                            ref={importarHistoricoRef}
                            type="file"
                            accept=".xlsx"
                            className="hidden"
                            onChange={handleImportarHistorico}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            disabled={importarHistoricoMutation.isPending}
                            onClick={() => importarHistoricoRef.current?.click()}
                            title="Importar histórico da Comanda virtual (.xlsx) — uso único, pra carga inicial"
                          >
                            {importarHistoricoMutation.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Upload className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      }
                    />
                    <Secao
                      titulo="Contas bancárias"
                      campo="contasBancarias"
                      auditavel
                      buscarItens={itensDoDia}
                      formasSemAuditoria={["dinheiro"]}
                      acao={
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs font-normal"
                          disabled={sincronizarContasBancariasMutation.isPending}
                          onClick={handleSincronizarContasBancarias}
                          title="Enviar Débito, Crédito e Pix pra planilha Drive (linhas 10-12) + conciliação dos dias com diferença (linha 20)"
                        >
                          {sincronizarContasBancariasMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <UploadCloud className="h-3 w-3 mr-1" />
                          )}
                          Sincronizar com Drive
                        </Button>
                      }
                    />
                    <Secao
                      titulo="Diferença"
                      campo="diferenca"
                      destacarDiferenca
                      buscarTextoConciliacao={(data) => conciliacaoPorDia.get(data)}
                    />
                  </tbody>
                </table>
              )}
            </div>
          </Card>
          <p className="text-xs text-muted-foreground">
            Diferença positiva = recepção lançou a mais na comanda; negativa = lançou a menos.
            Células destacadas em vermelho indicam uma diferença a investigar. Passe o mouse
            sobre os valores sublinhados pra ver os lançamentos individuais que compõem a
            soma — em "Comanda (Recepção)", vem da Comanda virtual (item a item); em "Contas
            bancárias" (exceto Dinheiro), vem do que já está sincronizado nas contas. Na linha
            "Diferença", passe o mouse pra ver a conciliação completa do dia (Comanda x Contas
            + ações corretivas sugeridas) — o mesmo texto é gravado na linha 20 da planilha
            "Consolidado comanda" ao clicar em "Sincronizar com Drive", e some de lá sozinho
            quando a diferença é corrigida.
          </p>
        </>
      )}
    </div>
  );
}
