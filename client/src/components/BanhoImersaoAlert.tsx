import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { Bath, Clock3 } from "lucide-react";
import { useMemo, useState } from "react";

type Banho = { id: number; clienteNome: string; dataAtendimento: string; horario: string | null; servicoNome: string | null; terapeutaNome: string | null; sala: string | null };

function minutosAteBanho(item: Banho, agora: Date) {
  if (!item.horario) return Number.POSITIVE_INFINITY;
  return (new Date(`${item.dataAtendimento}T${item.horario}:00-03:00`).getTime() - agora.getTime()) / 60_000;
}

export default function BanhoImersaoAlert() {
  const { unidadeSelecionada } = useUnidade();
  const query = trpc.proximosAtendimentos.banhosImersaoHoje.useQuery({ unidadeId: unidadeSelecionada?.id ?? 0 }, {
    enabled: !!unidadeSelecionada,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  const [dispensados, setDispensados] = useState<string[]>(() => JSON.parse(sessionStorage.getItem("banhos-imersao-dispensados") ?? "[]"));
  // O refetch da consulta local a cada minuto é o gatilho de atualização da
  // tela ativa. Não há timer nem job em processo no servidor.
  const agora = new Date();

  const banho = useMemo(() => ((query.data ?? []) as Banho[]).find((item) => {
    const chave = `${item.id}-${item.dataAtendimento}-${item.horario}`;
    const minutos = minutosAteBanho(item, agora);
    return minutos <= 60 && minutos >= 0 && !dispensados.includes(chave);
  }), [agora, dispensados, query.data]);
  const dispensar = () => {
    if (!banho) return;
    const chave = `${banho.id}-${banho.dataAtendimento}-${banho.horario}`;
    const atualizados = [...dispensados, chave];
    setDispensados(atualizados);
    sessionStorage.setItem("banhos-imersao-dispensados", JSON.stringify(atualizados));
  };

  return <AlertDialog open={!!banho} onOpenChange={(aberto) => !aberto && dispensar()}>
    <AlertDialogContent className="max-w-md border-amber-300 bg-amber-50">
      <AlertDialogHeader>
        <div className="mb-2 flex items-center gap-2 text-amber-800"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-200"><Bath className="h-5 w-5" /></span><Badge className="bg-amber-700 text-white">Preparação necessária</Badge></div>
        <AlertDialogTitle className="font-serif text-2xl text-amber-950">Preparar banho de imersão</AlertDialogTitle>
        <AlertDialogDescription className="space-y-2 text-base leading-6 text-amber-950"><span className="block">Prepare o banho das <strong>{banho?.horario ?? "—"}</strong> para <strong>{banho?.clienteNome}</strong>.</span><span className="flex items-center gap-1.5 text-sm text-amber-800"><Clock3 className="h-4 w-4" />O preparo deve iniciar uma hora antes do atendimento.</span>{banho?.sala ? <span className="block text-sm">Sala organizada: {banho.sala}</span> : null}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogAction className="bg-amber-800 hover:bg-amber-900" onClick={dispensar}>Ciente, preparar agora</AlertDialogAction>
    </AlertDialogContent>
  </AlertDialog>;
}
