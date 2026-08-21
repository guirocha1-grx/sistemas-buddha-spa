import { useMemo, useRef, useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Database, FileUp, Link2, Loader2, UsersRound } from "lucide-react";
import { toast } from "sonner";

function fileParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type ArquivoTipo = "clientes" | "planos" | "vinculos" | "atendimentos";
type ImportacaoPendente = { tipo: ArquivoTipo; arquivo: File };

const ARQUIVOS: Array<{ tipo: ArquivoTipo; titulo: string; descricao: string; formatos: string; formatoBelle: string; caminho: string }> = [
  { tipo: "clientes", titulo: "Base de clientes", descricao: "Cadastro mestre do Belle; deve ser enviado primeiro.", formatos: ".xlsx", formatoBelle: "[Buddha] Clientes", caminho: "Belle > BI (Business Intelligence) > [Buddha] Clientes" },
  { tipo: "planos", titulo: "Planos & sessões", descricao: "Validade e saldo por serviço. Aceita exportação XLS/XLSX do Belle.", formatos: ".xls,.xlsx", formatoBelle: "Relatório de Planos", caminho: "Belle > BI (Business Intelligence) > Relatório de Planos" },
  { tipo: "vinculos", titulo: "Elo cliente–plano", descricao: "Relatório com ID Belle do cliente e ID do plano; prioriza vínculo direto.", formatos: ".xlsx", formatoBelle: "Relatório de Sessões de Planos", caminho: "Belle > BI (Business Intelligence) > Relatório de Sessões de Planos" },
  { tipo: "atendimentos", titulo: "Atendimentos", descricao: "Histórico de serviço, data, profissional e status da unidade.", formatos: ".xlsx", formatoBelle: "Relatório de Atendimentos", caminho: "Belle > BI (Business Intelligence) > Relatório de Atendimentos" },
];

function textoUltimaSincronizacao(valor: Date | string | null | undefined) {
  if (!valor) return "Data da última sincronização: ainda não importado";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Data da última sincronização: indisponível";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const referencia = new Date(data);
  referencia.setHours(0, 0, 0, 0);
  const dias = Math.max(0, Math.round((hoje.getTime() - referencia.getTime()) / 86_400_000));
  const relativo = dias === 0 ? "hoje" : dias === 1 ? "1 dia atrás" : `${dias} dias atrás`;
  return `Data da última sincronização: ${data.toLocaleDateString("pt-BR")} (${relativo})`;
}

export default function ManutencaoDados() {
  const { unidadeSelecionada } = useUnidade();
  const utils = trpc.useUtils();
  const refs = useRef<Record<ArquivoTipo, HTMLInputElement | null>>({ clientes: null, planos: null, vinculos: null, atendimentos: null });
  const [selecionadoPorPlano, setSelecionadoPorPlano] = useState<Record<number, string>>({});
  const [importacaoPendente, setImportacaoPendente] = useState<ImportacaoPendente | null>(null);
  // O seletor do frontend não expõe `canal`; as duas unidades físicas são os
  // IDs estáveis 1 (SSU) e 2 (RBS). Qualquer outra origem permanece bloqueada.
  const unidadeId = unidadeSelecionada && [1, 2].includes(unidadeSelecionada.id) ? unidadeSelecionada.id : null;
  const unidadeSlug = unidadeId === 1 ? "ssu" : unidadeId === 2 ? "rbs" : null;

  const pendentesQuery = trpc.clientes.planosPendentesVinculo.useQuery(
    { unidadeId: unidadeId ?? 0 },
    { enabled: !!unidadeId },
  );
  const statusImportacoesQuery = trpc.clientes.statusImportacoesDados.useQuery(
    { unidadeId: unidadeId ?? 0 },
    { enabled: !!unidadeId },
  );

  const importarClientes = trpc.clientes.importarXlsx.useMutation({
    onSuccess: (data) => {
      toast.success(`Base atualizada: ${data.inseridos} novo(s) e ${data.atualizados} atualizado(s).`);
      utils.clientes.planosPendentesVinculo.invalidate();
      utils.clientes.statusImportacoesDados.invalidate();
    },
    onError: (error) => toast.error(`Falha ao importar clientes: ${error.message}`),
  });
  const importarPlanos = trpc.clientes.importarPlanosXls.useMutation({
    onSuccess: (data) => {
      toast.success(`Planos processados: ${data.planosInseridos + data.planosAtualizados}; ${data.planosVinculadosComSeguranca} vínculo(s) seguro(s).`);
      utils.clientes.planosPendentesVinculo.invalidate();
      utils.clientes.planosBelle.invalidate();
      utils.clientes.statusImportacoesDados.invalidate();
    },
    onError: (error) => toast.error(`Falha ao importar planos: ${error.message}`),
  });
  const importarVinculos = trpc.clientes.importarVinculosPlanosXlsx.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.vinculadosPorId} plano(s) vinculado(s) diretamente pelo ID Belle.`);
      if (data.planosNaoEncontrados || data.clientesNaoEncontrados) {
        toast.message(`${data.planosNaoEncontrados} plano(s) e ${data.clientesNaoEncontrados} cliente(s) do arquivo ainda não estavam no espelho desta unidade.`);
      }
      utils.clientes.planosPendentesVinculo.invalidate();
      utils.clientes.planosBelle.invalidate();
      utils.clientes.statusImportacoesDados.invalidate();
    },
    onError: (error) => toast.error(`Falha ao importar elo cliente–plano: ${error.message}`),
  });
  const importarAtendimentos = trpc.clientes.importarAtendimentosXlsx.useMutation({
    onSuccess: (data) => {
      toast.success(`Atendimentos processados: ${data.inseridos + data.atualizados}; ${data.vinculadosComSeguranca} vínculo(s) seguro(s).`);
      utils.clientes.historicoAtendimentosBelle.invalidate();
      utils.clientes.statusImportacoesDados.invalidate();
    },
    onError: (error) => toast.error(`Falha ao importar atendimentos: ${error.message}`),
  });
  const vincularManual = trpc.clientes.vincularPlanoManualmente.useMutation({
    onSuccess: () => {
      toast.success("Plano vinculado ao cliente da unidade selecionada.");
      utils.clientes.planosPendentesVinculo.invalidate();
      utils.clientes.planosBelle.invalidate();
    },
    onError: (error) => toast.error(`Falha ao confirmar vínculo: ${error.message}`),
  });

  const carregandoPorTipo: Record<ArquivoTipo, boolean> = {
    clientes: importarClientes.isPending,
    planos: importarPlanos.isPending,
    vinculos: importarVinculos.isPending,
    atendimentos: importarAtendimentos.isPending,
  };
  const carregando = Object.values(carregandoPorTipo).some(Boolean);
  const resumoPendente = useMemo(() => ({
    total: pendentesQuery.data?.length ?? 0,
    comCandidatos: pendentesQuery.data?.filter((item) => item.candidatos.length > 0).length ?? 0,
  }), [pendentesQuery.data]);

  function prepararImportacao(tipo: ArquivoTipo, event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo || !unidadeId || !unidadeSlug) return;
    setImportacaoPendente({ tipo, arquivo });
  }

  async function confirmarImportacao() {
    if (!importacaoPendente || !unidadeId || !unidadeSlug) return;
    const { tipo, arquivo } = importacaoPendente;
    try {
      const xlsxBase64 = await fileParaBase64(arquivo);
      if (tipo === "clientes") await importarClientes.mutateAsync({ unidade: unidadeSlug, xlsxBase64 });
      if (tipo === "planos") await importarPlanos.mutateAsync({ unidadeId, xlsxBase64 });
      if (tipo === "vinculos") await importarVinculos.mutateAsync({ unidadeId, xlsxBase64 });
      if (tipo === "atendimentos") await importarAtendimentos.mutateAsync({ unidadeId, xlsxBase64 });
      setImportacaoPendente(null);
    } catch (error: any) {
      toast.error(error?.message ?? "Não foi possível ler o arquivo selecionado.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Manutenção de dados</h1>
          <p className="mt-1 text-sm text-muted-foreground">Importações e vínculos do Belle, sempre separados por unidade.</p>
        </div>
        <UnidadeSelector />
      </div>

      {!unidadeId ? (
        <Card className="border-amber-200 bg-amber-50/40"><CardContent className="flex items-center gap-3 py-6 text-sm text-amber-900"><AlertTriangle className="h-5 w-5" />Selecione Ribeirão Shopping ou Shopping Santa Úrsula para trabalhar em uma base física.</CardContent></Card>
      ) : (
        <>
          <Card className="border-primary/20 bg-primary/[0.025]">
            <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
              <Database className="h-5 w-5 text-primary" />
              <span className="font-medium">Base ativa: {unidadeSelecionada?.nome}</span>
              <span className="text-muted-foreground">Nenhum arquivo desta tela altera outra unidade.</span>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {ARQUIVOS.map((arquivo) => (
              <Card key={arquivo.tipo} className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}><FileUp className="h-4 w-4 text-primary" />{arquivo.titulo}</CardTitle>
                  <CardDescription>{arquivo.descricao}</CardDescription>
                  <div className="space-y-1 pt-1 text-xs leading-5 text-muted-foreground">
                    <p>{textoUltimaSincronizacao(statusImportacoesQuery.data?.[arquivo.tipo]?.createdAt)}</p>
                    <p>Caminho: <span className="text-foreground/80">{arquivo.caminho}</span></p>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3">
                  <input ref={(node) => { refs.current[arquivo.tipo] = node; }} type="file" className="hidden" accept={arquivo.formatos} onChange={(event) => prepararImportacao(arquivo.tipo, event)} />
                  <span className="text-xs text-muted-foreground">{arquivo.formatos}</span>
                  <Button size="sm" variant="outline" disabled={carregando || !!importacaoPendente} onClick={() => refs.current[arquivo.tipo]?.click()}>
                    {carregandoPorTipo[arquivo.tipo] ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileUp className="mr-1.5 h-3.5 w-3.5" />}Importar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base" style={{ fontFamily: "'Cormorant Garamond', serif" }}><Link2 className="h-4 w-4 text-primary" />Correspondências de planos</CardTitle>
                  <CardDescription>Confirme somente vínculos pendentes. Importações com ID Belle resolvem este quadro automaticamente.</CardDescription>
                </div>
                <div className="flex gap-2"><Badge variant="outline">{resumoPendente.total} pendente(s)</Badge><Badge variant="secondary">{resumoPendente.comCandidatos} com candidato(s)</Badge></div>
              </div>
            </CardHeader>
            <CardContent>
              {pendentesQuery.isLoading ? <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando correspondências...</div>
                : resumoPendente.total === 0 ? <div className="flex items-center gap-2 py-5 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" />Não há planos pendentes de vínculo nesta unidade.</div>
                : <div className="max-h-[420px] overflow-auto rounded-md border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Plano Belle</TableHead><TableHead>Cliente no relatório</TableHead><TableHead>Candidato local</TableHead><TableHead className="text-right">Ação</TableHead></TableRow></TableHeader>
                    <TableBody>{pendentesQuery.data?.map((plano) => {
                      const escolhido = selecionadoPorPlano[plano.planoBelleId] ?? "";
                      return <TableRow key={plano.id}>
                        <TableCell><p className="font-medium">#{plano.planoBelleId}</p><p className="text-xs text-muted-foreground">{plano.status}</p></TableCell>
                        <TableCell><p className="font-medium">{plano.clienteNome}</p><p className="text-xs text-muted-foreground">Validade: {plano.validade ?? "—"}</p></TableCell>
                        <TableCell className="min-w-[260px]">
                          <Select value={escolhido} onValueChange={(value) => setSelecionadoPorPlano((atual) => ({ ...atual, [plano.planoBelleId]: value }))}>
                            <SelectTrigger><SelectValue placeholder={plano.candidatos.length ? "Escolha um cliente" : "Sem candidato por nome"} /></SelectTrigger>
                            <SelectContent>{plano.candidatos.map((cliente) => <SelectItem key={cliente.id} value={String(cliente.id)}>{cliente.nome} · Belle #{cliente.belleId}</SelectItem>)}</SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right"><Button size="sm" disabled={!escolhido || vincularManual.isPending} onClick={() => vincularManual.mutate({ unidadeId, planoBelleId: plano.planoBelleId, clienteId: Number(escolhido) })}><UsersRound className="mr-1.5 h-3.5 w-3.5" />Confirmar</Button></TableCell>
                      </TableRow>;
                    })}</TableBody>
                  </Table>
                </div>}
            </CardContent>
          </Card>
          {importacaoPendente && (() => {
            const configuracao = ARQUIVOS.find((arquivo) => arquivo.tipo === importacaoPendente.tipo)!;
            return <Dialog open onOpenChange={(aberto) => { if (!aberto && !carregando) setImportacaoPendente(null); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirmar importação</DialogTitle>
                  <DialogDescription>Revise o tipo de relatório e a unidade antes de gravar dados na base local.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
                  <p><span className="text-muted-foreground">Arquivo:</span> <strong>{importacaoPendente.arquivo.name}</strong></p>
                  <p><span className="text-muted-foreground">Formato esperado:</span> <strong>{configuracao.formatoBelle}</strong></p>
                  <p><span className="text-muted-foreground">Unidade de destino:</span> <strong>{unidadeSelecionada?.nome}</strong></p>
                  <p><span className="text-muted-foreground">Caminho no Belle:</span> <strong>{configuracao.caminho}</strong></p>
                </div>
                <DialogFooter>
                  <Button variant="outline" disabled={carregando} onClick={() => setImportacaoPendente(null)}>Cancelar</Button>
                  <Button disabled={carregando} onClick={confirmarImportacao}>{carregando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileUp className="mr-1.5 h-4 w-4" />}Confirmar importação</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>;
          })()}
        </>
      )}
    </div>
  );
}
