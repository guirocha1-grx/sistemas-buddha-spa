import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { MODULOS, type ModuloChave } from "@shared/modulos";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Pencil, Copy, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { toast } from "sonner";

export default function Usuarios() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: usuarios, isLoading } = trpc.permissoes.listUsuarios.useQuery(undefined, { enabled: user?.role === "admin" });

  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [restringir, setRestringir] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<ModuloChave>>(new Set());
  const [clonarDe, setClonarDe] = useState<string>("");
  const [convidarAberto, setConvidarAberto] = useState(false);
  const [novoEmail, setNovoEmail] = useState("");
  const [novoNome, setNovoNome] = useState("");

  const permissoesQuery = trpc.permissoes.obter.useQuery(
    { userId: editandoId! },
    { enabled: editandoId != null },
  );

  useEffect(() => {
    if (permissoesQuery.data) {
      setRestringir(permissoesQuery.data.restrito);
      setSelecionados(new Set(permissoesQuery.data.modulos as ModuloChave[]));
    }
  }, [permissoesQuery.data]);

  const salvarMutation = trpc.permissoes.salvar.useMutation({
    onSuccess: () => {
      toast.success("Permissões salvas.");
      utils.permissoes.listUsuarios.invalidate();
      setEditandoId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const removerRestricaoMutation = trpc.permissoes.removerRestricao.useMutation({
    onSuccess: () => {
      toast.success("Restrição removida — acesso total.");
      utils.permissoes.listUsuarios.invalidate();
      setEditandoId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const alterarRoleMutation = trpc.permissoes.alterarRole.useMutation({
    onSuccess: (_data, vars) => {
      toast.success(vars.role === "admin" ? "Promovido a admin." : "Rebaixado a user.");
      utils.permissoes.listUsuarios.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const convidarMutation = trpc.permissoes.convidar.useMutation({
    onSuccess: () => {
      toast.success("Convite criado — a conta já pode ser configurada, e vira ativa no primeiro login com esse e-mail.");
      utils.permissoes.listUsuarios.invalidate();
      setConvidarAberto(false);
      setNovoEmail("");
      setNovoNome("");
    },
    onError: (e) => toast.error(e.message),
  });

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        Acesso restrito a administradores.
      </div>
    );
  }

  const usuarioEditando = (usuarios ?? []).find((u) => u.id === editandoId);

  function abrirEdicao(id: number) {
    setEditandoId(id);
    setClonarDe("");
  }

  function toggleModulo(chave: ModuloChave) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  async function handleClonar(sourceIdStr: string) {
    setClonarDe(sourceIdStr);
    const sourceId = Number(sourceIdStr);
    if (!sourceId) return;
    const dados = await utils.permissoes.obter.fetch({ userId: sourceId });
    setRestringir(dados.restrito);
    setSelecionados(new Set(dados.modulos as ModuloChave[]));
  }

  function handleSalvar() {
    if (!editandoId) return;
    if (restringir) {
      salvarMutation.mutate({ userId: editandoId, modulos: Array.from(selecionados) });
    } else {
      removerRestricaoMutation.mutate({ userId: editandoId });
    }
  }

  const salvando = salvarMutation.isPending || removerRestricaoMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Usuários
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Controle de acesso por módulo — por padrão toda conta vê tudo; restrinja individualmente quando
            precisar. Convide por e-mail pra já deixar as permissões prontas antes do primeiro login.
          </p>
        </div>
        <Button size="sm" onClick={() => setConvidarAberto(true)}>
          <UserPlus className="h-4 w-4 mr-2" /> Convidar por e-mail
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Perfil</TableHead>
                <TableHead>Acesso</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando...
                  </TableCell>
                </TableRow>
              ) : (usuarios ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum usuário ainda.
                  </TableCell>
                </TableRow>
              ) : (
                (usuarios ?? []).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-sm">
                      {u.name || "—"}
                      {u.pendente && (
                        <Badge variant="outline" className="ml-2 border-sky-400 text-sky-700 text-[10px]">
                          Convite pendente
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email || "—"}</TableCell>
                    <TableCell className="text-sm">{u.role}</TableCell>
                    <TableCell>
                      {u.role === "admin" ? (
                        <Badge variant="outline" className="border-amber-400 text-amber-700">Total (admin)</Badge>
                      ) : u.permissoesCustomizadas ? (
                        <Badge variant="secondary">Restrito</Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-400 text-emerald-700">Total</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => alterarRoleMutation.mutate({ userId: u.id, role: u.role === "admin" ? "user" : "admin" })}
                        disabled={u.id === user?.id || alterarRoleMutation.isPending}
                        title={u.id === user?.id ? "Não é possível alterar o próprio perfil por aqui" : u.role === "admin" ? "Rebaixar a user" : "Promover a admin"}
                      >
                        {u.role === "admin" ? (
                          <><ShieldOff className="h-3.5 w-3.5 mr-1.5" /> Rebaixar</>
                        ) : (
                          <><ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Promover</>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => abrirEdicao(u.id)}
                        disabled={u.role === "admin"}
                        title={u.role === "admin" ? "Admin sempre tem acesso total" : "Editar permissões"}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editandoId != null} onOpenChange={(open) => !open && setEditandoId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Permissões de {usuarioEditando?.name || usuarioEditando?.email}</DialogTitle>
            <DialogDescription>
              Escolha exatamente quais módulos essa conta pode acessar.
            </DialogDescription>
          </DialogHeader>

          {permissoesQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <Label className="text-sm">Restringir acesso</Label>
                  <p className="text-xs text-muted-foreground">Desligado = acesso a todos os módulos.</p>
                </div>
                <Switch checked={restringir} onCheckedChange={setRestringir} />
              </div>

              {restringir && (
                <>
                  <div className="flex items-center gap-2">
                    <Copy className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <Select value={clonarDe} onValueChange={handleClonar}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Clonar permissões de outro usuário..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(usuarios ?? [])
                          .filter((u) => u.id !== editandoId)
                          .map((u) => (
                            <SelectItem key={u.id} value={String(u.id)}>
                              {u.name || u.email || `#${u.id}`}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {MODULOS.map((m) => (
                      <label
                        key={m.chave}
                        className="flex items-center gap-2 text-sm rounded-lg border px-3 py-2 cursor-pointer hover:bg-accent"
                      >
                        <Checkbox
                          checked={selecionados.has(m.chave)}
                          onCheckedChange={() => toggleModulo(m.chave)}
                        />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditandoId(null)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={salvando || permissoesQuery.isLoading}>
              {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={convidarAberto} onOpenChange={setConvidarAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Convidar por e-mail</DialogTitle>
            <DialogDescription>
              Cria a conta e as permissões de antemão. Vira ativa sozinha quando essa pessoa
              fizer login pela primeira vez com esse e-mail no Google.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">E-mail (Google)</Label>
              <Input
                type="email"
                placeholder="nome@gmail.com"
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nome (opcional)</Label>
              <Input
                placeholder="Como aparece no sistema"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConvidarAberto(false)}>Cancelar</Button>
            <Button
              onClick={() => convidarMutation.mutate({ email: novoEmail.trim(), nome: novoNome })}
              disabled={!novoEmail.trim() || convidarMutation.isPending}
            >
              {convidarMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar convite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
