import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, RefreshCw, UploadCloud, ChevronLeft, ChevronRight, Upload, Send, AlertTriangle } from "lucide-react";
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

type Fase = "fase1" | "fase2" | "fase3";
const SUBSECAO_FASE2 = "financeiro:comanda-recepcao-belle";
const SUBSECAO_FASE3 = "financeiro:comanda-recepcao-terapeutas";

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

function subtrairDias(dataIso: string, dias: number): string {
  const d = new Date(`${dataIso}T00:00:00`);
  d.setDate(d.getDate() - dias);
  return toIso(d);
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

function fmtDataCompleta(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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
type ValoresFormaBooleana = { dinheiro: boolean; cartaoDebito: boolean; cartaoCredito: boolean; pix: boolean };

type DiaConciliacao = {
  data: string;
  comanda: ValoresForma;
  ladoB: ValoresForma;
  diferenca: ValoresForma;
  // Só preenchido na Fase 2 — dia+forma com alguma parcela do Belle
  // ainda pendente de confirmação (Recebido zerado no relatório).
  pendenteConfirmacao?: ValoresFormaBooleana;
};

function total(v: ValoresForma): number {
  return v.dinheiro + v.cartaoDebito + v.cartaoCredito + v.pix;
}

const LADO_B_LABEL: Record<Fase, string> = { fase1: "Contas bancárias", fase2: "Belle", fase3: "Belle" };

export default function ComandaRecepcao() {
  const { unidadeSelecionada } = useUnidade();
  const unidadeId = unidadeSelecionada?.id;
  const utils = trpc.useUtils();
  // Grupo do Telegram (TELEGRAM_CHAT_ID_GRUPO_RECEPCAO) existe só pra
  // recepção da Shopping Santa Úrsula — Ribeirão Shopping não tem grupo.
  const isRbs = unidadeSelecionada?.slug?.includes("ribeirao") || unidadeSelecionada?.slug?.includes("rbs");

  const permissoesQuery = trpc.permissoes.minhas.useQuery();
  const podeVerFase2 = !permissoesQuery.data?.restrito || (permissoesQuery.data?.subsecoes ?? []).includes(SUBSECAO_FASE2);
  const podeVerFase3 = !permissoesQuery.data?.restrito || (permissoesQuery.data?.subsecoes ?? []).includes(SUBSECAO_FASE3);

  const [faseAtiva, setFaseAtiva] = useState<Fase>("fase1");
  const [confirmarTrocaFase, setConfirmarTrocaFase] = useState(false);
  const [modalBelleAberto, setModalBelleAberto] = useState(false);

  // Padrão mensal (2026-08-29) — antes era semanal; mês dá visão mais
  // ampla pra achar rápido em qual dia está a divergência.
  const [modoVisualizacao, setModoVisualizacao] = useState<"semana" | "mes">("mes");
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

  // Fase 1 é buscada sempre (não só quando a aba está ativa) — precisa
  // do resultado pra decidir se mostra o aviso ao tentar ir pra Fase 2.
  const resumoQuery = trpc.comandaRecepcao.resumo.useQuery(
    { unidadeId: unidadeId!, dataInicio, dataFim },
    { enabled: !!unidadeId },
  );

  const resumoBelleQuery = trpc.comandaRecepcao.resumoBelle.useQuery(
    { unidadeId: unidadeId!, dataInicio, dataFim },
    { enabled: !!unidadeId && faseAtiva === "fase2" },
  );

  const detalheQuery = trpc.comandaRecepcao.detalhe.useQuery(
    { unidadeId: unidadeId!, dataInicio, dataFim },
    { enabled: !!unidadeId },
  );

  const detalheBelleQuery = trpc.comandaRecepcao.detalheBelle.useQuery(
    { unidadeId: unidadeId!, dataInicio, dataFim },
    { enabled: !!unidadeId && faseAtiva === "fase2" },
  );

  const divergenciasTerapeutasQuery = trpc.comandaRecepcao.divergenciasTerapeutas.useQuery(
    { unidadeId: unidadeId!, dataInicio, dataFim },
    { enabled: !!unidadeId && faseAtiva === "fase3" },
  );

  // Item a item da "Comanda virtual" — alimenta o hover de auditoria da
  // linha "Comanda (Recepção)", compartilhado pelas duas fases (o lado
  // Comanda é o mesmo dado independente da fase).
  const itensComandaQuery = trpc.comandaRecepcao.itensDetalhe.useQuery(
    { unidadeId: unidadeId!, dataInicio, dataFim },
    { enabled: !!unidadeId },
  );

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

  const itensBellePorCelula = useMemo(() => {
    const mapa = new Map<string, ItemDetalhe[]>();
    for (const item of (detalheBelleQuery.data ?? []) as ItemDetalhe[]) {
      const chave = `${item.data}|${item.forma}`;
      const lista = mapa.get(chave) ?? [];
      lista.push(item);
      mapa.set(chave, lista);
    }
    return mapa;
  }, [detalheBelleQuery.data]);

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

  const itensLadoBPorCelula = faseAtiva === "fase1" ? itensPorCelula : itensBellePorCelula;

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

    // Comanda virtual tem uma aba POR DIA (uma chamada à API do Sheets
    // cada) — sincronizar o mês inteiro (até 31 chamadas em sequência)
    // aumentava a chance de esbarrar em rate limit. 12 dias cobre bem
    // mais que o suficiente pro uso real (conciliação é sempre dos
    // dias recentes) sem esse custo.
    const hojeIso = toIso(new Date());
    const itensFimIdeal = dataFim < hojeIso ? dataFim : hojeIso;
    const itensInicioIdeal = subtrairDias(itensFimIdeal, 11);
    const itensInicio = itensInicioIdeal > dataInicio ? itensInicioIdeal : dataInicio;

    let houveErro = false;

    try {
      for (const chave of Array.from(meses)) {
        const [ano, mes] = chave.split("-").map(Number);
        await sincronizarMutation.mutateAsync({ unidadeId, ano, mes });
      }
    } catch {
      houveErro = true;
    }

    try {
      await sincronizarItensMutation.mutateAsync({ unidadeId, dataInicio: itensInicio, dataFim: itensFimIdeal });
    } catch {
      houveErro = true;
    }

    utils.comandaRecepcao.resumo.invalidate();
    utils.comandaRecepcao.itensDetalhe.invalidate();

    // Roda sempre, mesmo se algo acima falhou parcialmente — o Informe de
    // vendas não pode ficar travado numa versão antiga só porque um dia
    // isolado do item-a-item deu erro.
    try {
      await sincronizarContasBancariasMutation.mutateAsync({ unidadeId, dataInicio, dataFim });
    } catch {
      houveErro = true;
    }

    if (!houveErro) toast.success("Comanda sincronizada.");
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

  const importarBelleRef = useRef<HTMLInputElement>(null);
  const importarBelleMutation = trpc.comandaRecepcao.importarRegistrosFinanceirosBelleXlsx.useMutation();
  const [previewBelle, setPreviewBelle] = useState<{
    xlsxBase64: string;
    totalLinhas: number;
    periodoInicio: string;
    periodoFim: string;
  } | null>(null);

  // Passo 1: só lê e devolve o período do arquivo, pra confirmar antes
  // de gravar — fácil de confundir período/unidade na hora de exportar
  // do Belle.
  async function handleImportarBelle(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !unidadeId) return;
    try {
      const xlsxBase64 = await fileParaBase64(file);
      const preview = await importarBelleMutation.mutateAsync({ unidadeId, xlsxBase64, dryRun: true });
      setPreviewBelle({
        xlsxBase64,
        totalLinhas: preview.totalLinhas,
        periodoInicio: preview.periodoInicio!,
        periodoFim: preview.periodoFim!,
      });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao ler o arquivo");
    } finally {
      e.target.value = "";
    }
  }

  // Passo 2: grava de fato, só depois do usuário conferir o período na tela.
  async function confirmarImportarBelle() {
    if (!unidadeId || !previewBelle) return;
    try {
      const resultado = await importarBelleMutation.mutateAsync({ unidadeId, xlsxBase64: previewBelle.xlsxBase64 });
      toast.success(
        `Relatório do Belle importado: ${resultado.processados} lançamento(s) — ` +
        `${resultado.removidos} lançamento(s) antigo(s) do período (${fmtDataCompleta(resultado.periodoInicio)} a ` +
        `${fmtDataCompleta(resultado.periodoFim)}) foram apagados antes de subir os novos.`,
      );
      utils.comandaRecepcao.resumoBelle.invalidate();
      utils.comandaRecepcao.detalheBelle.invalidate();
      setPreviewBelle(null);
      setModalBelleAberto(false);
    } catch (err: any) {
      toast.error(`Erro ao importar relatório do Belle: ${err.message}`);
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

  const sincronizarBelleMutation = trpc.comandaRecepcao.sincronizarBelleParaDrive.useMutation({
    onError: (err) => toast.error(`Erro ao enviar pro Drive: ${err.message}`),
  });

  async function handleSincronizarBelle() {
    if (!unidadeId) return;
    try {
      const r = await sincronizarBelleMutation.mutateAsync({ unidadeId, dataInicio, dataFim });
      toast.success(`Enviado pro Drive: ${r.totalDias} dia(s).`);
    } catch {
      // erro já reportado via onError da mutation
    }
  }

  const statusEnvioRecepcaoQuery = trpc.comandaRecepcao.statusEnvioRecepcao.useQuery(
    { unidadeId: unidadeId ?? 0 },
    { enabled: !!unidadeId && !isRbs },
  );
  const enviarRelatorioRecepcaoMutation = trpc.comandaRecepcao.enviarRelatorioRecepcao.useMutation({
    onError: (err) => toast.error(`Erro ao enviar pra recepção: ${err.message}`),
  });

  async function handleEnviarRecepcao() {
    if (!unidadeId) return;
    try {
      const r = await enviarRelatorioRecepcaoMutation.mutateAsync({ unidadeId, dataInicio, dataFim });
      toast.success(r.enviado ? `Relatório enviado pro grupo da recepção: ${r.dias} dia(s) com pendência.` : "Sem pendências no período — nada a enviar.");
      statusEnvioRecepcaoQuery.refetch();
    } catch {
      // erro já reportado via onError da mutation
    }
  }

  function mudarSemana(deltaDias: number) {
    const d = new Date(inicioSemana);
    d.setDate(d.getDate() + deltaDias);
    setInicioSemana(toIso(d));
  }

  const diasFase1: DiaConciliacao[] = useMemo(() => (resumoQuery.data ?? []).map((d) => ({
    data: d.data,
    comanda: d.comanda,
    ladoB: d.contasBancarias,
    diferenca: d.diferenca,
  })), [resumoQuery.data]);

  const diasFase2: DiaConciliacao[] = useMemo(() => (resumoBelleQuery.data ?? []).map((d) => ({
    data: d.data,
    comanda: d.comanda,
    ladoB: d.belle,
    diferenca: d.diferenca,
    pendenteConfirmacao: d.pendenteConfirmacao,
  })), [resumoBelleQuery.data]);

  const dias = faseAtiva === "fase1" ? diasFase1 : diasFase2;
  const carregando = faseAtiva === "fase1" ? resumoQuery.isLoading : resumoBelleQuery.isLoading;

  const fase1TemDivergencia = diasFase1.some((dia) => Math.abs(total(dia.diferenca)) > 0.005);
  const diasComDiferenca = dias.filter((dia) => Math.abs(total(dia.diferenca)) > 0.005).length;
  const diasComPendenteConfirmacao = diasFase2.filter((dia) => {
    const p = dia.pendenteConfirmacao;
    return p && (p.dinheiro || p.cartaoDebito || p.cartaoCredito || p.pix);
  }).length;

  function tentarMudarFase(fase: Fase) {
    if (fase === "fase2" && fase1TemDivergencia) {
      setConfirmarTrocaFase(true);
      return;
    }
    setFaseAtiva(fase);
  }

  // Texto de conciliação por dia (server/shared/conciliacao.ts) — mesma
  // lógica usada pelo server pro relatório do Telegram, aqui calculada
  // ao vivo com os itens já carregados (nenhuma chamada extra) pra
  // alimentar o hover das células vermelhas em "Diferença". Não vai mais
  // pra planilha nenhuma (só sistema/Telegram) desde 2026-09-02.
  const conciliacaoPorDiaFase1 = useMemo(() => {
    const mapa = new Map<string, string | null>();
    for (const dia of diasFase1) {
      const comandaItens = TODAS_FORMAS_SERVER.flatMap((f) => itensComandaPorCelula.get(`${dia.data}|${f}`) ?? []);
      const contasItens = TODAS_FORMAS_SERVER.flatMap((f) => itensPorCelula.get(`${dia.data}|${f}`) ?? []);
      mapa.set(dia.data, gerarTextoConciliacao(dia.data, comandaItens, contasItens));
    }
    return mapa;
  }, [diasFase1, itensComandaPorCelula, itensPorCelula]);

  const conciliacaoPorDiaFase2 = useMemo(() => {
    const mapa = new Map<string, string | null>();
    for (const dia of diasFase2) {
      const comandaItens = TODAS_FORMAS_SERVER.flatMap((f) => itensComandaPorCelula.get(`${dia.data}|${f}`) ?? []);
      const belleItens = TODAS_FORMAS_SERVER.flatMap((f) => itensBellePorCelula.get(`${dia.data}|${f}`) ?? []);
      mapa.set(dia.data, gerarTextoConciliacao(dia.data, comandaItens, belleItens, "Belle"));
    }
    return mapa;
  }, [diasFase2, itensComandaPorCelula, itensBellePorCelula]);

  const conciliacaoPorDia = faseAtiva === "fase1" ? conciliacaoPorDiaFase1 : conciliacaoPorDiaFase2;

  // Ao entrar no mês, o primeiro dia visível (esquerda) costumava ser
  // sempre dia 1 — mesmo quando ele está tudo certo e a divergência
  // real está lá na frente. Rola a tabela pra trazer o primeiro dia
  // com diferença pra a tela, sem precisar arrastar manualmente.
  useEffect(() => {
    if (modoVisualizacao !== "mes" || carregando) return;
    const diaComDivergencia = dias.find((dia) => Math.abs(total(dia.diferenca)) > 0.005);
    if (!diaComDivergencia) return;
    const el = document.getElementById(`conciliacao-dia-${diaComDivergencia.data}`);
    el?.scrollIntoView({ inline: "start", block: "nearest", behavior: "smooth" });
  }, [dias, modoVisualizacao, carregando]);

  function totais(campo: "comanda" | "ladoB" | "diferenca") {
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

  function itensDoDia(mapa: Map<string, ItemDetalhe[]>, data: string, formas: FormaServer[]): ItemDetalhe[] {
    return formas.flatMap((f) => mapa.get(`${data}|${f}`) ?? []);
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
    pendente,
  }: {
    valor: number;
    diferente?: boolean;
    itens?: ItemDetalhe[];
    auditavel?: boolean;
    negrito?: boolean;
    textoConciliacao?: string | null;
    pendente?: boolean;
  }) {
    const comHover = auditavel || !!textoConciliacao;
    const conteudo = (
      <span className={`tabular-nums ${comHover ? "underline decoration-dotted decoration-muted-foreground/50 cursor-help" : ""}`}>
        {fmtCurrencyCom(valor)}
      </span>
    );
    const icone = pendente ? (
      <AlertTriangle
        className="inline h-3 w-3 ml-1 mb-0.5 text-amber-600"
        title="Pendente confirmação — inclui parcela do Belle que ainda não confirmou o recebimento"
      />
    ) : null;
    const classe = `px-3 py-1.5 text-xs text-right whitespace-nowrap ${negrito ? "font-semibold" : ""} ${diferente ? "bg-red-100 text-red-700 font-medium" : ""}`;
    if (!comHover) return <td className={classe}>{conteudo}{icone}</td>;
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
        {icone}
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
    campo: "comanda" | "ladoB" | "diferenca";
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
                  pendente={destacarDiferenca ? dia.pendenteConfirmacao?.[forma.chave] : undefined}
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
            const p = dia.pendenteConfirmacao;
            return (
              <CelulaValor
                key={dia.data}
                valor={valor}
                diferente={diferente}
                negrito
                auditavel={auditavel}
                itens={auditavel ? buscarItens?.(dia.data, ["dinheiro", "debito", "credito", "pix"]) ?? [] : undefined}
                textoConciliacao={diferente ? buscarTextoConciliacao?.(dia.data) : undefined}
                pendente={destacarDiferenca && p ? p.dinheiro || p.cartaoDebito || p.cartaoCredito || p.pix : undefined}
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
        <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Conciliação PDV
        </h1>
        <UnidadeSelector />
      </div>

      {!unidadeId ? (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          Selecione uma unidade para continuar.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <Tabs value={faseAtiva} onValueChange={(v) => tentarMudarFase(v as Fase)}>
              <TabsList>
                <TabsTrigger value="fase1">Fase 1: Comanda x Caixa</TabsTrigger>
                {podeVerFase2 && <TabsTrigger value="fase2">Fase 2: Comanda x Belle</TabsTrigger>}
                {podeVerFase3 && <TabsTrigger value="fase3">Fase 3: Terapeutas</TabsTrigger>}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-1.5 flex-wrap">
              {faseAtiva !== "fase3" && !carregando && dias.length > 0 && (
                diasComDiferenca > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 whitespace-nowrap">
                    <AlertTriangle className="h-3 w-3" />
                    {diasComDiferenca} {diasComDiferenca === 1 ? "dia" : "dias"} com conciliação pendente
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 whitespace-nowrap">
                    Conciliação finalizada para o período
                  </span>
                )
              )}
              {faseAtiva === "fase2" && !carregando && dias.length > 0 && (
                diasComPendenteConfirmacao > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 whitespace-nowrap">
                    <AlertTriangle className="h-3 w-3" />
                    {diasComPendenteConfirmacao} {diasComPendenteConfirmacao === 1 ? "dia" : "dias"} pendente confirmação
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 whitespace-nowrap">
                    Confirmação OK para todos os dias
                  </span>
                )
              )}
            </div>
          </div>

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

          {faseAtiva !== "fase3" && (
          <>
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
                        <th key={dia.data} id={`conciliacao-dia-${dia.data}`} className="px-3 py-2 text-right text-xs font-medium whitespace-nowrap">
                          {fmtDiaCurto(dia.data)}
                          <span className="text-muted-foreground font-normal ml-1">{fmtDiaSemana(dia.data)}</span>
                        </th>
                      ))}
                      <th className="px-3 py-2 text-right text-xs font-medium whitespace-nowrap border-l">
                        {modoVisualizacao === "semana" ? "Semana" : "Mês"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <Secao
                      titulo="Comanda (Recepção)"
                      campo="comanda"
                      auditavel
                      buscarItens={(data, formas) => itensDoDia(itensComandaPorCelula, data, formas)}
                      acao={faseAtiva === "fase1" ? (
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
                      ) : undefined}
                    />
                    {faseAtiva === "fase1" ? (
                      <Secao
                        titulo={LADO_B_LABEL.fase1}
                        campo="ladoB"
                        auditavel
                        buscarItens={(data, formas) => itensDoDia(itensLadoBPorCelula, data, formas)}
                        formasSemAuditoria={["dinheiro"]}
                        acao={
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs font-normal"
                              disabled={sincronizarContasBancariasMutation.isPending}
                              onClick={handleSincronizarContasBancarias}
                              title="Enviar Débito, Crédito e Pix pro Informe de vendas (linhas 49-51)"
                            >
                              {sincronizarContasBancariasMutation.isPending ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <UploadCloud className="h-3 w-3 mr-1" />
                              )}
                              Sincronizar com Drive
                            </Button>
                            {!isRbs && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-xs font-normal"
                                disabled={enviarRelatorioRecepcaoMutation.isPending || !!statusEnvioRecepcaoQuery.data?.jaEnviadoHoje}
                                onClick={handleEnviarRecepcao}
                                title={statusEnvioRecepcaoQuery.data?.jaEnviadoHoje ? "Já enviado hoje pro grupo da recepção" : "Enviar o relatório de pendências do período pro grupo da recepção no Telegram"}
                              >
                                {enviarRelatorioRecepcaoMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : (
                                  <Send className="h-3 w-3 mr-1" />
                                )}
                                {statusEnvioRecepcaoQuery.data?.jaEnviadoHoje ? "Enviado hoje" : "Enviar recepção"}
                              </Button>
                            )}
                          </div>
                        }
                      />
                    ) : (
                      <Secao
                        titulo={LADO_B_LABEL.fase2}
                        campo="ladoB"
                        auditavel
                        buscarItens={(data, formas) => itensDoDia(itensLadoBPorCelula, data, formas)}
                        acao={
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs font-normal"
                              disabled={sincronizarBelleMutation.isPending}
                              onClick={handleSincronizarBelle}
                              title="Enviar Dinheiro, Débito, Crédito e Pix do Belle pro Informe de vendas (linhas 42-45)"
                            >
                              {sincronizarBelleMutation.isPending ? (
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              ) : (
                                <UploadCloud className="h-3 w-3 mr-1" />
                              )}
                              Sincronizar com Drive
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => setModalBelleAberto(true)}
                              title="Importar relatório 'Registros Financeiros' do Belle (.xlsx)"
                            >
                              <Upload className="h-3 w-3" />
                            </Button>
                          </div>
                        }
                      />
                    )}
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
            soma — em "Comanda (Recepção)", vem da Comanda virtual (item a item); em "{LADO_B_LABEL[faseAtiva]}",
            vem {faseAtiva === "fase1" ? "do que já está sincronizado nas contas (exceto Dinheiro)" : "do relatório financeiro importado do Belle"}.
            Na linha "Diferença", passe o mouse pra ver a conciliação completa do dia (Comanda x {LADO_B_LABEL[faseAtiva]}
            {" + ações corretivas sugeridas). \"Sincronizar com Drive\" envia os valores (não o texto da diferença, que fica só aqui e no Telegram) pro Informe de vendas — "}
            {faseAtiva === "fase1" ? "Contas bancárias, linhas 49-51." : "Belle, linhas 42-45."}
            {faseAtiva === "fase2" && (
              <> O ícone <AlertTriangle className="inline h-3 w-3 mb-0.5 text-amber-600" /> ao lado do valor indica que o dia
              inclui parcela do Belle ainda sem confirmação de recebimento (aparece mesmo quando a diferença zera).</>
            )}
          </p>
          </>
          )}

          {faseAtiva === "fase3" && (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                {divergenciasTerapeutasQuery.isLoading ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                  </div>
                ) : !divergenciasTerapeutasQuery.data?.length ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                    Nenhuma divergência de terapeuta encontrada no período.
                  </div>
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="px-3 py-2 text-left text-xs font-medium whitespace-nowrap">Data</th>
                        <th className="px-3 py-2 text-left text-xs font-medium whitespace-nowrap">Cliente</th>
                        <th className="px-3 py-2 text-left text-xs font-medium whitespace-nowrap">Terapia</th>
                        <th className="px-3 py-2 text-left text-xs font-medium whitespace-nowrap">Terapeuta (Comanda)</th>
                        <th className="px-3 py-2 text-left text-xs font-medium whitespace-nowrap">Terapeuta (Belle)</th>
                        <th className="px-3 py-2 text-left text-xs font-medium whitespace-nowrap">Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {divergenciasTerapeutasQuery.data.map((item, i) => (
                        <tr key={`${item.data}-${item.cliente}-${i}`} className="border-b last:border-0">
                          <td className="px-3 py-2 whitespace-nowrap">{fmtDiaCurto(item.data)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{item.cliente}</td>
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{item.terapia ?? "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{item.terapeutaComanda}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {item.terapeutaBelle ?? <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {item.situacao === "divergente" ? (
                              <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">Terapeuta diverge</span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Cliente não encontrado no Belle</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </Card>
          )}
          {faseAtiva === "fase3" && (
            <p className="text-xs text-muted-foreground">
              Cruza cada lançamento da Comanda (cliente + terapeuta) com os atendimentos do Belle no mesmo dia, casando pelo
              nome do cliente. "Terapeuta diverge" é quando o cliente foi encontrado nos dois sistemas mas o profissional
              registrado é diferente — provável seleção errada ao fechar no Belle. "Cliente não encontrado no Belle" pode ser
              isso mesmo, ou só o nome não ter batido (abreviação, acento, sobrenome faltando) — confira antes de tratar como erro.
            </p>
          )}
        </>
      )}

      <Dialog open={confirmarTrocaFase} onOpenChange={setConfirmarTrocaFase}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Comanda não está batendo com o caixa</DialogTitle>
            <DialogDescription>
              Recomendamos finalizar a Fase 1 antes de seguir para a Fase 2. Confirma que deseja mudar de aba mesmo assim?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarTrocaFase(false)}>Cancelar</Button>
            <Button onClick={() => { setFaseAtiva("fase2"); setConfirmarTrocaFase(false); }}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={modalBelleAberto}
        onOpenChange={(open) => {
          setModalBelleAberto(open);
          if (!open) setPreviewBelle(null);
        }}
      >
        <DialogContent>
          {!previewBelle ? (
            <>
              <DialogHeader>
                <DialogTitle>Importar relatório do Belle</DialogTitle>
                <DialogDescription>
                  No Belle: <strong>Controle de Contas a Receber</strong> → <strong>Outras opções</strong> → <strong>Gerar Excel</strong>.
                  Depois é só subir o arquivo aqui.
                </DialogDescription>
              </DialogHeader>
              <input
                ref={importarBelleRef}
                type="file"
                accept=".xlsx"
                disabled={importarBelleMutation.isPending}
                onChange={handleImportarBelle}
                className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:cursor-pointer disabled:opacity-50"
              />
              {importarBelleMutation.isPending && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Lendo arquivo...
                </p>
              )}
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Confirmar importação</DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-1 pt-1 text-sm text-foreground">
                    <p><span className="text-muted-foreground">Relatório:</span> Controle de Contas a Receber</p>
                    <p>
                      <span className="text-muted-foreground">Período:</span>{" "}
                      {fmtDataCompleta(previewBelle.periodoInicio)} a {fmtDataCompleta(previewBelle.periodoFim)}
                    </p>
                    <p><span className="text-muted-foreground">Unidade:</span> {unidadeSelecionada?.nome}</p>
                    <p><span className="text-muted-foreground">Lançamentos no arquivo:</span> {previewBelle.totalLinhas}</p>
                    <p className="pt-1 text-xs text-amber-700">
                      Isso apaga todo lançamento já existente da unidade acima entre{" "}
                      {fmtDataCompleta(previewBelle.periodoInicio)} e {fmtDataCompleta(previewBelle.periodoFim)}, e
                      sobe os {previewBelle.totalLinhas} do arquivo no lugar. Confira a unidade e o período antes de confirmar.
                    </p>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPreviewBelle(null)} disabled={importarBelleMutation.isPending}>
                  Cancelar
                </Button>
                <Button onClick={confirmarImportarBelle} disabled={importarBelleMutation.isPending}>
                  {importarBelleMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  Confirmar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
