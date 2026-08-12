import { useMemo, useRef, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DescricaoCombobox } from "@/components/DescricaoCombobox";
import { SplitLancamentoDialog } from "@/components/SplitLancamentoDialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, TrendingUp, DollarSign, Wallet, RefreshCw, Upload, AlertCircle, Plus, Check, Pencil, Search, TriangleAlert, ChevronsUpDown, StickyNote, SplitSquareHorizontal } from "lucide-react";
import { toast } from "sonner";

// ===== Períodos rápidos =====
type PeriodoRapido = "mes_vigente" | "15" | "30" | "60" | "mes_anterior" | "livre";

function calcularPeriodo(periodo: PeriodoRapido): { inicio: string; fim: string } {
  const hoje = new Date();
  if (periodo === "mes_anterior") {
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
    return { inicio: toIsoExtrato(inicio), fim: toIsoExtrato(fim) };
  }
  if (periodo === "15" || periodo === "30" || periodo === "60") {
    const dias = Number(periodo);
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - dias);
    return { inicio: toIsoExtrato(inicio), fim: toIsoExtrato(hoje) };
  }
  // mes_vigente (padrão)
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  return { inicio: toIsoExtrato(inicio), fim: toIsoExtrato(hoje) };
}

// ===== Agrupamento de tipo de operação (pra filtro) =====
function agruparOperacao(tipoTransacao: string | null, titulo: string | null): string {
  const texto = `${tipoTransacao ?? ""} ${titulo ?? ""}`.toLowerCase();
  if (texto.includes("pix")) return "Pix";
  if (texto.includes("antecipa")) return "Antecipação";
  if (texto.includes("boleto")) return "Boleto";
  if (texto.includes("cartão") || texto.includes("cartao")) return "Cartão";
  if (texto.includes("transfer")) return "Transferência";
  if (texto.includes("pagamento")) return "Pagamento";
  return "Outros";
}

// ===== Parser de CSV =====
// Formato esperado (com ou sem cabeçalho): data;descricao;tipo;valor
// data: AAAA-MM-DD ou DD/MM/AAAA — tipo: C (entrada) ou D (saída) — valor: sempre positivo, "," ou "." como decimal
interface LinhaCsv {
  data: string;
  descricao: string;
  tipo: "C" | "D";
  valor: number;
}

function parseDataCsv(raw: string, numeroLinha: number): string {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  throw new Error(`Linha ${numeroLinha}: data inválida "${raw}" (use AAAA-MM-DD ou DD/MM/AAAA)`);
}

function parseValorCsv(raw: string, numeroLinha: number): number {
  const limpo = raw.trim().replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(,|$))/g, "").replace(",", ".");
  const n = parseFloat(limpo);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Linha ${numeroLinha}: valor inválido "${raw}"`);
  return n;
}

function parseTipoCsv(raw: string, numeroLinha: number): "C" | "D" {
  const s = raw.trim().toUpperCase();
  if (s === "C" || s === "CREDITO" || s === "CRÉDITO" || s === "ENTRADA") return "C";
  if (s === "D" || s === "DEBITO" || s === "DÉBITO" || s === "SAIDA" || s === "SAÍDA") return "D";
  throw new Error(`Linha ${numeroLinha}: tipo inválido "${raw}" (use C ou D)`);
}

function parseCsvExtrato(texto: string): LinhaCsv[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length === 0) throw new Error("Arquivo vazio");

  const delimitador = linhas[0].includes(";") ? ";" : ",";
  const primeiraColuna = linhas[0].split(delimitador)[0]?.trim().toLowerCase();
  const temCabecalho = primeiraColuna === "data";
  const dados = temCabecalho ? linhas.slice(1) : linhas;

  return dados.map((linha, i) => {
    const numeroLinha = i + (temCabecalho ? 2 : 1);
    const campos = linha.split(delimitador);
    if (campos.length < 4) throw new Error(`Linha ${numeroLinha}: esperado 4 colunas (data;descricao;tipo;valor), encontrado ${campos.length}`);
    const [data, descricao, tipo, valor] = campos;
    return {
      data: parseDataCsv(data, numeroLinha),
      descricao: descricao.trim(),
      tipo: parseTipoCsv(tipo, numeroLinha),
      valor: parseValorCsv(valor, numeroLinha),
    };
  });
}

function fmtCurrencyExtrato(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

function fmtDateExtrato(iso: string): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function toIsoExtrato(date: Date): string {
  return date.toISOString().split("T")[0];
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

const CONTA_FORM_VAZIO = { nome: "", tipo: "conta_corrente" as "conta_corrente" | "caixa_fisico" | "cartao_credito", agencia: "", numeroConta: "", cnpj: "", saldoInicial: "", saldoInicialEm: "" };

type GrupoConta = "conta_corrente" | "caixa_fisico" | "cartao_credito";
type TipoConta = "inter_oauth" | "sicredi_oauth" | "manual" | "cartao_credito" | "conta_corrente" | "caixa_fisico";

// "Conta Corrente" inclui as duas contas sincronizadas por API (Inter/
// Sicredi, tipo *_oauth) — pro usuário são a mesma coisa que uma conta
// corrente manual (Mercado Pago), só muda como o extrato chega.
const TIPOS_POR_GRUPO: Record<GrupoConta, TipoConta[]> = {
  conta_corrente: ["inter_oauth", "sicredi_oauth", "conta_corrente"],
  caixa_fisico: ["caixa_fisico"],
  cartao_credito: ["cartao_credito"],
};

const GRUPOS_LABEL: Record<GrupoConta, string> = {
  conta_corrente: "Conta Corrente",
  caixa_fisico: "Caixa Físico",
  cartao_credito: "Cartões de Crédito",
};

export default function Extratos() {
  const { unidadeSelecionada } = useUnidade();
  const unidadeId = unidadeSelecionada?.id;
  const periodoInicial = calcularPeriodo("mes_vigente");

  const [dataInicioExtrato, setDataInicioExtrato] = useState(periodoInicial.inicio);
  const [dataFimExtrato, setDataFimExtrato] = useState(periodoInicial.fim);
  const [periodoAtivo, setPeriodoAtivo] = useState<PeriodoRapido>("mes_vigente");
  const [filtroTipoExtrato, setFiltroTipoExtrato] = useState<"todos" | "D" | "C">("todos");
  const [contaSelecionadaId, setContaSelecionadaId] = useState<string>("todas");
  const [gruposAtivos, setGruposAtivos] = useState<Set<GrupoConta>>(new Set<GrupoConta>(["conta_corrente", "caixa_fisico"]));

  function alternarGrupo(grupo: GrupoConta) {
    setGruposAtivos((atual) => {
      const novo = new Set(atual);
      if (novo.has(grupo)) novo.delete(grupo); else novo.add(grupo);
      return novo;
    });
    // Interagir com os grupos sempre volta pra visão agregada — não
    // faz sentido mexer no filtro de grupo olhando pra 1 conta só.
    setContaSelecionadaId("todas");
  }
  const [contaModalOpen, setContaModalOpen] = useState(false);
  const [contaEditandoId, setContaEditandoId] = useState<number | null>(null);
  const [contaForm, setContaForm] = useState(CONTA_FORM_VAZIO);
  const [soPendentes, setSoPendentes] = useState(false);
  const [ocultarDiasSemMovimento, setOcultarDiasSemMovimento] = useState(true);
  const [confirmarSyncTodas, setConfirmarSyncTodas] = useState(false);
  const [grupoOperacao, setGrupoOperacao] = useState<string>("todos");
  const [buscaTexto, setBuscaTexto] = useState("");
  const [buscaValor, setBuscaValor] = useState("");

  function selecionarPeriodo(periodo: PeriodoRapido) {
    setPeriodoAtivo(periodo);
    if (periodo === "livre") return;
    const { inicio, fim } = calcularPeriodo(periodo);
    setDataInicioExtrato(inicio);
    setDataFimExtrato(fim);
  }

  function abrirNovaConta() {
    setContaEditandoId(null);
    setContaForm(CONTA_FORM_VAZIO);
    setContaModalOpen(true);
  }

  function abrirEditarConta() {
    if (!contaAtual) return;
    setContaEditandoId(contaAtual.id);
    setContaForm({
      nome: contaAtual.nome,
      tipo: contaAtual.tipo === "cartao_credito" ? "cartao_credito" : contaAtual.tipo === "caixa_fisico" ? "caixa_fisico" : "conta_corrente",
      agencia: contaAtual.agencia ?? "",
      numeroConta: contaAtual.numeroConta ?? "",
      cnpj: contaAtual.cnpj ?? "",
      saldoInicial: contaAtual.saldoInicial ?? "",
      saldoInicialEm: contaAtual.saldoInicialEm ?? "",
    });
    setContaModalOpen(true);
  }

  const fileInputRef = useRef<HTMLInputElement>(null);
  const filePdfInputRef = useRef<HTMLInputElement>(null);
  const fileOfxInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const contasQuery = trpc.contas.list.useQuery(
    { unidadeId: unidadeId! },
    { enabled: !!unidadeId },
  );
  const contas = contasQuery.data ?? [];
  const contaIdSelecionada = contaSelecionadaId === "todas" ? undefined : Number(contaSelecionadaId);
  const contaAtual = contas.find((c) => c.id === contaIdSelecionada);

  const criarContaMutation = trpc.contas.create.useMutation({
    onSuccess: () => {
      toast.success("Conta criada.");
      setContaModalOpen(false);
      utils.contas.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const atualizarContaMutation = trpc.contas.atualizar.useMutation({
    onSuccess: () => {
      toast.success("Conta atualizada.");
      setContaModalOpen(false);
      utils.contas.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  function salvarConta() {
    if (!contaForm.nome.trim()) return;
    const saldoInicialNum = contaForm.saldoInicial ? parseFloat(contaForm.saldoInicial.replace(",", ".")) : undefined;
    const dados = {
      nome: contaForm.nome.trim(),
      tipo: contaForm.tipo,
      agencia: contaForm.agencia.trim() || undefined,
      numeroConta: contaForm.numeroConta.trim() || undefined,
      cnpj: contaForm.cnpj.trim() || undefined,
      saldoInicial: saldoInicialNum,
      saldoInicialEm: contaForm.saldoInicialEm || undefined,
    };
    if (contaEditandoId) {
      atualizarContaMutation.mutate({ id: contaEditandoId, ...dados });
    } else if (unidadeId) {
      criarContaMutation.mutate({ unidadeId, ...dados });
    }
  }

  const categoriasQuery = trpc.dreCategorias.list.useQuery();
  const categorias = categoriasQuery.data ?? [];
  const descricoesQuery = trpc.dreDescricoes.list.useQuery();
  const descricoes = descricoesQuery.data ?? [];

  const saldoNaDataQuery = trpc.contas.saldoNaData.useQuery(
    { contaId: contaIdSelecionada!, data: dataInicioExtrato },
    { enabled: !!contaIdSelecionada },
  );

  const categorizarMutation = trpc.inter.categorizar.useMutation({
    onSuccess: (data) => {
      if (data.regraAprendida) {
        toast.success("Categorizado — regra nova aprendida pra reconhecer essa contraparte sozinho da próxima vez.");
      }
      utils.inter.extratos.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const confirmarMutation = trpc.inter.confirmarSugestao.useMutation({
    onSuccess: () => utils.inter.extratos.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const atualizarNotaMutation = trpc.inter.atualizarNota.useMutation({
    onSuccess: () => {
      utils.inter.extratos.invalidate();
      setNotaModalId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const [notaModalId, setNotaModalId] = useState<number | null>(null);
  const [notaModalValor, setNotaModalValor] = useState("");

  function abrirNota(transacaoId: number, notaAtual: string | null) {
    setNotaModalId(transacaoId);
    setNotaModalValor(notaAtual ?? "");
  }

  function salvarNota() {
    if (notaModalId === null) return;
    atualizarNotaMutation.mutate({ transacaoId: notaModalId, nota: notaModalValor });
  }

  const reprocessarMutation = trpc.inter.reprocessarCategorias.useMutation({
    onSuccess: (data) => {
      toast.success(
        data.atualizados > 0
          ? `${data.atualizados} transação(ões) categorizada(s) automaticamente.`
          : "Nenhuma transação pendente bateu com as regras atuais.",
      );
      utils.inter.extratos.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const statusInterQuery = trpc.inter.status.useQuery(
    { unidadeId: unidadeId! },
    { enabled: !!unidadeId },
  );

  const saldoInterQuery = trpc.inter.saldo.useQuery(
    { unidadeId: unidadeId! },
    { enabled: !!unidadeId && statusInterQuery.data?.configurado === true, retry: false },
  );

  const tiposContaAtivos = useMemo(
    () => Array.from(gruposAtivos).flatMap((g) => TIPOS_POR_GRUPO[g]),
    [gruposAtivos],
  );

  const extratosQuery = trpc.inter.extratos.useQuery(
    { unidadeId: unidadeId!, dataInicio: dataInicioExtrato, dataFim: dataFimExtrato, contaId: contaIdSelecionada, tiposConta: contaIdSelecionada ? undefined : tiposContaAtivos },
    { enabled: !!unidadeId },
  );

  const splitsQuery = trpc.inter.splits.list.useQuery(
    { unidadeId: unidadeId!, dataInicio: dataInicioExtrato, dataFim: dataFimExtrato, contaId: contaIdSelecionada },
    { enabled: !!unidadeId },
  );
  const splitsPorTransacao = useMemo(() => {
    const mapa = new Map<number, NonNullable<typeof splitsQuery.data>[number][]>();
    for (const s of splitsQuery.data ?? []) {
      const lista = mapa.get(s.interExtratoId) ?? [];
      lista.push(s);
      mapa.set(s.interExtratoId, lista);
    }
    return mapa;
  }, [splitsQuery.data]);

  const [splitDialogTransacaoId, setSplitDialogTransacaoId] = useState<number | null>(null);

  const sincronizarInterMutation = trpc.inter.sincronizar.useMutation({
    onSuccess: (data) => {
      toast.success(`Sincronização concluída: ${data.totalInseridos} nova(s) transação(ões).`);
      extratosQuery.refetch();
      saldoInterQuery.refetch();
    },
    onError: (err) => toast.error(`Erro na sincronização: ${err.message}`),
  });

  const statusMpQuery = trpc.adquirentes.status.useQuery(
    { unidadeId: unidadeId! },
    { enabled: !!unidadeId },
  );

  const sincronizarMpMutation = trpc.contas.sincronizarMercadoPago.useMutation({
    onSuccess: (data) => {
      toast.success(`Sincronização concluída: ${data.totalInseridos} nova(s) transação(ões) de ${data.totalNoCsv} no relatório. Cruzamento SOURCE_ID: ${data.bateramSourceId}/${data.totalNoCsv} linhas identificadas.`);
      extratosQuery.refetch();
    },
    onError: (err) => toast.error(`Erro na sincronização: ${err.message}`),
  });

  const sincronizarCaixaFisicoMutation = trpc.contas.sincronizarCaixaFisico.useMutation({
    onSuccess: (data) => {
      toast.success(`Caixa Físico sincronizado: ${data.totalInseridos} nova(s) transação(ões) de ${data.totalLidos} lida(s).`);
      extratosQuery.refetch();
    },
    onError: (err) => toast.error(`Erro na sincronização do Caixa Físico: ${err.message}`),
  });

  const statusSicrediQuery = trpc.sicredi.status.useQuery(
    { unidadeId: unidadeId! },
    { enabled: !!unidadeId },
  );

  const sincronizarSicrediMutation = trpc.sicredi.sincronizar.useMutation({
    onSuccess: (data) => {
      toast.success(`Sincronização concluída: ${data.totalInseridos} nova(s) transação(ões).`);
      extratosQuery.refetch();
    },
    onError: (err) => toast.error(`Erro na sincronização: ${err.message}`),
  });

  const importarCsvMutation = trpc.inter.importarCsv.useMutation({
    onSuccess: (data) => {
      toast.success(`CSV importado: ${data.totalInseridos} nova(s) transação(ões) de ${data.totalLinhas} linha(s).`);
      utils.inter.extratos.invalidate();
    },
    onError: (err) => toast.error(`Erro ao importar CSV: ${err.message}`),
  });

  async function handleImportarCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !contaIdSelecionada) return;
    try {
      const texto = await file.text();
      const linhas = parseCsvExtrato(texto);
      importarCsvMutation.mutate({ contaId: contaIdSelecionada, linhas });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao ler o arquivo CSV");
    } finally {
      e.target.value = "";
    }
  }

  const importarPdfMutation = trpc.inter.importarPdf.useMutation({
    onSuccess: (data) => {
      toast.success(`PDF importado: ${data.totalInseridos} nova(s) transação(ões) de ${data.totalLinhas} encontrada(s).`);
      utils.inter.extratos.invalidate();
    },
    onError: (err) => toast.error(`Erro ao importar PDF: ${err.message}`),
  });

  async function handleImportarPdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !contaIdSelecionada) return;
    try {
      const pdfBase64 = await fileParaBase64(file);
      importarPdfMutation.mutate({ contaId: contaIdSelecionada, pdfBase64 });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao ler o arquivo PDF");
    } finally {
      e.target.value = "";
    }
  }

  const filePdfFaturaRef = useRef<HTMLInputElement>(null);
  const importarFaturaCartaoMutation = trpc.inter.importarFaturaCartao.useMutation({
    onSuccess: (data) => {
      toast.success(`Fatura ${data.emissor === "inter" ? "Inter" : "Sicredi"} importada: ${data.totalInseridos} nova(s) transação(ões) de ${data.totalLinhas} encontrada(s).`);
      utils.inter.extratos.invalidate();
    },
    onError: (err) => toast.error(`Erro ao importar fatura: ${err.message}`),
  });

  async function handleImportarFaturaCartao(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !contaIdSelecionada) return;
    try {
      const pdfBase64 = await fileParaBase64(file);
      importarFaturaCartaoMutation.mutate({ contaId: contaIdSelecionada, pdfBase64 });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao ler o arquivo PDF");
    } finally {
      e.target.value = "";
    }
  }

  const importarOfxMutation = trpc.inter.importarOfx.useMutation({
    onSuccess: (data) => {
      toast.success(`OFX importado: ${data.totalInseridos} nova(s) transação(ões) de ${data.totalLinhas} encontrada(s).`);
      utils.inter.extratos.invalidate();
    },
    onError: (err) => toast.error(`Erro ao importar OFX: ${err.message}`),
  });

  async function handleImportarOfx(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !contaIdSelecionada) return;
    try {
      const ofxTexto = await file.text();
      importarOfxMutation.mutate({ contaId: contaIdSelecionada, ofxTexto });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao ler o arquivo OFX");
    } finally {
      e.target.value = "";
    }
  }

  const transacoesExtrato = extratosQuery.data ?? [];

  const gruposDisponiveis = useMemo(() => {
    const grupos = new Set(transacoesExtrato.map((t) => agruparOperacao(t.tipoTransacao, t.titulo)));
    return Array.from(grupos).sort();
  }, [transacoesExtrato]);

  const valorBuscaNum = buscaValor.trim() ? parseFloat(buscaValor.replace(",", ".")) : null;

  // Todos os filtros exceto o tipo (C/D) — usado pra contar as abas
  // "Entradas/Saídas" já refletindo os outros filtros ativos.
  const transacoesAntesDoTipo = transacoesExtrato.filter((t) => {
    // Ocultar dias sem movimento (Caixa Físico: valor 0 e ocorrência "Vendas do dia") —
    // nunca esconde pendente/sugerida: o checkbox só existe na aba Caixa Físico, então em
    // qualquer outra aba (ex.: Consolidado) uma linha que precisa de revisão ficaria
    // escondida sem nenhum controle visível pra desligar o filtro (bug real: 10 sugeridas
    // de dias com R$0,00 sumiam do badge/lista mesmo com "Tipo de operação: Todos").
    if (
      ocultarDiasSemMovimento
      && t.origem === "caixa_fisico"
      && parseFloat(t.valor ?? "0") === 0
      && t.categorizacaoStatus !== "pendente"
      && t.categorizacaoStatus !== "sugerida"
    ) return false;
    if (soPendentes && t.categorizacaoStatus === "confirmada") return false;
    if (grupoOperacao !== "todos" && agruparOperacao(t.tipoTransacao, t.titulo) !== grupoOperacao) return false;
    if (buscaTexto.trim()) {
      const alvo = `${t.titulo ?? ""} ${t.descricao ?? ""}`.toLowerCase();
      if (!alvo.includes(buscaTexto.trim().toLowerCase())) return false;
    }
    if (valorBuscaNum !== null && !Number.isNaN(valorBuscaNum)) {
      if (Math.abs(parseFloat(t.valor) - valorBuscaNum) > 0.005) return false;
    }
    return true;
  });

  const transacoesFiltradasExtrato = filtroTipoExtrato === "todos"
    ? transacoesAntesDoTipo
    : transacoesAntesDoTipo.filter((t) => t.tipoOperacao === filtroTipoExtrato);

  const totalCreditosExtrato = transacoesExtrato.filter((t) => t.tipoOperacao === "C").reduce((s, t) => s + parseFloat(t.valor ?? "0"), 0);
  const totalDebitosExtrato = transacoesExtrato.filter((t) => t.tipoOperacao === "D").reduce((s, t) => s + parseFloat(t.valor ?? "0"), 0);
  const saldoExtrato = totalCreditosExtrato - totalDebitosExtrato;

  // Saldo corrido por linha — só calculável com uma conta específica
  // selecionada e com saldo inicial cadastrado (âncora vinda do backend).
  // transacoesExtrato vem mais recente primeiro; a soma corrida precisa
  // ser feita da mais antiga pra mais nova, depois mapeada de volta.
  const saldosPorTransacao = useMemo(() => {
    const mapa = new Map<number, number>();
    if (saldoNaDataQuery.data == null) return mapa;
    const ordemCronologica = [...transacoesExtrato].reverse();
    let acumulado = saldoNaDataQuery.data;
    for (const t of ordemCronologica) {
      acumulado += (t.tipoOperacao === "C" ? 1 : -1) * parseFloat(t.valor);
      mapa.set(t.id, acumulado);
    }
    return mapa;
  }, [transacoesExtrato, saldoNaDataQuery.data]);

  // Saldo do card de grupo (nenhuma conta específica selecionada) —
  // soma o saldo do Inter (via API) com o saldoImportado (via OFX/CSV)
  // de cada conta do(s) grupo(s) ativo(s). Cartão de crédito nunca
  // entra aqui (é passivo, não soma com saldo de ativo — mostra
  // "Fatura em aberto" à parte, ver renderização do card). null se
  // nenhuma conta do grupo tem saldo disponível ainda, pra não mostrar
  // "R$ 0,00" enganoso.
  const saldoConsolidado = useMemo(() => {
    let total = 0;
    let temAlgum = false;
    if (tiposContaAtivos.includes("inter_oauth") && statusInterQuery.data?.configurado && saldoInterQuery.data) {
      total += parseFloat(saldoInterQuery.data.disponivel);
      temAlgum = true;
    }
    for (const c of contas) {
      if (c.tipo === "inter_oauth" || c.tipo === "cartao_credito") continue;
      if (tiposContaAtivos.includes(c.tipo) && c.saldoImportado) {
        total += parseFloat(c.saldoImportado);
        temAlgum = true;
      }
    }
    return temAlgum ? total : null;
  }, [contas, statusInterQuery.data, saldoInterQuery.data, tiposContaAtivos]);

  function nomeConta(contaId: number | null) {
    if (!contaId) return "—";
    return contas.find((c) => c.id === contaId)?.nome ?? "—";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Contas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Todas as contas em único lugar — bancos, caixa físico e cartões (em breve)
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
          {!statusInterQuery.data?.configurado && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-900">Banco Inter não configurado</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Acesse <strong>Configurações → Banco Inter</strong> para sincronizar automaticamente,
                      ou importe um extrato manualmente numa conta abaixo.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 md:grid-cols-3">
            <Card className="border-border/50 shadow-sm py-2.5">
              <CardContent className="px-4">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <Wallet className="h-3.5 w-3.5" />
                  {!contaAtual ? (gruposAtivos.size === 1 && gruposAtivos.has("cartao_credito") ? "Fatura em aberto" : "Saldo") : contaAtual.tipo === "inter_oauth" ? "Saldo Disponível (Inter)" : contaAtual.tipo === "cartao_credito" ? "Fatura em aberto" : `Saldo (${contaAtual.nome})`}
                </CardDescription>
                {!contaAtual ? (
                  gruposAtivos.size === 1 && gruposAtivos.has("cartao_credito") ? (
                    <div className="text-base font-bold mt-0.5">{fmtCurrencyExtrato(totalDebitosExtrato - totalCreditosExtrato)}</div>
                  ) : saldoConsolidado !== null ? (
                    <div className="text-base font-bold mt-0.5">{fmtCurrencyExtrato(saldoConsolidado)}</div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Nenhuma conta com saldo configurado ainda</span>
                  )
                ) : contaAtual.tipo === "cartao_credito" ? (
                  <div className="text-base font-bold mt-0.5">{fmtCurrencyExtrato(totalDebitosExtrato - totalCreditosExtrato)}</div>
                ) : contaAtual.tipo === "inter_oauth" ? (
                  saldoInterQuery.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-0.5" />
                  ) : saldoInterQuery.data ? (
                    <div className="text-base font-bold mt-0.5">{fmtCurrencyExtrato(saldoInterQuery.data.disponivel)}</div>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )
                ) : contaAtual.saldoImportado ? (
                  <>
                    <div className="text-base font-bold mt-0.5">{fmtCurrencyExtrato(contaAtual.saldoImportado)}</div>
                    <div className="text-[11px] text-muted-foreground">conforme OFX de {fmtDateExtrato(contaAtual.saldoImportadoEm ?? "")}</div>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">Importe um OFX pra ver o saldo</span>
                )}
              </CardContent>
            </Card>
            <Card className="border-border/50 shadow-sm py-2.5">
              <CardContent className="px-4">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <TrendingUp className="h-3.5 w-3.5 text-green-600" /> Entradas no Período{contaAtual ? "" : " (grupo)"}
                </CardDescription>
                <div className="text-base font-bold text-green-700 mt-0.5">{fmtCurrencyExtrato(totalCreditosExtrato)}</div>
              </CardContent>
            </Card>
            <Card className="border-border/50 shadow-sm py-2.5">
              <CardContent className="px-4">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <DollarSign className="h-3.5 w-3.5 text-red-500" /> Saídas no Período{contaAtual ? "" : " (grupo)"}
                </CardDescription>
                <div className="text-base font-bold text-red-600 mt-0.5">{fmtCurrencyExtrato(totalDebitosExtrato)}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50 shadow-sm">
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                {(Object.keys(GRUPOS_LABEL) as GrupoConta[]).map((grupo) => (
                  <label key={grupo} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={gruposAtivos.has(grupo)} onCheckedChange={() => alternarGrupo(grupo)} />
                    {GRUPOS_LABEL[grupo]}
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Tabs value={contaSelecionadaId} onValueChange={setContaSelecionadaId}>
                  <TabsList className="h-auto flex-wrap justify-start p-1">
                    {contas.map((c) => (
                      <TabsTrigger key={c.id} value={String(c.id)} className="text-sm">{c.nome}</TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                {contaAtual && (
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" title="Editar conta" onClick={abrirEditarConta}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Dialog open={contaModalOpen} onOpenChange={setContaModalOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={abrirNovaConta}>
                      <Plus className="h-3.5 w-3.5 mr-1" /> Nova conta
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{contaEditandoId ? "Editar conta" : "Nova conta"}</DialogTitle>
                      <DialogDescription>
                        Ex.: "Caixa", "Poupança", "Maquininha Stone". Contas novas só recebem extrato por importação (OFX/CSV/PDF).
                        Ag/conta/CNPJ ajudam a identificar transferências entre contas próprias automaticamente.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Nome</Label>
                        <Input
                          placeholder="Nome da conta"
                          value={contaForm.nome}
                          onChange={(e) => setContaForm({ ...contaForm, nome: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Tipo</Label>
                        <Select value={contaForm.tipo} onValueChange={(v) => setContaForm({ ...contaForm, tipo: v as "conta_corrente" | "caixa_fisico" | "cartao_credito" })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="conta_corrente">Conta Corrente</SelectItem>
                            <SelectItem value="caixa_fisico">Caixa Físico</SelectItem>
                            <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Agência</Label>
                          <Input
                            placeholder="0001"
                            value={contaForm.agencia}
                            onChange={(e) => setContaForm({ ...contaForm, agencia: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Conta</Label>
                          <Input
                            placeholder="00000-0"
                            value={contaForm.numeroConta}
                            onChange={(e) => setContaForm({ ...contaForm, numeroConta: e.target.value })}
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">CNPJ</Label>
                        <Input
                          placeholder="00.000.000/0001-00"
                          value={contaForm.cnpj}
                          onChange={(e) => setContaForm({ ...contaForm, cnpj: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Saldo inicial</Label>
                          <Input
                            placeholder="0,00"
                            value={contaForm.saldoInicial}
                            onChange={(e) => setContaForm({ ...contaForm, saldoInicial: e.target.value })}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Em (data)</Label>
                          <Input
                            type="date"
                            value={contaForm.saldoInicialEm}
                            onChange={(e) => setContaForm({ ...contaForm, saldoInicialEm: e.target.value })}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        O saldo inicial numa data conhecida alimenta a coluna "Saldo" corrido na tabela.
                      </p>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={salvarConta}
                        disabled={!contaForm.nome.trim() || criarContaMutation.isPending || atualizarContaMutation.isPending}
                      >
                        {(criarContaMutation.isPending || atualizarContaMutation.isPending) ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                        {contaEditandoId ? "Salvar" : "Criar"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Período</Label>
                  <div className="flex gap-1 flex-wrap">
                    {([
                      ["mes_vigente", "Mês vigente"],
                      ["15", "15 dias"],
                      ["30", "30 dias"],
                      ["60", "60 dias"],
                      ["mes_anterior", "Mês anterior"],
                    ] as [PeriodoRapido, string][]).map(([valor, label]) => (
                      <Button
                        key={valor}
                        size="sm"
                        variant={periodoAtivo === valor ? "default" : "outline"}
                        className="h-8 text-xs"
                        onClick={() => selecionarPeriodo(valor)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data início</Label>
                  <Input
                    type="date"
                    value={dataInicioExtrato}
                    onChange={(e) => { setDataInicioExtrato(e.target.value); setPeriodoAtivo("livre"); }}
                    className="w-40 h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Data fim</Label>
                  <Input
                    type="date"
                    value={dataFimExtrato}
                    onChange={(e) => { setDataFimExtrato(e.target.value); setPeriodoAtivo("livre"); }}
                    className="w-40 h-8 text-sm"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={() => extratosQuery.refetch()} disabled={extratosQuery.isFetching}>
                  {extratosQuery.isFetching ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Atualizar
                </Button>

                {!contaAtual && (
                  <AlertDialog open={confirmarSyncTodas} onOpenChange={setConfirmarSyncTodas}>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        disabled={sincronizarInterMutation.isPending || sincronizarMpMutation.isPending || sincronizarCaixaFisicoMutation.isPending || sincronizarSicrediMutation.isPending}
                      >
                        {(sincronizarInterMutation.isPending || sincronizarMpMutation.isPending || sincronizarCaixaFisicoMutation.isPending || sincronizarSicrediMutation.isPending)
                          ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                        Sincronizar todas
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Confirmar sincronização de todas as contas</AlertDialogTitle>
                        <AlertDialogDescription>
                          Isso vai sincronizar todas as contas configuradas (Banco Inter, Mercado Pago, Sicredi e Caixa Físico) para a unidade selecionada no período atual. A sincronização do Mercado Pago pode demorar até 2 minutos. Deseja continuar?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => {
                          if (!unidadeId) return;
                          if (statusInterQuery.data?.configurado) {
                            sincronizarInterMutation.mutate({ unidadeId, dataInicio: dataInicioExtrato, dataFim: dataFimExtrato });
                          }
                          if (statusMpQuery.data?.mercadoPagoConfigurado) {
                            sincronizarMpMutation.mutate({ unidadeId, dataInicio: dataInicioExtrato, dataFim: dataFimExtrato });
                          }
                          if (statusSicrediQuery.data?.configurado) {
                            sincronizarSicrediMutation.mutate({ unidadeId, dataInicio: dataInicioExtrato, dataFim: dataFimExtrato });
                          }
                          sincronizarCaixaFisicoMutation.mutate({ unidadeId });
                          setConfirmarSyncTodas(false);
                        }}>
                          Sincronizar todas
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}

                {contaAtual?.tipo === "inter_oauth" && statusInterQuery.data?.configurado && (
                  <Button
                    size="sm"
                    onClick={() => sincronizarInterMutation.mutate({ unidadeId, dataInicio: dataInicioExtrato, dataFim: dataFimExtrato })}
                    disabled={sincronizarInterMutation.isPending}
                  >
                    {sincronizarInterMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                    Sincronizar com Inter
                  </Button>
                )}

                {contaAtual?.tipo === "sicredi_oauth" && statusSicrediQuery.data?.configurado && (
                  <Button
                    size="sm"
                    onClick={() => unidadeId && sincronizarSicrediMutation.mutate({ unidadeId, dataInicio: dataInicioExtrato, dataFim: dataFimExtrato })}
                    disabled={sincronizarSicrediMutation.isPending}
                  >
                    {sincronizarSicrediMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                    Sincronizar com Sicredi
                  </Button>
                )}

                {contaAtual?.nome === "Mercado Pago" && statusMpQuery.data?.mercadoPagoConfigurado && (
                  <Button
                    size="sm"
                    onClick={() => unidadeId && sincronizarMpMutation.mutate({ unidadeId, dataInicio: dataInicioExtrato, dataFim: dataFimExtrato })}
                    disabled={sincronizarMpMutation.isPending}
                  >
                    {sincronizarMpMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                    Sincronizar com Mercado Pago
                  </Button>
                )}

                {contaAtual?.tipo === "caixa_fisico" && (
                  <Button
                    size="sm"
                    onClick={() => unidadeId && sincronizarCaixaFisicoMutation.mutate({ unidadeId })}
                    disabled={sincronizarCaixaFisicoMutation.isPending}
                  >
                    {sincronizarCaixaFisicoMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                    Sincronizar Caixa Físico
                  </Button>
                )}
                {contaAtual?.tipo === "cartao_credito" ? (
                  <>
                    <input ref={filePdfFaturaRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleImportarFaturaCartao} />
                    <Button
                      size="sm"
                      onClick={() => filePdfFaturaRef.current?.click()}
                      disabled={!contaIdSelecionada || importarFaturaCartaoMutation.isPending}
                    >
                      {importarFaturaCartaoMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                      Importar Fatura
                    </Button>
                    <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportarCsv} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!contaIdSelecionada || importarCsvMutation.isPending}
                    >
                      {importarCsvMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                      Importar CSV
                    </Button>
                  </>
                ) : (
                  <>
                    <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportarCsv} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!contaIdSelecionada || importarCsvMutation.isPending}
                    >
                      {importarCsvMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                      Importar CSV
                    </Button>
                    <input ref={filePdfInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleImportarPdf} />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => filePdfInputRef.current?.click()}
                      disabled={!contaIdSelecionada || importarPdfMutation.isPending}
                    >
                      {importarPdfMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                      Importar PDF
                    </Button>
                    <input ref={fileOfxInputRef} type="file" accept=".ofx,application/x-ofx" className="hidden" onChange={handleImportarOfx} />
                    <Button
                      size="sm"
                      onClick={() => fileOfxInputRef.current?.click()}
                      disabled={!contaIdSelecionada || importarOfxMutation.isPending}
                    >
                      {importarOfxMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                      Importar OFX
                    </Button>
                  </>
                )}
              </div>

              <div className="flex flex-wrap gap-3 items-end border-t border-border/30 pt-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de operação</Label>
                  <Select value={grupoOperacao} onValueChange={setGrupoOperacao}>
                    <SelectTrigger className="w-40 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {gruposDisponiveis.map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Buscar por nome</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Ex.: Yamada, Caju..."
                      value={buscaTexto}
                      onChange={(e) => setBuscaTexto(e.target.value)}
                      className="w-48 h-8 text-sm pl-7"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Buscar por valor</Label>
                  <Input
                    placeholder="Ex.: 1500,00"
                    value={buscaValor}
                    onChange={(e) => setBuscaValor(e.target.value)}
                    className="w-32 h-8 text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 h-8 text-sm cursor-pointer">
                  <Checkbox checked={soPendentes} onCheckedChange={(v) => setSoPendentes(!!v)} />
                  Só falta tratar (pendente/sugerida)
                </label>
                {contaAtual?.tipo === "caixa_fisico" && (
                  <label className="flex items-center gap-2 h-8 text-sm cursor-pointer">
                    <Checkbox checked={ocultarDiasSemMovimento} onCheckedChange={(v) => setOcultarDiasSemMovimento(!!v)} />
                    Ocultar dias sem movimento
                  </label>
                )}
              </div>

              {(transacoesExtrato.some((t) => t.categorizacaoStatus === "pendente") || transacoesExtrato.some((t) => t.categorizacaoStatus === "sugerida")) && (
                <div className="flex justify-end items-center gap-2">
                  {transacoesExtrato.some((t) => t.categorizacaoStatus === "sugerida") && (
                    <Badge variant="outline" className="text-xs border-blue-400 text-blue-700">
                      {transacoesExtrato.filter((t) => t.categorizacaoStatus === "sugerida").length} sugerida(s), aguardando confirmação
                    </Badge>
                  )}
                  {transacoesExtrato.some((t) => t.categorizacaoStatus === "pendente") && (
                    <Badge variant="outline" className="text-xs border-amber-400 text-amber-700">
                      {transacoesExtrato.filter((t) => t.categorizacaoStatus === "pendente").length} pendente(s) de categorização
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs"
                    onClick={() => unidadeId && reprocessarMutation.mutate({ unidadeId, contaId: contaIdSelecionada, dataInicio: dataInicioExtrato, dataFim: dataFimExtrato })}
                    disabled={!unidadeId || reprocessarMutation.isPending}
                  >
                    {reprocessarMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    Reprocessar pendentes
                  </Button>
                </div>
              )}
              <Tabs value={filtroTipoExtrato} onValueChange={(v) => setFiltroTipoExtrato(v as "todos" | "D" | "C")}>
                <TabsList className="h-8">
                  <TabsTrigger value="todos" className="text-xs h-7">Todos ({transacoesAntesDoTipo.length})</TabsTrigger>
                  <TabsTrigger value="C" className="text-xs h-7">Entradas ({transacoesAntesDoTipo.filter((t) => t.tipoOperacao === "C").length})</TabsTrigger>
                  <TabsTrigger value="D" className="text-xs h-7">Saídas ({transacoesAntesDoTipo.filter((t) => t.tipoOperacao === "D").length})</TabsTrigger>
                </TabsList>
                <TabsContent value={filtroTipoExtrato} className="mt-3">
                  {extratosQuery.isLoading ? (
                    <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : transacoesFiltradasExtrato.length === 0 ? (
                    <div className="text-center py-12 text-sm text-muted-foreground">
                      {transacoesExtrato.length === 0
                        ? "Nenhuma transação neste período. Sincronize com o Inter ou importe um extrato."
                        : "Nenhuma transação encontrada com o filtro selecionado."}
                    </div>
                  ) : (
                    <div className="rounded-md border border-border/50 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="text-xs w-24">Data</TableHead>
                            <TableHead className="text-xs">Descrição</TableHead>
                            <TableHead className="text-xs w-32">Conta</TableHead>
                            <TableHead className="text-xs w-20">Origem</TableHead>
                            <TableHead className="text-xs w-64">Descrição DRE</TableHead>
                            <TableHead className="text-xs text-right w-32">Valor</TableHead>
                            {contaAtual && <TableHead className="text-xs text-right w-32">Saldo</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transacoesFiltradasExtrato.map((t) => (
                            <TableRow key={t.id} className="text-sm">
                              <TableCell className="text-xs text-muted-foreground">{fmtDateExtrato(t.dataEntrada)}</TableCell>
                              <TableCell>
                                <div className="font-medium text-sm leading-tight flex items-center gap-1.5">
                                  {t.titulo || t.tipoTransacao || "—"}
                                  {t.alerta && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <TriangleAlert className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                      </TooltipTrigger>
                                      <TooltipContent>{t.alerta}</TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                                {t.descricao && <div className="text-xs text-muted-foreground truncate max-w-xs">{t.descricao}</div>}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{nomeConta(t.contaId)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs font-normal">
                                  {t.origem === "csv" ? "CSV" : t.origem === "pdf" ? "PDF" : t.origem === "ofx" ? "OFX" : t.origem === "mercadopago" ? "Mercado Pago" : t.origem === "caixa_fisico" ? "Caixa Físico" : "Inter"}
                                </Badge>
                              </TableCell>
                              <TableCell className="max-w-0">
                                <div className="flex items-center gap-1">
                                  <div className="min-w-0 flex-1">
                                    {splitsPorTransacao.has(t.id) ? (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs justify-start font-normal w-full border-purple-400 text-purple-700 hover:text-purple-700"
                                        onClick={() => setSplitDialogTransacaoId(t.id)}
                                      >
                                        <SplitSquareHorizontal className="h-3 w-3 mr-1.5 shrink-0" />
                                        Dividido em {splitsPorTransacao.get(t.id)!.length}
                                      </Button>
                                    ) : (
                                      <DescricaoCombobox
                                        descricoes={descricoes}
                                        categorias={categorias}
                                        value={t.dreDescricaoId}
                                        status={t.categorizacaoStatus}
                                        onChange={(id) => categorizarMutation.mutate({
                                          transacaoId: t.id,
                                          dreDescricaoId: id,
                                        })}
                                      />
                                    )}
                                  </div>
                                  <div className="flex items-center shrink-0">
                                    {t.categorizacaoStatus === "sugerida" && !splitsPorTransacao.has(t.id) && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-blue-700 hover:text-green-700 hover:bg-green-50"
                                        title="Confirmar sugestão"
                                        onClick={() => confirmarMutation.mutate({ transacaoId: t.id })}
                                        disabled={confirmarMutation.isPending}
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    {!splitsPorTransacao.has(t.id) && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                        title="Dividir lançamento"
                                        onClick={() => setSplitDialogTransacaoId(t.id)}
                                      >
                                        <SplitSquareHorizontal className="h-3.5 w-3.5" />
                                      </Button>
                                    )}
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className={`h-6 w-6 ${t.nota ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-muted-foreground hover:text-foreground"}`}
                                      title={t.nota ? "Editar nota" : "Adicionar nota"}
                                      onClick={() => abrirNota(t.id, t.nota)}
                                    >
                                      <StickyNote className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                <span className={t.tipoOperacao === "C" ? "text-green-700" : "text-red-600"}>
                                  {t.tipoOperacao === "C" ? "+" : "-"}{fmtCurrencyExtrato(t.valor)}
                                </span>
                              </TableCell>
                              {contaAtual && (
                                <TableCell className="text-right text-xs text-muted-foreground">
                                  {saldosPorTransacao.has(t.id) ? fmtCurrencyExtrato(saldosPorTransacao.get(t.id)) : "—"}
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </Tabs>

              {transacoesFiltradasExtrato.length > 0 && (
                <div className="flex justify-end gap-6 pt-2 border-t border-border/30 text-sm">
                  <span className="text-muted-foreground">{transacoesFiltradasExtrato.length} transação(ões)</span>
                  <span className="font-semibold">
                    Saldo do período: <span className={saldoExtrato >= 0 ? "text-green-700" : "text-red-600"}>{fmtCurrencyExtrato(saldoExtrato)}</span>
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={notaModalId !== null} onOpenChange={(v) => { if (!v) setNotaModalId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nota</DialogTitle>
            <DialogDescription>Esclarece o caso específico desse lançamento — separado da Descrição DRE.</DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Do que se trata..."
            rows={4}
            value={notaModalValor}
            onChange={(e) => setNotaModalValor(e.target.value)}
          />
          <DialogFooter>
            <Button onClick={salvarNota} disabled={atualizarNotaMutation.isPending}>
              {atualizarNotaMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SplitLancamentoDialog
        open={splitDialogTransacaoId !== null}
        onOpenChange={(v) => { if (!v) setSplitDialogTransacaoId(null); }}
        transacao={transacoesExtrato.find((t) => t.id === splitDialogTransacaoId) ?? null}
        splitsExistentes={splitDialogTransacaoId ? splitsPorTransacao.get(splitDialogTransacaoId) ?? [] : []}
        descricoes={descricoes}
        categorias={categorias}
      />
    </div>
  );
}
