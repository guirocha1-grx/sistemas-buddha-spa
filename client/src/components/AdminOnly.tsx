import React from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { podeAcessarRotaAdministrativa } from "@/lib/adminAccess";
import { Redirect } from "wouter";

export function AdminOnly({ children, rota }: { children: React.ReactNode; rota: string }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return podeAcessarRotaAdministrativa(rota, user?.role) ? <>{children}</> : <Redirect to="/" />;
}
