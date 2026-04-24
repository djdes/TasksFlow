import { Switch, Route, useLocation } from "wouter";
import { useEffect, useRef } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import RegisterCompany from "@/pages/RegisterCompany";
import RegisterUser from "@/pages/RegisterUser";
import Instructions from "@/pages/Instructions";
import CreateTask from "@/pages/CreateTask";
import EditTask from "@/pages/EditTask";
import CreateWorker from "@/pages/CreateWorker";
import EditWorker from "@/pages/EditWorker";
import AdminUsers from "@/pages/AdminUsers";
import CompanySettings from "@/pages/CompanySettings";
import ApiKeysPage from "@/pages/ApiKeys";
import NotFound from "@/pages/not-found";

// Disable browser's automatic scroll restoration
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// Component to reset scroll on route change
function ScrollToTop() {
  const [location] = useLocation();
  const prevLocation = useRef(location);

  useEffect(() => {
    // Skip if location hasn't changed
    if (prevLocation.current === location) return;
    prevLocation.current = location;

    // Scroll the #root container (our main scroll container)
    const root = document.getElementById('root');
    if (root) {
      root.scrollTop = 0;
    }
  }, [location]);

  return null;
}

function Router() {
  const [location] = useLocation();

  return (
    <>
      <ScrollToTop />
      <div key={location} className="route-shell">
        <Switch>
          <Route path="/" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/register/company" component={RegisterCompany} />
          <Route path="/register/user" component={RegisterUser} />
          <Route path="/instructions" component={Instructions} />
          <Route path="/dashboard" component={Dashboard} />
          <Route path="/admin/users" component={AdminUsers} />
          <Route path="/admin/settings" component={CompanySettings} />
          <Route path="/admin/api-keys" component={ApiKeysPage} />
          <Route path="/tasks/new" component={CreateTask} />
          <Route path="/tasks/:id/edit" component={EditTask} />
          <Route path="/workers/new" component={CreateWorker} />
          <Route path="/workers/:id/edit" component={EditWorker} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
