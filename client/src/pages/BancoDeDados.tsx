import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CheckCircle2, Code2, Loader2, MoreVertical, PlayCircle } from "lucide-react";
import { toast } from "sonner";

function formatarData(valor: Date | string | null) {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function SecaoMigracoes() {
  const utils = trpc.useUtils();
  const { data: migracoes, isLoading } = trpc.bancoDeDados.migracoesListar.useQuery();
  const [verSql, setVerSql] = useState<{ nomeArquivo: string; conteudo: string } | null>(null);
  const [confirmarAplicar, setConfirmarAplicar] = useState<string | null>(null);
  const [confirmarMarcar, setConfirmarMarcar] = useState<string | null>(null);

  const aplicarMutation = trpc.bancoDeDados.migracoesAplicar.useMutation({
    onSuccess: (resultado, variaveis) => {
      toast.success(`${variaveis.nomeArquivo}: ${resultado.comandosExecutados} comando(s) executado(s).`);
      utils.bancoDeDados.migracoesListar.invalidate();
      setConfirmarAplicar(null);
    },
    onError: (erro) => toast.error(erro.message),
  });

  const marcarMutation = trpc.bancoDeDados.migracoesMarcarAplicada.useMutation({
    onSuccess: () => {
      toast.success("Registrado no histórico, sem executar nada.");
      utils.bancoDeDados.migracoesListar.invalidate();
      setConfirmarMarcar(null);
    },
    onError: (erro) => toast.error(erro.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Migrações</CardTitle>
        <CardDescription>
          Arquivos de <code>drizzle/*.sql</code>. "Aplicar agora" roda o SQL de verdade no banco; "Marcar como aplicada" só
          registra o histórico, sem rodar nada — use pra arquivos antigos que você já sabe que rodaram manualmente antes
          desta tela existir.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>}
        {!isLoading && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(migracoes ?? []).map((m) => (
                  <TableRow key={m.nomeArquivo}>
                    <TableCell className="font-mono text-xs">{m.nomeArquivo}</TableCell>
                    <TableCell>
                      {m.aplicada ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {m.apenasRegistrada ? "Registrada" : "Aplicada"}
                          {formatarData(m.aplicadaEm) ? ` em ${formatarData(m.aplicadaEm)}` : ""}
                          {m.aplicadaPorNome ? ` · ${m.aplicadaPorNome}` : ""}
                        </Badge>
                      ) : (
                        <Badge variant="outline">Pendente</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setVerSql({ nomeArquivo: m.nomeArquivo, conteudo: m.conteudo })}>
                            <Code2 className="h-3.5 w-3.5 mr-2" /> Ver SQL
                          </DropdownMenuItem>
                          {!m.aplicada && (
                            <>
                              <DropdownMenuItem onClick={() => setConfirmarMarcar(m.nomeArquivo)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-2" /> Marcar como aplicada
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setConfirmarAplicar(m.nomeArquivo)}>
                                <PlayCircle className="h-3.5 w-3.5 mr-2" /> Aplicar agora
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {(migracoes ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">Nenhum arquivo de migração encontrado.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={!!verSql} onOpenChange={(v) => { if (!v) setVerSql(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{verSql?.nomeArquivo}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <pre className="text-xs bg-muted rounded-md p-4 whitespace-pre-wrap">{verSql?.conteudo}</pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmarAplicar} onOpenChange={(v) => { if (!v) setConfirmarAplicar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar "{confirmarAplicar}" no banco de produção?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso executa o SQL do arquivo direto no banco compartilhado, agora. Não dá pra desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={aplicarMutation.isPending}
              onClick={() => confirmarAplicar && aplicarMutation.mutate({ nomeArquivo: confirmarAplicar })}
            >
              {aplicarMutation.isPending ? "Aplicando…" : "Aplicar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmarMarcar} onOpenChange={(v) => { if (!v) setConfirmarMarcar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar "{confirmarMarcar}" como já aplicada?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso só grava no histórico — nenhum SQL é executado. Use só se tiver certeza de que esse arquivo já rodou
              manualmente no banco antes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={marcarMutation.isPending}
              onClick={() => confirmarMarcar && marcarMutation.mutate({ nomeArquivo: confirmarMarcar })}
            >
              {marcarMutation.isPending ? "Registrando…" : "Marcar como aplicada"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function SecaoConsultaSql() {
  const [consulta, setConsulta] = useState("");
  const executarMutation = trpc.bancoDeDados.consultaSql.useMutation({
    onError: (erro) => toast.error(erro.message),
  });

  const colunas = executarMutation.data?.linhas[0] ? Object.keys(executarMutation.data.linhas[0]) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consulta SQL (somente leitura)</CardTitle>
        <CardDescription>
          Só aceita <code>SELECT</code>, um comando por vez. Sem <code>LIMIT</code> explícito, aplica 200 linhas por padrão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="select * from clientes where unidadeId = 1"
          className="font-mono text-sm min-h-24"
        />
        <Button
          onClick={() => executarMutation.mutate({ sql: consulta })}
          disabled={executarMutation.isPending || !consulta.trim()}
        >
          {executarMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
          Executar
        </Button>

        {executarMutation.data && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{executarMutation.data.total} linha(s)</p>
            <ScrollArea className="max-h-[50vh] border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    {colunas.map((coluna) => <TableHead key={coluna} className="font-mono text-xs">{coluna}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {executarMutation.data.linhas.map((linha, indice) => (
                    <TableRow key={indice}>
                      {colunas.map((coluna) => (
                        <TableCell key={coluna} className="font-mono text-xs whitespace-nowrap">
                          {linha[coluna] === null ? <span className="text-muted-foreground">null</span> : String(linha[coluna])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                  {executarMutation.data.linhas.length === 0 && (
                    <TableRow><TableCell colSpan={Math.max(colunas.length, 1)} className="text-center text-sm text-muted-foreground py-4">Sem resultados.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function BancoDeDados() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold">Banco de Dados</h1>
        <p className="text-sm text-muted-foreground">Runner de migrações e consulta SQL somente leitura, direto no banco de produção.</p>
      </div>
      <SecaoMigracoes />
      <SecaoConsultaSql />
    </div>
  );
}
