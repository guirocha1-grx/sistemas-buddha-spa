import { useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Users, Loader2, Phone, Mail, MapPin, Calendar, Tag } from "lucide-react";

export default function Clientes() {
  const { unidadeSelecionada } = useUnidade();
  const [searchType, setSearchType] = useState<"list" | "search">("list");
  const [searchValue, setSearchValue] = useState("");
  const [page, setPage] = useState(0);
  const [selectedCliente, setSelectedCliente] = useState<any>(null);

  const { data: clientes, isLoading } = trpc.clientes.list.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0, pagina: page },
    { enabled: !!unidadeSelecionada && searchType === "list" }
  );

  const { data: clienteBuscado, isLoading: searching } = trpc.clientes.buscar.useQuery(
    {
      unidadeId: unidadeSelecionada?.id ?? 0,
      cpf: searchType === "search" && searchValue.match(/^\d/) ? searchValue.replace(/\D/g, "") : undefined,
      email: searchType === "search" && searchValue.includes("@") ? searchValue : undefined,
      celular: searchType === "search" && !searchValue.includes("@") && !searchValue.match(/^\d{11,}/) ? searchValue : undefined,
    },
    { enabled: !!unidadeSelecionada && searchType === "search" && searchValue.length > 3 }
  );

  const { data: planos } = trpc.clientes.planos.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0, codCliente: selectedCliente?.codigo ?? 0 },
    { enabled: !!selectedCliente?.codigo }
  );

  const displayClientes = searchType === "search" && clienteBuscado ? [clienteBuscado] : clientes || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Clientes
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Base de clientes sincronizada com o Belle Software
          </p>
        </div>
        <UnidadeSelector />
      </div>

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
              placeholder="CPF, email ou celular..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="pl-10"
            />
          </div>
        )}
      </div>

      {/* Results */}
      {isLoading || searching ? (
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
            {displayClientes.map((cliente: any) => (
              <Dialog key={cliente.codigo}>
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
                            {cliente.temperatura && (
                              <Badge
                                variant="outline"
                                className={
                                  cliente.temperatura === "Quente" ? "border-orange-300 text-orange-700" :
                                  cliente.temperatura === "Morno" ? "border-yellow-300 text-yellow-700" :
                                  "border-blue-300 text-blue-700"
                                }
                              >
                                {cliente.temperatura}
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
                                <MapPin className="h-3 w-3" /> {cliente.cidade}/{cliente.UF}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {cliente.rating > 0 && (
                            <div className="flex gap-0.5">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <span
                                  key={i}
                                  className={i < cliente.rating ? "text-amber-500" : "text-muted-foreground/30"}
                                >
                                  ★
                                </span>
                              ))}
                            </div>
                          )}
                          {cliente.tags?.map((tag: any) => (
                            <Badge key={tag.id} variant="secondary" className="text-xs">
                              {tag.nome}
                            </Badge>
                          ))}
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
                      {/* Dados pessoais */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">CPF:</span>
                          <p className="font-medium">{selectedCliente.cpf || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Nascimento:</span>
                          <p className="font-medium">{selectedCliente.dtNascimento || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Celular:</span>
                          <p className="font-medium">{selectedCliente.celular || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Email:</span>
                          <p className="font-medium">{selectedCliente.email || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Cadastro:</span>
                          <p className="font-medium flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {selectedCliente.dtCadastro || "—"}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Profissão:</span>
                          <p className="font-medium">{selectedCliente.profissao || "—"}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Cidade:</span>
                          <p className="font-medium">{selectedCliente.cidade || "—"}/{selectedCliente.UF || ""}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Pontos:</span>
                          <p className="font-medium">{selectedCliente.pontos ?? "—"}</p>
                        </div>
                      </div>

                      {/* Tags */}
                      {selectedCliente.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {selectedCliente.tags.map((tag: any) => (
                            <Badge key={tag.id} variant="secondary" className="flex items-center gap-1">
                              <Tag className="h-3 w-3" /> {tag.nome}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Planos */}
                      <div>
                        <h3 className="text-sm font-semibold mb-2">Planos Ativos</h3>
                        {planos && planos.length > 0 ? (
                          <div className="space-y-2">
                            {planos.map((plano: any) => (
                              <div key={plano.codPlano} className="rounded-lg border border-border/50 p-3">
                                <div className="font-medium text-sm">{plano.nome}</div>
                                <div className="mt-2 space-y-1">
                                  {plano.servicos?.map((s: any) => (
                                    <div key={s.codServico} className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">{s.nome}</span>
                                      <span className="font-medium">{s.saldoRestante} sessões</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Nenhum plano ativo.</p>
                        )}
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            ))}
          </div>

          {/* Pagination */}
          {searchType === "list" && (clientes?.length ?? 0) === 100 && (
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground py-1">Página {page + 1}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)}>
                Próxima
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
