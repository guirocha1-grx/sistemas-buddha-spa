import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import { Bath, Clock3, Droplets } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Banho = { id: number; clienteNome: string; dataAtendimento: string; horario: string | null; servicoNome: string | null; terapeutaNome: string | null; sala: string | null };

type Contagem = {
  chave: string;
  clienteNome: string;
  terminaEm: number; // epoch ms — âncora real, não um contador que soma sozinho (sobrevive a timer atrasado em segundo plano e a F5)
};

const CHAVE_CONTAGEM = "banho-imersao-contagem";

function minutosAteBanho(item: Banho, agora: Date) {
  if (!item.horario) return Number.POSITIVE_INFINITY;
  return (new Date(`${item.dataAtendimento}T${item.horario}:00-03:00`).getTime() - agora.getTime()) / 60_000;
}

function formatarRestante(ms: number): string {
  const totalSegundos = Math.max(0, Math.round(ms / 1000));
  const minutos = Math.floor(totalSegundos / 60);
  const segundos = totalSegundos % 60;
  return `${minutos}:${String(segundos).padStart(2, "0")}`;
}

/** Três bipes curtos via Web Audio — evita depender de um arquivo de áudio. */
function tocarAlarme() {
  try {
    const AudioContextClasse = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioContextClasse();
    const inicio = ctx.currentTime;
    [0, 0.5, 1].forEach((atraso) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      const tempo = inicio + atraso;
      gain.gain.setValueAtTime(0.0001, tempo);
      gain.gain.exponentialRampToValueAtTime(0.3, tempo + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, tempo + 0.35);
      osc.start(tempo);
      osc.stop(tempo + 0.4);
    });
  } catch {
    // Web Audio indisponível (ex.: autoplay bloqueado) — segue só com o alerta visual.
  }
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    try { navigator.vibrate([300, 150, 300, 150, 300]); } catch { /* sem suporte a vibração */ }
  }
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

  const marcarDispensado = (chave: string) => {
    setDispensados((atual) => {
      if (atual.includes(chave)) return atual;
      const atualizados = [...atual, chave];
      sessionStorage.setItem("banhos-imersao-dispensados", JSON.stringify(atualizados));
      return atualizados;
    });
  };

  // ===== Contagem de enchimento (2026-09-04) — segue o mesmo espírito do
  // alerta original: nenhum timer/job no servidor. O estado mora aqui porque
  // este componente já é montado uma única vez no DashboardLayout (fora do
  // <Switch> de rotas), então sobrevive à navegação entre telas. terminaEm
  // é gravado no localStorage como horário real (não uma contagem que soma
  // a cada tick) pra sobreviver a F5 e a timers atrasados pelo navegador
  // quando a aba fica em segundo plano — o valor exibido sempre se
  // autocorrige contra o relógio real. =====
  const [contagem, setContagem] = useState<Contagem | null>(() => {
    try {
      const salvo = localStorage.getItem(CHAVE_CONTAGEM);
      return salvo ? (JSON.parse(salvo) as Contagem) : null;
    } catch {
      return null;
    }
  });
  const [restanteMs, setRestanteMs] = useState(() => (contagem ? contagem.terminaEm - Date.now() : 0));
  const [duracaoInput, setDuracaoInput] = useState("9");
  const [cheia, setCheia] = useState(false);
  const [fechamentoConfirmado, setFechamentoConfirmado] = useState(false);
  const [expandido, setExpandido] = useState(false);
  const alarmeTocadoRef = useRef(false);

  useEffect(() => {
    if (!contagem) return;
    const tick = () => {
      const restante = contagem.terminaEm - Date.now();
      setRestanteMs(restante);
      if (restante <= 0 && !alarmeTocadoRef.current) {
        alarmeTocadoRef.current = true;
        tocarAlarme();
        setCheia(true);
      }
    };
    tick();
    const intervalo = window.setInterval(tick, 1000);
    return () => window.clearInterval(intervalo);
  }, [contagem]);

  const duracaoValida = Number.isFinite(Number(duracaoInput)) && Number(duracaoInput) > 0;

  function iniciarContagem() {
    if (!banho || !duracaoValida) return;
    const chave = `${banho.id}-${banho.dataAtendimento}-${banho.horario}`;
    const nova: Contagem = { chave, clienteNome: banho.clienteNome, terminaEm: Date.now() + Number(duracaoInput) * 60_000 };
    localStorage.setItem(CHAVE_CONTAGEM, JSON.stringify(nova));
    alarmeTocadoRef.current = false;
    setCheia(false);
    setContagem(nova);
    marcarDispensado(chave);
  }

  function concluirFechamento() {
    localStorage.removeItem(CHAVE_CONTAGEM);
    setContagem(null);
    setCheia(false);
    setFechamentoConfirmado(false);
    setExpandido(false);
    setDuracaoInput("9");
  }

  return (
    <>
      {/* Estágio 1: banho precisa ser preparado — escolhe o tempo de enchimento e inicia a contagem */}
      <AlertDialog
        open={!!banho && !contagem}
        onOpenChange={(aberto) => !aberto && banho && marcarDispensado(`${banho.id}-${banho.dataAtendimento}-${banho.horario}`)}
      >
        <AlertDialogContent className="max-w-md border-amber-300 bg-amber-50">
          <AlertDialogHeader>
            <div className="mb-2 flex items-center gap-2 text-amber-800"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-200"><Bath className="h-5 w-5" /></span><Badge className="bg-amber-700 text-white">Preparação necessária</Badge></div>
            <AlertDialogTitle className="font-serif text-2xl text-amber-950">Preparar banho de imersão</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-base leading-6 text-amber-950">
              <span className="block">Prepare o banho das <strong>{banho?.horario ?? "—"}</strong> para <strong>{banho?.clienteNome}</strong>.</span>
              <span className="flex items-center gap-1.5 text-sm text-amber-800"><Clock3 className="h-4 w-4" />O preparo deve iniciar uma hora antes do atendimento.</span>
              {banho?.sala ? <span className="block text-sm">Sala organizada: {banho.sala}</span> : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 rounded-lg border border-amber-300 bg-white/60 p-3">
            <Label htmlFor="duracao-enchimento" className="text-sm font-medium text-amber-950">Tempo de enchimento da banheira</Label>
            <div className="flex items-center gap-2">
              <Input id="duracao-enchimento" type="number" min={1} max={60} value={duracaoInput} onChange={(e) => setDuracaoInput(e.target.value)} className="h-9 w-20 bg-white" />
              <span className="text-sm text-amber-900">minutos</span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <AlertDialogAction disabled={!duracaoValida} className="bg-amber-800 hover:bg-amber-900" onClick={iniciarContagem}>
              <Droplets className="mr-1.5 h-4 w-4" />Iniciar contagem de enchimento
            </AlertDialogAction>
            <button
              type="button"
              className="text-center text-xs text-amber-800 underline underline-offset-2"
              onClick={() => banho && marcarDispensado(`${banho.id}-${banho.dataAtendimento}-${banho.horario}`)}
            >
              Só marcar como ciente, sem cronômetro
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Estágio 2: contando — botão flutuante, some ao terminar (aí vira o estágio 3) */}
      {contagem && !cheia && (
        <button
          type="button"
          onClick={() => setExpandido(true)}
          className="fixed z-50 flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 shadow-xl transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
          style={{ bottom: "max(5.25rem, calc(env(safe-area-inset-bottom) + 4.25rem))", right: "max(1.25rem, env(safe-area-inset-right))" }}
          aria-label="Ver contagem de enchimento da banheira"
        >
          <Droplets className="h-4 w-4 text-amber-700" />
          <span className="font-serif text-sm font-semibold tabular-nums text-amber-950">{formatarRestante(restanteMs)}</span>
          <span className="text-xs text-amber-700">enchendo banheira</span>
        </button>
      )}

      {/* Estágio 2 expandido — toque no flutuante pra ver em tela cheia; "Minimizar" só volta pro botão, não cancela a contagem */}
      <AlertDialog open={!!contagem && !cheia && expandido} onOpenChange={setExpandido}>
        <AlertDialogContent className="max-w-sm border-amber-300 bg-amber-50 text-center">
          <AlertDialogHeader className="items-center">
            <div className="mb-1 flex h-14 w-14 items-center justify-center rounded-full bg-amber-200"><Droplets className="h-7 w-7 text-amber-800" /></div>
            <AlertDialogTitle className="font-serif text-2xl text-amber-950">Enchendo a banheira</AlertDialogTitle>
            <AlertDialogDescription className="text-amber-950">Para <strong>{contagem?.clienteNome}</strong></AlertDialogDescription>
          </AlertDialogHeader>
          <p className="font-serif text-5xl font-semibold tabular-nums text-amber-900">{formatarRestante(restanteMs)}</p>
          <AlertDialogAction className="bg-amber-800 hover:bg-amber-900" onClick={() => setExpandido(false)}>Minimizar</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>

      {/* Estágio 3: tempo zerou — precisa confirmar o fechamento pra dispensar o alerta */}
      <AlertDialog open={cheia}>
        <AlertDialogContent className="max-w-md border-amber-300 bg-amber-50">
          <AlertDialogHeader>
            <div className="mb-2 flex items-center gap-2 text-amber-800"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-200"><Bath className="h-5 w-5" /></span><Badge className="bg-amber-700 text-white">Banheira cheia</Badge></div>
            <AlertDialogTitle className="font-serif text-2xl text-amber-950">Desligar a água e iniciar aquecimento</AlertDialogTitle>
            <AlertDialogDescription className="text-base leading-6 text-amber-950">O tempo de enchimento para <strong>{contagem?.clienteNome}</strong> terminou.</AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-white/60 p-3 text-sm text-amber-950">
            <Checkbox checked={fechamentoConfirmado} onCheckedChange={(v) => setFechamentoConfirmado(!!v)} className="mt-0.5" />
            Fechamento da banheira realizado
          </label>
          <AlertDialogAction disabled={!fechamentoConfirmado} className="bg-amber-800 hover:bg-amber-900" onClick={concluirFechamento}>Concluir</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
