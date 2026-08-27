import React, { useMemo, useRef, useState, useEffect } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Users, Loader2, Phone, Mail, Calendar, Upload, UserCheck, IdCard, ArrowUp, ArrowDown, ArrowUpDown, X, MessageCircle, RefreshCw, ClipboardList, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { rotaInboxConversa } from "@shared/inboxNavigation";
import { ClienteWhatsAppButton } from "@/components/ClienteWhatsAppButton";
import { diasDesde } from "@/lib/utils";

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

function ImportarClientesCard() {
  const utils = trpc.useUtils();
  const { unidadeSelecionada } = useUnidade();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const atendimentosFileInputRef = useRef<HTMLInputElement>(null);
  const planosFileInputRef = useRef<HTMLInputElement>(null);
  const [unidadeImport, setUnidadeImport] = useState<"rbs" | "ssu">("ssu");
  const [relatorioReindex, setRelatorioReindex] = useState<{
    totalClientes: number;
    clientesIndexados: number;
    clientesSemTelefoneValido: number;
    telefonesIndexados: number;
    numerosCompartilhados: number;
    maiorGrupoTamanho: number;
    distribuicaoGrupos: { tamanho2: number; tamanho3: number; tamanho4Mais: number };
    gruposComCpfDuplicado: number;
    cpfsComMultiplosCadastros: number;
    amostraCpfsDuplicados: Array<{ cpf: string; clientes: Array<{ nome: string; ssu: boolean; rbs: boolean }> }>;
    amostraMaioresGrupos: Array<{ numeroCanonico: string; clientes: Array<{ nome: string; cpf: string | null }> }>;
    conversasAtualizadas: number;
  } | null>(null);

  const resumoQuery = trpc.clientes.resumoImportados.useQuery();

  const importarMutation = trpc.clientes.importarXlsx.useMutation({
    onSuccess: (data) => {
      toast.success(`Planilha importada: ${data.inseridos} novo(s), ${data.atualizados} atualizado(s)${data.promovidosDeLead ? `, ${data.promovidosDeLead} lead(s) do Inbox promovido(s) a cliente` : ""} de ${data.totalLinhas} linha(s).`);
      if (data.lids?.conversasPromovidas) {
        toast.success(`${data.lids.conversasPromovidas} conversa(s) do Inbox identificada(s) automaticamente.`);
      }
      utils.clientes.resumoImportados.invalidate();
      utils.clientes.listImportados.invalidate();
    },
    onError: (err) => toast.error(`Erro ao importar planilha: ${err.message}`),
  });

  const importarAtendimentosMutation = trpc.clientes.importarAtendimentosXlsx.useMutation({
    onSuccess: (data) => {
      toast.success(`Atendimentos espelhados: ${data.inseridos} novo(s), ${data.atualizados} atualizado(s), ${data.vinculadosComSeguranca} vínculo(s) seguro(s).`);
      if (data.ambiguos || data.semVinculo) {
        toast.message(`${data.ambiguos} ambíguo(s) e ${data.semVinculo} sem vínculo foram preservados para revisão.`);
      }
      utils.clientes.historicoAtendimentosBelle.invalidate();
    },
    onError: (err) => toast.error(`Erro ao importar atendimentos: ${err.message}`),
  });

  const importarPlanosMutation = trpc.clientes.importarPlanosXls.useMutation({
    onSuccess: (data) => {
      toast.success(`Planos espelhados: ${data.planosInseridos} novo(s), ${data.planosAtualizados} atualizado(s), ${data.planosVinculadosComSeguranca} vínculo(s) seguro(s).`);
      toast.message(`${data.totalServicos} serviço(s) de plano processado(s); ${data.planosAmbiguos} ambíguo(s) e ${data.planosSemVinculo} sem vínculo foram preservados para revisão.`);
      utils.clientes.planosBelle.invalidate();
    },
    onError: (err) => toast.error(`Erro ao importar planos: ${err.message}`),
  });

  const reindexarMutation = trpc.clientes.reindexarTelefones.useMutation({
    onSuccess: (data) => setRelatorioReindex(data),
    onError: (err) => toast.error(`Erro ao reindexar telefones: ${err.message}`),
  });

  const resolverLidsMutation = trpc.clientes.resolverLids.useMutation({
    onSuccess: (data) => {
      toast.success(`LIDs resolvidos: ${data.resolvidos} de ${data.totalTelefones} telefone(s)${data.semWhatsapp ? `, ${data.semWhatsapp} sem WhatsApp` : ""}${data.erros ? `, ${data.erros} com erro` : ""}.`);
      if (data.conversasPromovidas) {
        toast.success(`${data.conversasPromovidas} conversa(s) do Inbox identificada(s) automaticamente.`);
      }
    },
    onError: (err) => toast.error(`Erro ao resolver LIDs: ${err.message}`),
  });

  async function handleImportar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const xlsxBase64 = await fileParaBase64(file);
      importarMutation.mutate({ unidade: unidadeImport, xlsxBase64 });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao ler o arquivo");
    } finally {
      e.target.value = "";
    }
  }

  async function handleImportarAtendimentos(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !unidadeSelecionada) return;
    try {
      const xlsxBase64 = await fileParaBase64(file);
      importarAtendimentosMutation.mutate({ unidadeId: unidadeSelecionada.id, xlsxBase64 });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao ler o relatório de atendimentos");
    } finally {
      e.target.value = "";
    }
  }

  async function handleImportarPlanos(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !unidadeSelecionada) return;
    try {
      const xlsxBase64 = await fileParaBase64(file);
      importarPlanosMutation.mutate({ unidadeId: unidadeSelecionada.id, xlsxBase64 });
    } catch (err: any) {
      toast.error(err.message ?? "Falha ao ler o relatório de planos");
    } finally {
      e.target.value = "";
    }
  }

  const resumo = resumoQuery.data;

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          <UserCheck className="h-4 w-4" /> Base local de clientes
        </CardTitle>
        <CardDescription>
          Importada da planilha "[Buddha] Clientes" exportada do Belle (acesso via API negado — precisa de autorização do franqueador).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{resumo?.total ?? 0} no total</Badge>
          <Badge variant="outline" className="border-emerald-300 text-emerald-700">{resumo?.ssu ?? 0} só Santa Úrsula</Badge>
          <Badge variant="outline" className="border-blue-300 text-blue-700">{resumo?.rbs ?? 0} só Ribeirão</Badge>
          <Badge variant="outline" className="border-amber-300 text-amber-700">{resumo?.ambas ?? 0} nas duas unidades</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={unidadeImport} onValueChange={(v) => setUnidadeImport(v as "rbs" | "ssu")}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ssu">Shopping Santa Úrsula</SelectItem>
              <SelectItem value="rbs">Ribeirão Shopping</SelectItem>
            </SelectContent>
          </Select>
          <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportar} />
          <input ref={atendimentosFileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportarAtendimentos} />
          <input ref={planosFileInputRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleImportarPlanos} />
          <Button
            size="sm"
            variant="outline"
            disabled={importarMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {importarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            Importar planilha (.xlsx)
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={importarAtendimentosMutation.isPending || !unidadeSelecionada}
            onClick={() => atendimentosFileInputRef.current?.click()}
          >
            {importarAtendimentosMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Calendar className="h-3.5 w-3.5 mr-1.5" />}
            Importar atendimentos ({unidadeSelecionada?.nome ?? "selecione a unidade"})
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={importarPlanosMutation.isPending || !unidadeSelecionada}
            onClick={() => planosFileInputRef.current?.click()}
          >
            {importarPlanosMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5 mr-1.5" />}
            Importar planos ({unidadeSelecionada?.nome ?? "selecione a unidade"})
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={reindexarMutation.isPending}
            onClick={() => reindexarMutation.mutate()}
          >
            {reindexarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Reindexar telefones
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={resolverLidsMutation.isPending || !unidadeSelecionada}
            onClick={() => unidadeSelecionada && resolverLidsMutation.mutate({ unidadeId: unidadeSelecionada.id })}
          >
            {resolverLidsMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
            Resolver LIDs ({unidadeSelecionada?.nome ?? "selecione a unidade"})
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Selecione a unidade dona da planilha antes de importar — clientes que já existem (mesmo ID da planilha) são atualizados,
          e passam a valer pra ambas as unidades se já constavam na outra.
        </p>
        <p className="text-xs text-muted-foreground">
          "Reindexar telefones" recalcula o índice usado pra detectar duplicidade de celular (ex.: mãe/filha com o mesmo número) —
          não altera nenhum cliente ou vínculo existente, só atualiza o índice interno e mostra um relatório.
        </p>
        <p className="text-xs text-muted-foreground">
          "Resolver LIDs" consulta o WhatsApp da unidade selecionada (seletor no topo da página) e guarda o identificador oculto
          (@lid) de cada telefone já cadastrado — isso permite ao Inbox identificar automaticamente o cliente mesmo quando o
          WhatsApp esconde o número real (ex.: confirmação de agendamento do Belle).
        </p>
        <p className="text-xs text-muted-foreground">
          "Importar atendimentos" espelha o relatório operacional da unidade escolhida e só vincula um registro quando o telefone
          corresponde a um único cliente nessa unidade; divergências ficam sem vínculo para revisão.
        </p>
        <p className="text-xs text-muted-foreground">
          "Importar planos" espelha validade e saldo por serviço. Como esse relatório não traz telefone, o vínculo é feito somente
          quando o nome do cliente é único na unidade; nomes repetidos continuam sem vínculo para revisão.
        </p>
      </CardContent>
      <Dialog open={!!relatorioReindex} onOpenChange={(open) => !open && setRelatorioReindex(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
              <ClipboardList className="h-4 w-4" /> Relatório de reindexação
            </DialogTitle>
          </DialogHeader>
          {relatorioReindex && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Total de clientes</span><span className="font-medium">{relatorioReindex.totalClientes}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Com telefone indexado</span><span className="font-medium">{relatorioReindex.clientesIndexados}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Sem telefone válido</span><span className="font-medium">{relatorioReindex.clientesSemTelefoneValido}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Números de telefone indexados</span><span className="font-medium">{relatorioReindex.telefonesIndexados}</span></div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Números compartilhados por 2+ clientes</span>
                <span className={`font-medium ${relatorioReindex.numerosCompartilhados > 0 ? "text-amber-700" : ""}`}>{relatorioReindex.numerosCompartilhados}</span>
              </div>
              {relatorioReindex.numerosCompartilhados > 0 && (
                <div className="pl-3 space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>— com 2 clientes</span><span>{relatorioReindex.distribuicaoGrupos.tamanho2}</span></div>
                  <div className="flex justify-between"><span>— com 3 clientes</span><span>{relatorioReindex.distribuicaoGrupos.tamanho3}</span></div>
                  <div className="flex justify-between"><span>— com 4+ clientes</span><span>{relatorioReindex.distribuicaoGrupos.tamanho4Mais}</span></div>
                  <div className="flex justify-between"><span>— maior grupo</span><span>{relatorioReindex.maiorGrupoTamanho} clientes</span></div>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Grupos com o mesmo CPF em 2+ cadastros</span>
                <span className={`font-medium ${relatorioReindex.gruposComCpfDuplicado > 0 ? "text-red-700" : ""}`}>{relatorioReindex.gruposComCpfDuplicado}</span>
              </div>
              {relatorioReindex.gruposComCpfDuplicado > 0 && (
                <p className="text-xs text-muted-foreground">
                  Mesmo CPF em cadastros diferentes = provavelmente o mesmo cliente importado 2x do Belle, não família dividindo número.
                </p>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">CPFs com mais de 1 cadastro (base inteira)</span>
                <span className={`font-medium ${relatorioReindex.cpfsComMultiplosCadastros > 0 ? "text-red-700" : ""}`}>{relatorioReindex.cpfsComMultiplosCadastros}</span>
              </div>
              {relatorioReindex.cpfsComMultiplosCadastros > 0 && (
                <p className="text-xs text-muted-foreground">
                  Inclui cadastros com telefones diferentes entre si — ex.: mesmo cliente registrado uma vez por unidade, com belleId distinto em cada.
                </p>
              )}
              {relatorioReindex.amostraCpfsDuplicados.length > 0 && (
                <div className="pt-2 border-t space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">CPFs duplicados (amostra):</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {relatorioReindex.amostraCpfsDuplicados.map((g) => (
                      <div key={g.cpf} className="text-xs">
                        <span className="font-medium">{g.cpf}</span>
                        <span className="text-muted-foreground">
                          {": "}
                          {g.clientes.map((c, i) => (
                            <span key={i}>
                              {i > 0 && ", "}
                              {c.nome} ({c.ssu && c.rbs ? "SSU+RBS" : c.ssu ? "SSU" : c.rbs ? "RBS" : "—"})
                            </span>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Conversas do Inbox atualizadas</span><span className="font-medium">{relatorioReindex.conversasAtualizadas}</span></div>
              {relatorioReindex.amostraMaioresGrupos.length > 0 && (
                <div className="pt-2 border-t space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Maiores grupos (amostra):</p>
                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {relatorioReindex.amostraMaioresGrupos.map((g) => (
                      <div key={g.numeroCanonico} className="text-xs">
                        <div className="font-medium">{g.numeroCanonico} ({g.clientes.length})</div>
                        <div className="text-muted-foreground">
                          {g.clientes.map((c, i) => (
                            <span key={i}>
                              {i > 0 && ", "}
                              {c.nome}
                              {c.cpf && <span className="text-[10px]"> [{c.cpf}]</span>}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function fmtDataBr(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

type OrderCol = "nome" | "celular" | "cpf" | "dataNascimento" | "qtdAtendimentosFinalizados" | "ultimoAtendimento";
const PAGE_SIZE = 50;

function SortTh({ col, label, orderBy, orderDir, onSort, className }: {
  col: OrderCol; label: string; orderBy: OrderCol; orderDir: "asc" | "desc";
  onSort: (col: OrderCol) => void; className?: string;
}) {
  const active = orderBy === col;
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap ${className ?? ""}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? (orderDir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />)
          : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </span>
    </TableHead>
  );
}

export default function Clientes() {
  const { user } = useAuth();
  const { unidadeSelecionada } = useUnidade();
  const [, setLocation] = useLocation();
  const [searchValue, setSearchValue] = useState("");
  const [selectedCliente, setSelectedCliente] = useState<any>(null);
  const [orderBy, setOrderBy] = useState<OrderCol>("nome");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const clientesQuery = trpc.clientes.listImportados.useQuery(undefined, { enabled: !!unidadeSelecionada });
  const historicoAtendimentosInput = useMemo(() => ({
    unidadeId: unidadeSelecionada?.id ?? 0,
    clienteId: selectedCliente?.id ?? 0,
  }), [unidadeSelecionada?.id, selectedCliente?.id]);
  const historicoAtendimentosQuery = trpc.clientes.historicoAtendimentosBelle.useQuery(historicoAtendimentosInput, {
    enabled: !!unidadeSelecionada && !!selectedCliente,
  });
  const planosBelleQuery = trpc.clientes.planosBelle.useQuery(historicoAtendimentosInput, {
    enabled: !!unidadeSelecionada && !!selectedCliente,
  });
  const chamadoOpcoesQuery = trpc.chamados.opcoes.useQuery(historicoAtendimentosInput, {
    enabled: !!unidadeSelecionada && !!selectedCliente,
  });
  const salvarPreferenciaTerapeutaMutation = trpc.chamados.salvarPreferenciaCliente.useMutation({
    onSuccess: () => {
      chamadoOpcoesQuery.refetch();
      toast.success("Preferência de terapeuta atualizada.");
    },
    onError: (erro) => toast.error(`Não foi possível atualizar a preferência: ${erro.message}`),
  });

  function toggleSort(col: OrderCol) {
    if (orderBy === col) setOrderDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setOrderBy(col); setOrderDir("asc"); }
    setPage(1);
  }

  const isRbs = unidadeSelecionada?.slug?.includes("ribeirao") || unidadeSelecionada?.slug?.includes("rbs");
  const termoBusca = searchValue.trim().toLowerCase();

  const clientesFiltrados = useMemo(() => {
    let lista = (clientesQuery.data ?? []).filter((c) => (isRbs ? c.clienteRbs : c.clienteSsu));

    if (termoBusca) {
      lista = lista.filter((c) => {
        const nascimentoBr = fmtDataBr(c.dataNascimento).toLowerCase();
        return (
          c.nome.toLowerCase().includes(termoBusca) ||
          (c.cpf ?? "").toLowerCase().includes(termoBusca) ||
          (c.celular ?? "").toLowerCase().includes(termoBusca) ||
          nascimentoBr.includes(termoBusca)
        );
      });
    }

    return [...lista].sort((a, b) => {
      let cmp = 0;
      switch (orderBy) {
        case "nome": cmp = a.nome.localeCompare(b.nome, "pt-BR"); break;
        case "celular": cmp = (a.celular ?? "").localeCompare(b.celular ?? ""); break;
        case "cpf": cmp = (a.cpf ?? "").localeCompare(b.cpf ?? ""); break;
        case "dataNascimento": cmp = (a.dataNascimento ?? "").localeCompare(b.dataNascimento ?? ""); break;
        case "qtdAtendimentosFinalizados": cmp = a.qtdAtendimentosFinalizados - b.qtdAtendimentosFinalizados; break;
        case "ultimoAtendimento": cmp = (a.ultimoAtendimento ?? "").localeCompare(b.ultimoAtendimento ?? ""); break;
      }
      return orderDir === "asc" ? cmp : -cmp;
    });
  }, [clientesQuery.data, isRbs, termoBusca, orderBy, orderDir]);

  useEffect(() => { setPage(1); }, [termoBusca, unidadeSelecionada?.id]);

  const totalPages = Math.max(1, Math.ceil(clientesFiltrados.length / PAGE_SIZE));
  const clientesPagina = clientesFiltrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const isLoading = clientesQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Clientes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Base local, importada da planilha do Belle (acesso via API negado)
          </p>
        </div>
        <UnidadeSelector />
      </div>

      {/* Importar planilha é ação de back-office (popula a base das 2
          unidades de uma vez) — os badges também expõem contagem da
          outra unidade, que uma conta restrita a 1 unidade não deveria
          ver. Só admin. */}
      {/* Search bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Nome, celular, CPF ou nascimento..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="pl-10 pr-8"
        />
        {searchValue && (
          <button
            type="button"
            onClick={() => setSearchValue("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : clientesFiltrados.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {unidadeSelecionada ? "Nenhum cliente encontrado." : "Selecione uma unidade para ver os clientes."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortTh col="nome" label="Cliente" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <SortTh col="celular" label="Contato" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} className="max-w-[150px]" />
                    <SortTh col="cpf" label="CPF" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <SortTh col="dataNascimento" label="Nascimento" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <SortTh col="qtdAtendimentosFinalizados" label="Visitas" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} className="text-center" />
                    <SortTh col="ultimoAtendimento" label="Última visita" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <TableHead className="w-12 text-center" aria-label="WhatsApp">
                      <MessageCircle className="mx-auto h-4 w-4 text-emerald-600" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientesPagina.map((cliente) => (
                    <Dialog key={cliente.id}>
                      <DialogTrigger asChild>
                        <TableRow className="cursor-pointer" onClick={() => setSelectedCliente(cliente)}>
                          <TableCell className="py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium">{cliente.nome}</span>
                              {user?.role === "admin" && cliente.clienteSsu && cliente.clienteRbs && (
                                <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px] px-1 py-0">
                                  2 unidades
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2 max-w-[150px]">
                            <div className="space-y-0.5">
                              {cliente.celular && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 truncate" title={cliente.celular}>
                                  <Phone className="h-3 w-3 shrink-0" /> <span className="truncate">{cliente.celular}</span>
                                </p>
                              )}
                              {cliente.email && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 truncate" title={cliente.email}>
                                  <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{cliente.email}</span>
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2 text-xs whitespace-nowrap">{cliente.cpf || "—"}</TableCell>
                          <TableCell className="py-2 text-xs whitespace-nowrap">{fmtDataBr(cliente.dataNascimento)}</TableCell>
                          <TableCell className="py-2 text-xs text-center tabular-nums">{cliente.qtdAtendimentosFinalizados}</TableCell>
                          <TableCell className="py-2 text-xs whitespace-nowrap">
                            {fmtDataBr(cliente.ultimoAtendimento)}
                            {diasDesde(cliente.ultimoAtendimento) !== null && (
                              <span className="text-muted-foreground"> ({diasDesde(cliente.ultimoAtendimento)}d)</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-center">
                              <ClienteWhatsAppButton
                                cliente={cliente}
                                unidadeId={unidadeSelecionada?.id}
                                onOpenInbox={(conversaId) => setLocation(rotaInboxConversa(conversaId))}
                              />
                          </TableCell>
                        </TableRow>
                      </DialogTrigger>
                      <DialogContent className="max-w-2lg max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                      {selectedCliente?.nome}
                    </DialogTitle>
                  </DialogHeader>
                  {selectedCliente && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">CPF:</span>
                          <p className="font-medium">{selectedCliente.cpf || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">RG:</span>
                          <p className="font-medium">{selectedCliente.rg || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Nascimento:</span>
                          <p className="font-medium">{fmtDataBr(selectedCliente.dataNascimento)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sexo:</span>
                          <p className="font-medium">{selectedCliente.sexo || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Celular:</span>
                          <p className="font-medium">{selectedCliente.celular || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Celular 2:</span>
                          <p className="font-medium">{selectedCliente.celular2 || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Telefone:</span>
                          <p className="font-medium">{selectedCliente.telefone || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Email:</span>
                          <p className="font-medium">{selectedCliente.email || "—"}</p>
                        </div>
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Endereço:</span>
                          <p className="font-medium">
                            {[selectedCliente.endereco, selectedCliente.bairro, selectedCliente.cidade, selectedCliente.uf]
                              .filter(Boolean).join(", ") || "—"}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Cadastro:</span>
                          <p className="font-medium flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {fmtDataBr(selectedCliente.dataCadastro)}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">ID Belle:</span>
                          <p className="font-medium flex items-center gap-1">
                            <IdCard className="h-3 w-3" /> {selectedCliente.belleId}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Primeiro atendimento:</span>
                          <p className="font-medium">{fmtDataBr(selectedCliente.primeiroAtendimento)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Último atendimento:</span>
                          <p className="font-medium">
                            {fmtDataBr(selectedCliente.ultimoAtendimento)}
                            {diasDesde(selectedCliente.ultimoAtendimento) !== null && (
                              <span className="text-muted-foreground font-normal"> ({diasDesde(selectedCliente.ultimoAtendimento)} dias atrás)</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Atendimentos finalizados:</span>
                          <p className="font-medium">{selectedCliente.qtdAtendimentosFinalizados}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Serviços finalizados:</span>
                          <p className="font-medium">{selectedCliente.qtdServicosFinalizados}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {selectedCliente.clienteSsu && (
                          <Badge variant="outline" className="border-emerald-300 text-emerald-700">Shopping Santa Úrsula</Badge>
                        )}
                        {selectedCliente.clienteRbs && (
                          <Badge variant="outline" className="border-blue-300 text-blue-700">Ribeirão Shopping</Badge>
                        )}
                      </div>

                      <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="font-medium text-sm">Terapeuta de preferência</h3>
                            <p className="text-xs text-muted-foreground">Válido apenas para {unidadeSelecionada?.nome ?? "esta unidade"}.</p>
                          </div>
                          {chamadoOpcoesQuery.data?.preferencia?.terapeutaNome && <Badge variant="outline" className="text-[10px]">Preferencial</Badge>}
                        </div>
                        {chamadoOpcoesQuery.isLoading ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando terapeutas...</div>
                        ) : (
                          <Select
                            value={chamadoOpcoesQuery.data?.preferencia?.terapeutaId?.toString() ?? "nenhum"}
                            onValueChange={(valor) => {
                              const terapeuta = chamadoOpcoesQuery.data?.terapeutas.find((item) => item.id.toString() === valor);
                              salvarPreferenciaTerapeutaMutation.mutate({
                                clienteId: selectedCliente.id,
                                unidadeId: unidadeSelecionada!.id,
                                terapeutaId: terapeuta?.id ?? null,
                                terapeutaNome: terapeuta ? (terapeuta.nomeAbreviado || terapeuta.nomeCompleto) : null,
                              });
                            }}
                            disabled={salvarPreferenciaTerapeutaMutation.isPending}
                          >
                            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Sem preferência" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="nenhum">Sem preferência</SelectItem>
                              {(chamadoOpcoesQuery.data?.terapeutas ?? []).map((terapeuta) => (
                                <SelectItem key={terapeuta.id} value={terapeuta.id.toString()}>{terapeuta.nomeAbreviado || terapeuta.nomeCompleto}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="font-medium text-sm">Últimos atendimentos</h3>
                          <span className="text-xs text-muted-foreground">Espelho Belle</span>
                        </div>
                        {historicoAtendimentosQuery.isLoading ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando histórico...</div>
                        ) : (historicoAtendimentosQuery.data?.length ?? 0) === 0 ? (
                          <p className="text-xs text-muted-foreground">Nenhum atendimento espelhado para este cliente nesta unidade.</p>
                        ) : (
                          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                            {historicoAtendimentosQuery.data?.map((atendimento) => (
                              <div key={atendimento.id} className="flex items-start justify-between gap-3 text-xs border-b border-border/40 pb-2 last:border-0 last:pb-0">
                                <div className="min-w-0">
                                  <p className="font-medium truncate">{atendimento.servicoNome || "Serviço não informado"}</p>
                                  <p className="text-muted-foreground truncate">{atendimento.profissionalNome || "Profissional não informado"}</p>
                                </div>
                                <div className="shrink-0 text-right text-muted-foreground">
                                  <p>{fmtDataBr(atendimento.dataAtendimento)} {atendimento.horario || ""}</p>
                                  <p>{atendimento.status}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-lg border border-border/60 bg-muted/10 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="font-medium text-sm">Planos & sessões</h3>
                          <span className="text-xs text-muted-foreground">Espelho Belle</span>
                        </div>
                        {planosBelleQuery.isLoading ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando planos...</div>
                        ) : (planosBelleQuery.data?.length ?? 0) === 0 ? (
                          <p className="text-xs text-muted-foreground">Nenhum plano espelhado para este cliente nesta unidade.</p>
                        ) : (
                          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                            {planosBelleQuery.data?.map((plano) => (
                              <div key={plano.id} className="border-b border-border/40 pb-3 last:border-0 last:pb-0">
                                <div className="flex flex-wrap items-start justify-between gap-2 text-xs">
                                  <div>
                                    <p className="font-medium">Plano #{plano.planoBelleId}</p>
                                    <p className="text-muted-foreground">Validade: {fmtDataBr(plano.validade)} · {plano.status}</p>
                                  </div>
                                  <Badge variant="outline" className="text-[10px]">{plano.tipo || "Plano"}</Badge>
                                </div>
                                <div className="mt-2 space-y-1">
                                  {plano.servicos.map((servico) => (
                                    <div key={servico.id} className="flex items-center justify-between gap-3 text-xs">
                                      <span className="truncate">{servico.servicoNome}</span>
                                      <span className="shrink-0 text-muted-foreground">{servico.restantes} restante(s) · {servico.agendados} agendado(s)</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                      </DialogContent>
                    </Dialog>
                  ))}
                </TableBody>
              </Table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
                <p className="text-xs text-muted-foreground">
                  Página {page} de {totalPages} — {clientesFiltrados.length} cliente{clientesFiltrados.length === 1 ? "" : "s"}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                  <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
