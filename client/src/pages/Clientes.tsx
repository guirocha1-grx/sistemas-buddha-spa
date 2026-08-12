import React, { useMemo, useRef, useState, useEffect } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Users, Loader2, Phone, Mail, Calendar, Upload, UserCheck, IdCard, ArrowUp, ArrowDown, ArrowUpDown, X, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { rotaInboxConversa } from "@shared/inboxNavigation";
import { ClienteWhatsAppButton } from "@/components/ClienteWhatsAppButton";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [unidadeImport, setUnidadeImport] = useState<"rbs" | "ssu">("ssu");

  const resumoQuery = trpc.clientes.resumoImportados.useQuery();

  const importarMutation = trpc.clientes.importarXlsx.useMutation({
    onSuccess: (data) => {
      toast.success(`Planilha importada: ${data.inseridos} novo(s), ${data.atualizados} atualizado(s)${data.promovidosDeLead ? `, ${data.promovidosDeLead} lead(s) do Inbox promovido(s) a cliente` : ""} de ${data.totalLinhas} linha(s).`);
      utils.clientes.resumoImportados.invalidate();
      utils.clientes.listImportados.invalidate();
    },
    onError: (err) => toast.error(`Erro ao importar planilha: ${err.message}`),
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
          <Button
            size="sm"
            variant="outline"
            disabled={importarMutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {importarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
            Importar planilha (.xlsx)
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Selecione a unidade dona da planilha antes de importar — clientes que já existem (mesmo ID da planilha) são atualizados,
          e passam a valer pra ambas as unidades se já constavam na outra.
        </p>
      </CardContent>
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
  const { unidadeSelecionada } = useUnidade();
  const [, setLocation] = useLocation();
  const [searchValue, setSearchValue] = useState("");
  const [selectedCliente, setSelectedCliente] = useState<any>(null);
  const [orderBy, setOrderBy] = useState<OrderCol>("nome");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const clientesQuery = trpc.clientes.listImportados.useQuery(undefined, { enabled: !!unidadeSelecionada });

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

      <ImportarClientesCard />

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
                    <SortTh col="celular" label="Contato" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <TableHead className="w-12 text-center" aria-label="WhatsApp">
                      <MessageCircle className="mx-auto h-4 w-4 text-emerald-600" />
                    </TableHead>
                    <SortTh col="cpf" label="CPF" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <SortTh col="dataNascimento" label="Nascimento" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
                    <SortTh col="qtdAtendimentosFinalizados" label="Visitas" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} className="text-right" />
                    <SortTh col="ultimoAtendimento" label="Última visita" orderBy={orderBy} orderDir={orderDir} onSort={toggleSort} />
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
                              {cliente.clienteSsu && cliente.clienteRbs && (
                                <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px] px-1 py-0">
                                  2 unidades
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="space-y-0.5">
                              {cliente.celular && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                                  <Phone className="h-3 w-3" /> {cliente.celular}
                                </p>
                              )}
                              {cliente.email && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
                                  <Mail className="h-3 w-3" /> {cliente.email}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-2 text-center">
                              <ClienteWhatsAppButton
                                cliente={cliente}
                                unidadeId={unidadeSelecionada?.id}
                                onOpenInbox={(conversaId) => setLocation(rotaInboxConversa(conversaId))}
                              />
                          </TableCell>
                          <TableCell className="py-2 text-xs whitespace-nowrap">{cliente.cpf || "—"}</TableCell>
                          <TableCell className="py-2 text-xs whitespace-nowrap">{fmtDataBr(cliente.dataNascimento)}</TableCell>
                          <TableCell className="py-2 text-xs text-right tabular-nums">{cliente.qtdAtendimentosFinalizados}</TableCell>
                          <TableCell className="py-2 text-xs whitespace-nowrap">{fmtDataBr(cliente.ultimoAtendimento)}</TableCell>
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
                          <p className="font-medium">{fmtDataBr(selectedCliente.ultimoAtendimento)}</p>
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
