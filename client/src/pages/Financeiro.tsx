import { useState } from "react";
import { useUnidade } from "@/contexts/UnidadeContext";
import { trpc } from "@/lib/trpc";
import UnidadeSelector from "@/components/UnidadeSelector";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, DollarSign, TrendingUp, Target } from "lucide-react";

export default function Financeiro() {
  const { unidadeSelecionada } = useUnidade();
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

  const { data: vendas, isLoading: loadingVendas } = trpc.financeiro.vendas.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0, data_inicio: fmtDate(firstDay), data_fim: fmtDate(today) },
    { enabled: !!unidadeSelecionada }
  );

  const { data: recebimentos, isLoading: loadingRec } = trpc.financeiro.recebimentos.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0, data_inicio: fmtDate(firstDay), data_fim: fmtDate(today) },
    { enabled: !!unidadeSelecionada }
  );

  const { data: metas } = trpc.financeiro.metas.list.useQuery(
    { unidadeId: unidadeSelecionada?.id ?? 0 },
    { enabled: !!unidadeSelecionada }
  );

  const fmtCurrency = (val: number) => val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const totalRecebimentos = recebimentos?.reduce((sum: number, r: any) => sum + (r.valor || 0), 0) ?? 0;
  const metaAtual = metas?.find((m: any) => m.mes === today.getMonth() + 1 && m.ano === today.getFullYear());

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
            Financeiro
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            DRE, fluxo de caixa e metas — dados do Belle Software
          </p>
        </div>
        <UnidadeSelector />
      </div>

      <Tabs defaultValue="dre">
        <TabsList>
          <TabsTrigger value="dre">DRE Simplificado</TabsTrigger>
          <TabsTrigger value="fluxo">Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="metas">Metas</TabsTrigger>
        </TabsList>

        {/* DRE */}
        <TabsContent value="dre" className="space-y-4">
          {loadingVendas ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                  DRE Simplificado — {today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                </CardTitle>
                <CardDescription>Receita e vendas do período</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-sm text-muted-foreground">Receita Bruta (Vendas)</span>
                  <span className="font-medium">{fmtCurrency(vendas?.valorTotal ?? 0)}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-sm text-muted-foreground">Total de Vendas</span>
                  <span className="font-medium">{vendas?.totalVendas ?? 0}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-sm text-muted-foreground">Ticket Médio</span>
                  <span className="font-medium">
                    {fmtCurrency((vendas?.valorTotal ?? 0) / Math.max(vendas?.totalVendas ?? 1, 1))}
                  </span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-2">
                  <span className="text-sm text-muted-foreground">Recebimentos no Período</span>
                  <span className="font-medium">{fmtCurrency(totalRecebimentos)}</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-sm font-semibold">Saldo do Período</span>
                  <span className="font-bold">
                    {fmtCurrency((vendas?.valorTotal ?? 0) - totalRecebimentos)}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Fluxo de Caixa */}
        <TabsContent value="fluxo" className="space-y-4">
          {loadingRec ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card className="border-border/50 shadow-sm">
              <CardHeader>
                <CardTitle style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                  Fluxo de Caixa — {today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                </CardTitle>
                <CardDescription>Recebimentos do período</CardDescription>
              </CardHeader>
              <CardContent>
                {recebimentos && recebimentos.length > 0 ? (
                  <div className="space-y-2">
                    {recebimentos.map((r: any) => (
                      <div key={r.codigo} className="flex justify-between border-b border-border/30 pb-2">
                        <div>
                          <div className="text-sm font-medium">{r.descricao || "Recebimento"}</div>
                          <div className="text-xs text-muted-foreground">{r.data} — {r.formaPagamento}</div>
                        </div>
                        <span className="font-medium text-sm">{fmtCurrency(r.valor)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-3 font-semibold">
                      <span>Total Recebido</span>
                      <span>{fmtCurrency(totalRecebimentos)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Nenhum recebimento no período.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Metas */}
        <TabsContent value="metas" className="space-y-4">
          <Card className="border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle style={{ fontFamily: "'Cormorant Garamond', serif" }}>
                Metas — {today.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </CardTitle>
              <CardDescription>
                {metaAtual ? "Meta definida para o mês atual" : "Nenhuma meta definida para este mês"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {metaAtual && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-border/50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Meta de Faturamento</span>
                    </div>
                    <div className="text-xl font-bold">{fmtCurrency(Number(metaAtual.valorFaturamento) || 0)}</div>
                    <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(100, ((vendas?.valorTotal ?? 0) / Math.max(Number(metaAtual.valorFaturamento) || 1, 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {fmtCurrency(vendas?.valorTotal ?? 0)} de {fmtCurrency(Number(metaAtual.valorFaturamento) || 0)}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/50 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Meta de Recebimento</span>
                    </div>
                    <div className="text-xl font-bold">{fmtCurrency(Number(metaAtual.valorRecebimento) || 0)}</div>
                    <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(100, (totalRecebimentos / Math.max(Number(metaAtual.valorRecebimento) || 1, 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {fmtCurrency(totalRecebimentos)} de {fmtCurrency(Number(metaAtual.valorRecebimento) || 0)}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
