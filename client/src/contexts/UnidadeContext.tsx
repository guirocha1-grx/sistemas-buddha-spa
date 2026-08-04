import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { trpc } from "@/lib/trpc";

interface UnidadeInfo {
  id: number;
  nome: string;
  slug: string;
  codEstab: number;
  corTema: string | null;
  belleToken?: string | null;
  zapiInstanceId?: string | null;
  zapiToken?: string | null;
  zapiClientToken?: string | null;
  // Banco Inter
  interClientId?: string | null;
  interClientSecret?: string | null;
  interContaCorrente?: string | null;
}

interface UnidadeContextValue {
  unidadeSelecionada: UnidadeInfo | null;
  /** ID da unidade selecionada (atalho para unidadeSelecionada?.id) */
  unidadeId: number | null;
  setUnidadeId: (id: number) => void;
  unidades: UnidadeInfo[];
  loading: boolean;
}

const UnidadeContext = createContext<UnidadeContextValue | null>(null);

const STORAGE_KEY = "buddha-unidade-selecionada";

export function UnidadeProvider({ children }: { children: ReactNode }) {
  const [unidadeId, setUnidadeId] = useState<number | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? parseInt(saved, 10) : null;
  });

  const { data: unidadesData, isLoading } = trpc.unidades.list.useQuery();

  const unidades: UnidadeInfo[] = (unidadesData || []).map((u: any) => ({
    id: u.id,
    nome: u.nome,
    slug: u.slug,
    codEstab: u.codEstab,
    corTema: u.corTema,
    belleToken: u.belleToken,
    zapiInstanceId: u.zapiInstanceId,
    zapiToken: u.zapiToken,
    zapiClientToken: u.zapiClientToken,
    interClientId: u.interClientId,
    interClientSecret: u.interClientSecret,
    interContaCorrente: u.interContaCorrente,
  }));

  const unidadeSelecionada = unidades.find((u) => u.id === unidadeId) || unidades[0] || null;

  useEffect(() => {
    if (!unidadeId && unidades.length > 0) {
      setUnidadeId(unidades[0].id);
    }
  }, [unidades, unidadeId]);

  useEffect(() => {
    if (unidadeId) {
      localStorage.setItem(STORAGE_KEY, unidadeId.toString());
    }
  }, [unidadeId]);

  return (
    <UnidadeContext.Provider
      value={{
        unidadeSelecionada,
        unidadeId: unidadeSelecionada?.id ?? null,
        setUnidadeId,
        unidades,
        loading: isLoading,
      }}
    >
      {children}
    </UnidadeContext.Provider>
  );
}

export function useUnidade() {
  const ctx = useContext(UnidadeContext);
  if (!ctx) throw new Error("useUnidade must be used within UnidadeProvider");
  return ctx;
}
