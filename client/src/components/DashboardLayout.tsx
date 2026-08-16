import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { startGoogleLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { trpc } from "@/lib/trpc";
import { LayoutDashboard, LogOut, PanelLeft, Users, Calendar, KanbanSquare, DollarSign, Sparkles, Image, UserPlus, Settings, MessageCircle, ChevronRight, ScrollText, Repeat, Users2, Loader2, Workflow, Megaphone, AlertTriangle } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { AtendenteGate, useAtendenteAtual } from "./AtendenteGate";
import GlobalSyncCenter from "./GlobalSyncCenter";
import type { ModuloChave } from "@shared/modulos";

// `modulo` liga cada item ao controle de acesso (shared/modulos.ts) —
// item sem `modulo` fica sempre visível. "Config. Inbox" usa o mesmo
// módulo de "Mensagens": as duas telas mexem com o mesmo backend
// (conexão/atendimento WhatsApp), não faz sentido liberar uma sem a
// outra. "Dashboard" também é opt-in desde 2026-08-13 (antes era
// sempre visível por ser a página de pouso) — conta restrita sem
// "dashboard" marcado é redirecionada pro primeiro módulo liberado ao
// cair em "/", ver o useEffect logo abaixo em DashboardLayoutContent.
const menuItems: { icon: typeof LayoutDashboard; label: string; path: string; modulo?: ModuloChave; adminOnly?: boolean; children?: { label: string; path: string; subsecao?: string }[] }[] = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/", modulo: "dashboard" },
  { icon: Users, label: "Clientes", path: "/clientes", modulo: "clientes" },
  { icon: KanbanSquare, label: "Reativação", path: "/reativacao", modulo: "reativacao" },
  { icon: Calendar, label: "Agenda", path: "/agenda", modulo: "agenda" },
  { icon: MessageCircle, label: "WhatsApp", path: "/mensagens", modulo: "mensagens" },
  { icon: ScrollText, label: "Scripts", path: "/scripts", modulo: "scripts" },
  { icon: Workflow, label: "Fluxos", path: "/fluxos", modulo: "fluxos", adminOnly: true },
  {
    icon: Megaphone, label: "Buddha Mkt", path: "/buddha-mkt/templates", modulo: "disparos", adminOnly: true,
    children: [
      { label: "Templates", path: "/buddha-mkt/templates" },
      { label: "Disparos", path: "/buddha-mkt/disparos" },
    ],
  },
  {
    icon: DollarSign, label: "Financeiro", path: "/financeiro", modulo: "financeiro",
    children: [
      { label: "Visão Geral", path: "/financeiro", subsecao: "financeiro:visao-geral" },
      { label: "Contas", path: "/financeiro/extratos", subsecao: "financeiro:contas" },
      { label: "Comanda Recepção", path: "/financeiro/comanda-recepcao", subsecao: "financeiro:comanda-recepcao" },
      { label: "Adquirentes", path: "/financeiro/adquirentes", subsecao: "financeiro:adquirentes" },
      { label: "Transações entre Unidades", path: "/financeiro/transacoes-entre-unidades", subsecao: "financeiro:transacoes-entre-unidades" },
      { label: "Parâmetros", path: "/financeiro/parametros", subsecao: "financeiro:parametros" },
    ],
  },
  { icon: Sparkles, label: "Copilot", path: "/copilot", modulo: "copilot" },
  { icon: Image, label: "Lâminas", path: "/laminas", modulo: "laminas" },
  { icon: UserPlus, label: "Leads", path: "/leads", modulo: "leads" },
  { icon: MessageCircle, label: "Config. Inbox", path: "/config-inbox", modulo: "mensagens" },
  { icon: Settings, label: "Configurações", path: "/configuracoes", modulo: "configuracoes" },
  { icon: Users2, label: "Usuários", path: "/usuarios", adminOnly: true },
  { icon: ScrollText, label: "Log de Auditoria", path: "/auditoria", adminOnly: true },
  { icon: AlertTriangle, label: "Tratamento de erros", path: "/tratamento-erros", adminOnly: true },
];

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3.02h3.89c2.27-2.09 3.58-5.17 3.58-8.84z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.89-3.02c-1.08.72-2.46 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.27v3.1C3.25 21.3 7.31 24 12 24z" />
      <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.27a12 12 0 0 0 0 10.78l4.02-3.1z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.61l4.02 3.1C6.23 6.88 8.88 4.77 12 4.77z" />
    </svg>
  );
}

// Largura alinhada ao layout de referência, com os rótulos das seções completos.
// A chave versionada evita que a preferência compactada de 118px prevaleça.
const SIDEBAR_WIDTH_KEY = "sidebar-width-reference-v3";
const DEFAULT_WIDTH = 220;
const MIN_WIDTH = 180;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div
        className="flex items-center justify-center min-h-screen p-4"
        style={{
          background: "radial-gradient(circle at 50% 15%, oklch(0.32 0.11 29), oklch(0.14 0.04 29) 75%)",
        }}
      >
        <div className="flex flex-col items-center gap-10 w-full max-w-sm">
          <div className="flex flex-col items-center gap-3">
            <img src="/logo.png" alt="Buddha Spa" className="h-28 w-auto drop-shadow-lg" />
            <p className="text-sm text-white/60 text-center tracking-wide">
              Ribeirão Shopping · Shopping Santa Úrsula
            </p>
          </div>

          <div className="w-full bg-card rounded-2xl shadow-2xl p-6 flex flex-col items-center gap-4">
            <div className="text-center">
              <h1
                className="text-xl text-foreground"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                Painel de gestão
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Acesso restrito à equipe Buddha Spa.
              </p>
            </div>
            <button
              onClick={() => startGoogleLogin()}
              className="w-full flex items-center justify-center gap-3 bg-white border border-gray-200 text-gray-700 rounded-lg py-3 px-4 text-sm font-medium shadow-sm hover:shadow-md hover:bg-gray-50 transition-all"
            >
              <GoogleIcon className="h-5 w-5" />
              Continuar com Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location)
    ?? menuItems.find(item => item.children?.some(c => c.path === location));
  const isMobile = useIsMobile();
  const { atendente, loading: atendenteLoading } = useAtendenteAtual();
  const utils = trpc.useUtils();
  const trocarAtendenteMutation = trpc.atendentes.sair.useMutation({
    onSuccess: () => utils.atendentes.atual.invalidate(),
  });
  const { data: minhasPermissoes } = trpc.permissoes.minhas.useQuery();
  // Enquanto minhasPermissoes ainda carrega, assume liberado (mesmo
  // comportamento "não decide nada ainda" do filtro de menu abaixo) —
  // evita um flash de redirect antes da resposta chegar.
  const podeVerDashboard = user?.role === "admin" || !minhasPermissoes?.restrito || minhasPermissoes.modulos.includes("dashboard");

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  // Conta restrita sem "dashboard" liberado não pode ficar parada em
  // "/" (página de pouso padrão no login) — manda pro primeiro módulo
  // que ela realmente tem acesso.
  useEffect(() => {
    if (location !== "/" || podeVerDashboard) return;
    const primeiroLiberado = menuItems.find((item) => {
      if (item.path === "/") return false;
      if (item.adminOnly && user?.role !== "admin") return false;
      if (item.modulo && user?.role !== "admin" && minhasPermissoes?.restrito && !minhasPermissoes.modulos.includes(item.modulo)) return false;
      return true;
    });
    if (primeiroLiberado) setLocation(primeiroLiberado.path);
  }, [location, podeVerDashboard, minhasPermissoes, user, setLocation]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className={isCollapsed ? "h-16 justify-center" : "py-3"}>
            {isCollapsed ? (
              <div className="flex items-center justify-center px-2 w-full">
                <button
                  onClick={toggleSidebar}
                  className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                  aria-label="Toggle navigation"
                >
                  <img src="/logo.png" alt="Buddha Spa" className="h-7 w-auto" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5 px-2 w-full">
                <div className="flex items-center justify-end w-full">
                  <button
                    onClick={toggleSidebar}
                    className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                    aria-label="Toggle navigation"
                  >
                    <PanelLeft className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <img src="/logo.png" alt="Buddha Spa" className="h-[90px] w-auto -mt-1" />
              </div>
            )}
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.filter(item => {
                if (item.adminOnly && user?.role !== "admin") return false;
                if (item.modulo && user?.role !== "admin" && minhasPermissoes?.restrito && !minhasPermissoes.modulos.includes(item.modulo)) return false;
                return true;
              }).map(item => {
                const isActive = location === item.path;

                if (!item.children) {
                  return (
                    <SidebarMenuItem key={item.path}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => setLocation(item.path)}
                        tooltip={item.label}
                        className={`h-10 transition-all font-normal`}
                      >
                        <item.icon
                          className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                        />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                // Filtra sub-seções (um nível abaixo do módulo, ver
                // shared/subsecoes.ts) — "nenhuma chave desse módulo
                // configurada" libera todas, mesma regra do módulo.
                const childrenVisiveis = item.children.filter(child => {
                  if (!child.subsecao || user?.role === "admin" || !minhasPermissoes?.restrito) return true;
                  const subsecoesDoModulo = minhasPermissoes.subsecoes.filter(s => s.startsWith(`${item.modulo}:`));
                  if (subsecoesDoModulo.length === 0) return true;
                  return subsecoesDoModulo.includes(child.subsecao);
                });

                const isChildActive = childrenVisiveis.some(c => c.path === location);
                return (
                  <Collapsible key={item.path} defaultOpen={isChildActive} className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          isActive={isChildActive}
                          tooltip={item.label}
                          className="h-10 transition-all font-normal"
                        >
                          <item.icon className={`h-4 w-4 ${isChildActive ? "text-primary" : ""}`} />
                          <span>{item.label}</span>
                          <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {childrenVisiveis.map(child => (
                            <SidebarMenuSubItem key={child.path}>
                              <SidebarMenuSubButton
                                isActive={location === child.path}
                                onClick={() => setLocation(child.path)}
                                className="cursor-pointer"
                              >
                                <span>{child.label}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3">
            {atendente && !isCollapsed && (
              <button
                onClick={() => trocarAtendenteMutation.mutate()}
                disabled={trocarAtendenteMutation.isPending}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 mb-1.5"
                title="Trocar atendente"
              >
                <Repeat className="h-3 w-3" />
                Atendendo: <span className="font-medium text-foreground">{atendente.nome}</span>
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {atendente && (
                  <DropdownMenuItem
                    onClick={() => trocarAtendenteMutation.mutate()}
                    className="cursor-pointer"
                  >
                    <Repeat className="mr-2 h-4 w-4" />
                    <span>Trocar atendente</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4">
          {atendenteLoading && user?.role !== "admin" ? (
            // Enquanto não sabemos se essa conta já tem atendente selecionado,
            // não monta a página real (children) — evita montar e desmontar
            // em seguida algo pesado como o Dashboard (gráfico Recharts) assim
            // que atendenteLoading resolve pra "sem atendente", troca essa
            // brusca de árvore que já causou um NotFoundError de removeChild
            // (ResizeObserver do Recharts atualizando um nó que o React já
            // tinha removido no unmount).
            <div className="flex items-center justify-center min-h-[60vh]">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !atendente && user?.role !== "admin" ? (
            <AtendenteGate />
          ) : (
            children
          )}
        </main>
      </SidebarInset>
      <GlobalSyncCenter />
    </>
  );
}
