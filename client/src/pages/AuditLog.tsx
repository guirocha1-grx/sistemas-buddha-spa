import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";

function fmtData(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" });
}

export default function AuditLog() {
  const { user } = useAuth();
  const [procedureContains, setProcedureContains] = useState("");
  const [apenasErros, setApenasErros] = useState(false);
  const [filtroUsuarioId, setFiltroUsuarioId] = useState<"todos" | string>("todos");
  const [filtroAtendenteId, setFiltroAtendenteId] = useState<"todos" | string>("todos");
  const [cursorHistory, setCursorHistory] = useState<number[]>([]);

  const cursorId = cursorHistory[cursorHistory.length - 1];

  const usuariosQuery = trpc.auditLog.usuarios.useQuery(undefined, { enabled: user?.role === "admin" });
  const atendentesQuery = trpc.auditLog.atendentes.useQuery(undefined, { enabled: user?.role === "admin" });

  const { data, isLoading, isFetching, error } = trpc.auditLog.list.useQuery(
    {
      procedureContains: procedureContains.trim() || undefined,
      apenasErros,
      userId: filtroUsuarioId === "todos" ? undefined : Number(filtroUsuarioId),
      atendenteId: filtroAtendenteId === "todos" ? undefined : Number(filtroAtendenteId),
      cursorId,
      limit: 50,
    },
    { enabled: user?.role === "admin" },
  );

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        Acesso restrito a administradores.
      </div>
    );
  }

  const itens = data?.items ?? [];

  function limparFiltros() {
    setProcedureContains("");
    setApenasErros(false);
    setFiltroUsuarioId("todos");
    setFiltroAtendenteId("todos");
    setCursorHistory([]);
  }

  const temFiltro = procedureContains || apenasErros || filtroUsuarioId !== "todos" || filtroAtendenteId !== "todos";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Log de Auditoria
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Toda ação que grava algo no banco — quem fez e quando. Consultas (leituras) não aparecem aqui, só escritas.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Ação (ex: dreDescricoes.criar...)</label>
          <Input
            className="w-64"
            placeholder="Filtrar por nome da ação..."
            value={procedureContains}
            onChange={(e) => { setProcedureContains(e.target.value); setCursorHistory([]); }}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Usuário</label>
          <Select value={filtroUsuarioId} onValueChange={(v) => { setFiltroUsuarioId(v); setCursorHistory([]); }}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {(usuariosQuery.data ?? []).map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>{u.name || u.email || `#${u.id}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Atendente</label>
          <Select value={filtroAtendenteId} onValueChange={(v) => { setFiltroAtendenteId(v); setCursorHistory([]); }}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {(atendentesQuery.data ?? []).map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 pb-2 cursor-pointer">
          <Checkbox
            checked={apenasErros}
            onCheckedChange={(v) => { setApenasErros(!!v); setCursorHistory([]); }}
          />
          <span className="text-sm">Só erros</span>
        </label>
        {temFiltro && (
          <Button variant="ghost" size="sm" onClick={limparFiltros}>Limpar filtros</Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Atendente</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead className="text-right">Duração</TableHead>
                <TableHead className="text-center">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando...
                  </TableCell>
                </TableRow>
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-left text-red-600 py-8 px-4 whitespace-pre-wrap break-words text-xs font-mono">
                    Erro ao carregar: {error.message}
                  </TableCell>
                </TableRow>
              ) : itens.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Nenhum registro encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                itens.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs font-mono whitespace-nowrap">{fmtData(item.createdAt)}</TableCell>
                    <TableCell className="text-sm">
                      {item.userNome ?? <span className="text-muted-foreground italic">sistema</span>}
                      {item.userRole && <span className="text-xs text-muted-foreground ml-1">({item.userRole})</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.atendenteNome ?? <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm font-mono">{item.procedure}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                      {item.duracaoMs != null ? `${item.duracaoMs}ms` : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.sucesso ? (
                        <Badge variant="outline" className="text-xs border-emerald-400 text-emerald-600">OK</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs border-red-400 text-red-600" title={item.erroMsg ?? ""}>
                          Erro
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          disabled={cursorHistory.length === 0 || isFetching}
          onClick={() => setCursorHistory((h) => h.slice(0, -1))}
        >
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!data?.nextCursor || isFetching}
          onClick={() => data?.nextCursor && setCursorHistory((h) => [...h, data.nextCursor as number])}
        >
          Próxima página
        </Button>
      </div>
    </div>
  );
}
