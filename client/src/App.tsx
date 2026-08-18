import React from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Clientes from "./pages/Clientes";
import Reativacao from "./pages/Reativacao";
import Agenda from "./pages/Agenda";
import Mensagens from "./pages/Mensagens";
import Scripts from "./pages/Scripts";
import Fluxos from "./pages/Fluxos";
import FluxoDetalhe from "./pages/FluxoDetalhe";
import Templates from "./pages/Templates";
import Disparos from "./pages/Disparos";
import Financeiro from "./pages/Financeiro";
import Extratos from "./pages/Extratos";
import ComandaRecepcao from "./pages/ComandaRecepcao";
import Adquirentes from "./pages/Adquirentes";
import TransacoesEntreUnidades from "./pages/TransacoesEntreUnidades";
import Parametros from "./pages/Parametros";
import Copilot from "./pages/Copilot";
import Agentes from "./pages/Agentes";
import Tabela from "./pages/Tabela";
import Laminas from "./pages/Laminas";
import Leads from "./pages/Leads";
import Configuracoes from "@/pages/Configuracoes";
import ConfigInbox from "@/pages/ConfigInbox";
import AuditLog from "@/pages/AuditLog";
import Usuarios from "@/pages/Usuarios";
import TratamentoErros from "@/pages/TratamentoErros";
import PoliticaPrivacidade from "@/pages/PoliticaPrivacidade";
import { AdminOnly } from "./components/AdminOnly";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/clientes" component={Clientes} />
        <Route path="/reativacao" component={Reativacao} />
        <Route path="/agenda" component={Agenda} />
        <Route path="/mensagens" component={Mensagens} />
        <Route path="/scripts" component={Scripts} />
        <Route path="/fluxos" component={Fluxos} />
        <Route path="/fluxos/:id" component={FluxoDetalhe} />
        <Route path="/buddha-mkt/templates" component={Templates} />
        <Route path="/buddha-mkt/disparos" component={Disparos} />
        <Route path="/financeiro" component={Financeiro} />
        <Route path="/financeiro/extratos" component={Extratos} />
        <Route path="/financeiro/comanda-recepcao" component={ComandaRecepcao} />
        <Route path="/financeiro/adquirentes" component={Adquirentes} />
        <Route path="/financeiro/transacoes-entre-unidades" component={TransacoesEntreUnidades} />
        <Route path="/financeiro/parametros" component={Parametros} />
        <Route path="/copilot" component={Copilot} />
        <Route path="/agentes">{() => <AdminOnly rota="/agentes"><Agentes /></AdminOnly>}</Route>
        <Route path="/agentes/tabela"><Redirect to="/tabela-precos" /></Route>
        <Route path="/tabela-precos" component={Tabela} />
        <Route path="/laminas" component={Laminas} />
        <Route path="/leads" component={Leads} />
        <Route path="/config-inbox" component={ConfigInbox} />
        <Route path="/configuracoes">{() => <AdminOnly rota="/configuracoes"><Configuracoes /></AdminOnly>}</Route>
        <Route path="/usuarios" component={Usuarios} />
        <Route path="/auditoria" component={AuditLog} />
        <Route path="/tratamento-erros" component={TratamentoErros} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          {/* Fora do DashboardLayout de propósito — precisa ser acessível
              sem login pro crawler da Meta (exigência do App Review). */}
          <Switch>
            <Route path="/privacidade" component={PoliticaPrivacidade} />
            <Route>{() => <Router />}</Route>
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
