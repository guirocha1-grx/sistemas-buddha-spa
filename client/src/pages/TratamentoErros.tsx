import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, AlertTriangle } from "lucide-react";
import { rotaInboxConversa } from "@shared/inboxNavigation";

function fmtDataHora(valor: Date | string | null): string {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function LidsNaoResolvidosTab() {
  const [, setLocation] = useLocation();
  const query = trpc.inbox.conversas.listLidsPendentes.useQuery();

  if (query.isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const conversas = query.data ?? [];

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          Conversas não identificadas ({conversas.length})
        </CardTitle>
        <CardDescription>
          O WhatsApp escondeu o número real desses contatos (identificador "@lid") e o sistema não conseguiu resolver
          automaticamente — nem pelo número já cadastrado, nem por nenhuma mensagem trocada depois. Abra a conversa pra
          tentar identificar manualmente (ex.: pelo nome ou pelo conteúdo da mensagem).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {conversas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma conversa não identificada no momento.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidade</TableHead>
                <TableHead>Nome do contato</TableHead>
                <TableHead>Última mensagem</TableHead>
                <TableHead>Quando</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.unidadeNome ?? "—"}</TableCell>
                  <TableCell>{c.nomeContato || <span className="text-muted-foreground italic">sem nome</span>}</TableCell>
                  <TableCell className="max-w-xs truncate">{c.ultimaMensagemTexto || "—"}</TableCell>
                  <TableCell>{fmtDataHora(c.ultimaMensagemEm)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setLocation(rotaInboxConversa(c.id))}>
                      Abrir conversa <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function TratamentoErros() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl flex items-center gap-2" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          <AlertTriangle className="h-5 w-5" /> Tratamento de erros
        </h1>
        <p className="text-sm text-muted-foreground">Casos que a automação não resolveu sozinha e precisam de atenção manual.</p>
      </div>
      <Tabs defaultValue="lids">
        <TabsList>
          <TabsTrigger value="lids">LIDs não resolvidos</TabsTrigger>
        </TabsList>
        <TabsContent value="lids" className="mt-4">
          <LidsNaoResolvidosTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
