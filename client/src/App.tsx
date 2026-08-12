import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Clientes from "./pages/Clientes";
import Reativacao from "./pages/Reativacao";
import Agenda from "./pages/Agenda";
import Mensagens from "./pages/Mensagens";
import Scripts from "./pages/Scripts";
import Financeiro from "./pages/Financeiro";
import Extratos from "./pages/Extratos";
import ComandaRecepcao from "./pages/ComandaRecepcao";
import Adquirentes from "./pages/Adquirentes";
import Parametros from "./pages/Parametros";
import Copilot from "./pages/Copilot";
import Laminas from "./pages/Laminas";
import Leads from "./pages/Leads";
import Configuracoes from "@/pages/Configuracoes";
import ConfigInbox from "@/pages/ConfigInbox";
import AuditLog from "@/pages/AuditLog";
import Usuarios from "@/pages/Usuarios";

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
        <Route path="/financeiro" component={Financeiro} />
        <Route path="/financeiro/extratos" component={Extratos} />
        <Route path="/financeiro/comanda-recepcao" component={ComandaRecepcao} />
        <Route path="/financeiro/adquirentes" component={Adquirentes} />
        <Route path="/financeiro/parametros" component={Parametros} />
        <Route path="/copilot" component={Copilot} />
        <Route path="/laminas" component={Laminas} />
        <Route path="/leads" component={Leads} />
        <Route path="/config-inbox" component={ConfigInbox} />
        <Route path="/configuracoes" component={Configuracoes} />
        <Route path="/usuarios" component={Usuarios} />
        <Route path="/auditoria" component={AuditLog} />
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
