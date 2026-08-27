import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { BellRing, CheckSquare, Clock3, Loader2, Send, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Atendimento = { id?: number; horario?: string | null; servicoNome?: string | null; profissionalNome?: string | null; terapeutaOrganizado?: string | null; salaOrganizada?: string | null; preferencialOrganizado?: boolean | null };
type Conversa = { clienteId?: number | null; nomeContato?: string | null };
type FormChamado = {
  modalidade: "chamado" | "pre_chamado"; clienteNome: string; horarioPrevisto: string; aguardandoEm: string;
  terapeutaNome: string; terapiaBemEstar: string; terapiaEstetica: string; sala: string; taa: string; preferencial: boolean;
};

function primeiroNome(nome: string | null | undefined) {
  return nome?.trim().split(/\s+/)[0] || "";
}

function criarFormulario(atendimento: Atendimento | null | undefined, conversa: Conversa | null | undefined, preferencia?: string | null, aguardando?: string, taa?: string): FormChamado {
  return {
    modalidade: "chamado", clienteNome: conversa?.nomeContato ?? "", horarioPrevisto: atendimento?.horario ?? "",
    aguardandoEm: aguardando ?? "", terapeutaNome: atendimento?.terapeutaOrganizado || primeiroNome(atendimento?.profissionalNome) || preferencia || "",
    terapiaBemEstar: atendimento?.servicoNome ?? "", terapiaEstetica: "", sala: atendimento?.salaOrganizada ?? "", taa: taa ?? "TAA não se aplica", preferencial: atendimento?.preferencialOrganizado ?? !!preferencia,
  };
}

function mensagemPrevia(form: FormChamado) {
  const linhas = [form.modalidade === "pre_chamado" ? "Pré-chamado" : "Chamado", `Terapeuta: ${form.terapeutaNome || "—"}.`];
  linhas.push(form.modalidade === "pre_chamado" ? `Cliente: ${form.clienteNome || "—"} previsto(a) para chegar${form.horarioPrevisto ? ` às ${form.horarioPrevisto}` : ""}.` : `Cliente: ${form.clienteNome || "—"} aguarda em: ${form.aguardandoEm || "—"}.`);
  if (form.modalidade === "pre_chamado") linhas.push(`Preparação: ${form.aguardandoEm || "—"}.`);
  if (form.terapiaBemEstar) linhas.push(`Terapia Bem-Estar: ${form.terapiaBemEstar}.`);
  if (form.terapiaEstetica) linhas.push(`Terapia Estética: ${form.terapiaEstetica}.`);
  linhas.push(`Local: ${form.sala || "—"}.`);
  linhas.push(`${form.taa || "—"}. Pref.: ${form.preferencial ? "Sim" : "Não"}.`);
  if (form.preferencial) linhas.push("🟩 PREFERENCIAL");
  return linhas.join("\n");
}

export function ChamadoTerapeutaDialog({ open, onOpenChange, unidadeId, atendimento, conversa }: {
  open: boolean; onOpenChange: (open: boolean) => void; unidadeId: number | undefined; atendimento: Atendimento | null | undefined; conversa: Conversa | null | undefined;
}) {
  const clienteId = conversa?.clienteId ?? null;
  const opcoesQuery = trpc.chamados.opcoes.useQuery({ unidadeId: unidadeId ?? 0, clienteId: clienteId ?? undefined }, { enabled: open && !!unidadeId });
  const servicosQuery = trpc.servicos.list.useQuery({ unidadeId: unidadeId ?? 0 }, { enabled: open && !!unidadeId });
  const [form, setForm] = useState<FormChamado>(() => criarFormulario(atendimento, conversa));
  const [enviarParaComanda, setEnviarParaComanda] = useState(true);
  const formularioInicializadoRef = useRef(false);
  const parametros = opcoesQuery.data?.parametros ?? [];
  const aguardando = parametros.filter((item) => item.tipo === "aguardando");
  const salas = parametros.filter((item) => item.tipo === "sala");
  const taa = parametros.filter((item) => item.tipo === "taa");
  const nomesServicos = useMemo(() => (servicosQuery.data ?? []).map((item: any) => item.nome ?? item.descricao ?? item.name).filter((item: unknown): item is string => typeof item === "string" && !!item.trim()), [servicosQuery.data]);

  useEffect(() => {
    if (!open) {
      formularioInicializadoRef.current = false;
      return;
    }
    if (formularioInicializadoRef.current || opcoesQuery.isLoading || !opcoesQuery.data) return;
    setForm(criarFormulario(atendimento, conversa, opcoesQuery.data?.preferencia?.terapeutaNome, aguardando[0]?.nome, taa[0]?.nome));
    formularioInicializadoRef.current = true;
  // A abertura é o momento certo para carregar o atendimento atual; a mudança
  // posterior de opções não deve apagar o que a recepção já estiver editando.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, opcoesQuery.isLoading, opcoesQuery.data, atendimento?.horario, atendimento?.servicoNome, atendimento?.profissionalNome, atendimento?.terapeutaOrganizado, atendimento?.salaOrganizada, conversa?.nomeContato, opcoesQuery.data?.preferencia?.terapeutaNome]);

  const enviarMutation = trpc.chamados.enviarTeste.useMutation({
    onSuccess: () => { toast.success("Chamado enviado no grupo de teste da recepção."); onOpenChange(false); },
    onError: (erro) => toast.error(`Não foi possível enviar o chamado: ${erro.message}`),
  });
  const mudar = <K extends keyof FormChamado>(campo: K, valor: FormChamado[K]) => setForm((atual) => ({ ...atual, [campo]: valor }));
  const destinoTesteDisponivel = unidadeId === 2;
  const podeEnviar = destinoTesteDisponivel && !!form.clienteNome.trim() && !!form.aguardandoEm.trim() && !!form.terapeutaNome.trim() && !!form.sala.trim() && !!form.taa.trim();

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><BellRing className="h-4 w-4" /></span><DialogTitle className="font-serif text-2xl">Chamar terapeuta</DialogTitle></div>
        <DialogDescription>Todos os campos podem ser corrigidos antes do envio. Nesta etapa, o aviso vai somente para o grupo de teste da recepção.</DialogDescription>
      </DialogHeader>
      {!destinoTesteDisponivel ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">O envio de teste está configurado somente para o grupo da recepção do Ribeirão Shopping.</div> : opcoesQuery.isLoading ? <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Preparando opções do chamado...</div> : <div className="space-y-5">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-1">
          <Button type="button" variant={form.modalidade === "chamado" ? "default" : "ghost"} className="h-9" onClick={() => mudar("modalidade", "chamado")}><BellRing className="mr-2 h-4 w-4" />Chamado agora</Button>
          <Button type="button" variant={form.modalidade === "pre_chamado" ? "default" : "ghost"} className="h-9" onClick={() => mudar("modalidade", "pre_chamado")}><Clock3 className="mr-2 h-4 w-4" />Pré-chamado</Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Cliente</Label><Input value={form.clienteNome} onChange={(event) => mudar("clienteNome", event.target.value)} placeholder="Nome do cliente" /></div>
          <div className="space-y-1.5"><Label>{form.modalidade === "pre_chamado" ? "Horário previsto de chegada" : "Horário do atendimento"}</Label><Input type="time" value={form.horarioPrevisto} onChange={(event) => mudar("horarioPrevisto", event.target.value)} /></div>
          <CampoLista label={form.modalidade === "pre_chamado" ? "Como preparar" : "Aguardando em"} value={form.aguardandoEm} onChange={(valor) => mudar("aguardandoEm", valor)} valores={aguardando.map((item) => item.nome)} placeholder="Informe onde o cliente está" id="chamado-aguardando" />
          <div className="flex items-end gap-2"><div className="min-w-0 flex-1"><CampoLista label="Terapeuta" value={form.terapeutaNome} onChange={(valor) => mudar("terapeutaNome", valor)} valores={(opcoesQuery.data?.terapeutas ?? []).map((item) => item.nomeAbreviado || item.nomeCompleto)} placeholder="Selecione ou digite" id="chamado-terapeuta" /></div><div className="shrink-0 space-y-1.5"><Label>Pref.</Label><div className="flex gap-1 rounded-lg bg-muted p-1"><Button type="button" size="sm" className={`h-8 px-2 ${form.preferencial ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}`} variant={form.preferencial ? "default" : "ghost"} onClick={() => mudar("preferencial", true)}>Sim</Button><Button type="button" size="sm" className="h-8 px-2" variant={!form.preferencial ? "default" : "ghost"} onClick={() => mudar("preferencial", false)}>Não</Button></div></div></div>
          <CampoLista label="Terapia Bem-Estar" value={form.terapiaBemEstar} onChange={(valor) => mudar("terapiaBemEstar", valor)} valores={nomesServicos} placeholder="Selecione ou digite" id="chamado-bem-estar" />
          <CampoLista label="Terapia Estética" value={form.terapiaEstetica} onChange={(valor) => mudar("terapiaEstetica", valor)} valores={nomesServicos} placeholder="Opcional" id="chamado-estetica" />
          <CampoLista label="Sala" value={form.sala} onChange={(valor) => mudar("sala", valor)} valores={salas.map((item) => item.nome)} placeholder="Selecione ou digite" id="chamado-sala" />
          <CampoLista label="TAA" value={form.taa} onChange={(valor) => mudar("taa", valor)} valores={taa.map((item) => item.nome)} placeholder="Selecione a situação" id="chamado-taa" />
        </div>
        <button type="button" disabled={!atendimento?.id} onClick={() => setEnviarParaComanda((atual) => !atual)} className={`flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-55 ${enviarParaComanda ? "border-primary/30 bg-primary/[0.04]" : "bg-muted/30"}`}><span className="flex items-center gap-2 font-medium"><CheckSquare className={`h-4 w-4 ${enviarParaComanda ? "text-primary" : "text-muted-foreground"}`} />Enviar para a Comanda</span><span className="text-xs text-muted-foreground">{atendimento?.id ? (enviarParaComanda ? "Marcado" : "Não enviar") : "Sem atendimento vinculado"}</span></button>
        <div className="rounded-lg border border-primary/15 bg-primary/[0.035] p-3"><div className="mb-2 flex items-center gap-2"><Badge variant="outline" className="border-primary/25 text-primary">Prévia de envio</Badge>{form.preferencial ? <Badge className="border-emerald-600 bg-emerald-600 text-white">● Preferência</Badge> : null}<span className="text-xs text-muted-foreground">Grupo Geral RBS</span></div><p className="whitespace-pre-wrap text-sm leading-5">{mensagemPrevia(form)}</p></div>
      </div>}
      <Separator />
      <DialogFooter className="gap-2 sm:gap-0"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={enviarMutation.isPending}><X className="mr-2 h-4 w-4" />Abandonar chamado</Button><Button type="button" disabled={!podeEnviar || enviarMutation.isPending} onClick={() => enviarMutation.mutate({ unidadeId: unidadeId!, ...form, enviarParaComanda: enviarParaComanda && !!atendimento?.id, atendimentoBelleId: atendimento?.id ?? null, horarioPrevisto: form.horarioPrevisto || null, terapiaBemEstar: form.terapiaBemEstar || null, terapiaEstetica: form.terapiaEstetica || null })}>{enviarMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar no grupo</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function CampoLista({ label, value, onChange, valores, placeholder, id }: { label: string; value: string; onChange: (valor: string) => void; valores: string[]; placeholder: string; id: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input list={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /><datalist id={id}>{Array.from(new Set(valores)).map((valor) => <option key={valor} value={valor} />)}</datalist></div>;
}
