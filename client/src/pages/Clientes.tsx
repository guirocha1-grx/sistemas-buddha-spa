import { useRef, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, Loader2, Phone, Mail, MapPin, Calendar, Upload, UserCheck, IdCard } from "lucide-react";
import { toast } from "sonner";

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
      toast.success(`Planilha importada: ${data.inseridos} novo(s), ${data.atualizados} atualizado(s) de ${data.totalLinhas} linha(s).`);
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

export default function Clientes() {
  const { unidadeSelecionada } = useUnidade();
  const [searchType, setSearchType] = useState<"list" | "search">("list");
  const [searchValue, setSearchValue] = useState("");
  const [selectedCliente, setSelectedCliente] = useState<any>(null);

  const clientesQuery = trpc.clientes.listImportados.useQuery(
    { busca: searchType === "search" && searchValue.trim() ? searchValue.trim() : undefined },
    { enabled: !!unidadeSelecionada },
  );

  const isRbs = unidadeSelecionada?.slug?.includes("ribeirao") || unidadeSelecionada?.slug?.includes("rbs");
  const displayClientes = (clientesQuery.data ?? []).filter((c) => (isRbs ? c.clienteRbs : c.clienteSsu));
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
      <div className="flex gap-2">
        <div className="flex gap-1 rounded-lg border border-border p-1">
          <Button
            variant={searchType === "list" ? "default" : "ghost"}
            size="sm"
            onClick={() => { setSearchType("list"); setSearchValue(""); }}
          >
            Listar
          </Button>
          <Button
            variant={searchType === "search" ? "default" : "ghost"}
            size="sm"
            onClick={() => setSearchType("search")}
          >
            Buscar
          </Button>
        </div>
        {searchType === "search" && (
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Nome, CPF, email ou celular..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="pl-10"
            />
          </div>
        )}
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : displayClientes.length === 0 ? (
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
          <div className="grid gap-3">
            {displayClientes.map((cliente) => (
              <Dialog key={cliente.id}>
                <DialogTrigger asChild>
                  <Card
                    className="border-border/50 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => setSelectedCliente(cliente)}
                  >
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{cliente.nome}</span>
                            {cliente.clienteSsu && cliente.clienteRbs && (
                              <Badge variant="outline" className="border-amber-300 text-amber-700 text-xs">
                                nas duas unidades
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            {cliente.celular && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {cliente.celular}
                              </span>
                            )}
                            {cliente.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {cliente.email}
                              </span>
                            )}
                            {cliente.cidade && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> {cliente.cidade}{cliente.uf ? `/${cliente.uf}` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0 text-right">
                          {cliente.qtdAtendimentosFinalizados} atendimento{cliente.qtdAtendimentosFinalizados === 1 ? "" : "s"}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
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
          </div>

          {displayClientes.length >= 200 && (
            <p className="text-xs text-muted-foreground text-center">
              Mostrando os 200 primeiros resultados — use a busca pra refinar.
            </p>
          )}
        </>
      )}
    </div>
  );
}
