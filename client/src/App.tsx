import { Switch, Route, useLocation } from "wouter";
import { useEffect, useRef, lazy, Suspense } from "react";
import { MotionConfig } from "framer-motion";
import { Loader2 } from "lucide-react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Eager-loaded: Login + Dashboard + 404 — самые частые точки входа.
// 90% сессий — это воркер открыл /dashboard и работает там.
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import NotFound from "@/pages/not-found";

// Lazy: всё остальное. Admin-страницы (AdminUsers, ApiKeys, Integrations,
// Verification, Invitations, CompanySettings) воркер никогда не
// открывает; Create/Edit формы тоже только админ/руководитель.
// Help/Instructions — open редко. Register* — раз за всю карьеру.
// Сокращает main-bundle для воркеров на ~30-40% (см. dist size после
// build'а). Сетевая задержка при первом открытии <100ms на 4G —
// неощутимо за счёт Suspense-spinner'а.
const Register = lazy(() => import("@/pages/Register"));
const RegisterCompany = lazy(() => import("@/pages/RegisterCompany"));
const RegisterUser = lazy(() => import("@/pages/RegisterUser"));
const Instructions = lazy(() => import("@/pages/Instructions"));
const Help = lazy(() => import("@/pages/Help"));
const CreateTask = lazy(() => import("@/pages/CreateTask"));
const EditTask = lazy(() => import("@/pages/EditTask"));
const CreateWorker = lazy(() => import("@/pages/CreateWorker"));
const EditWorker = lazy(() => import("@/pages/EditWorker"));
const AdminUsers = lazy(() => import("@/pages/AdminUsers"));
const CompanySettings = lazy(() => import("@/pages/CompanySettings"));
const ApiKeysPage = lazy(() => import("@/pages/ApiKeys"));
const IntegrationsPage = lazy(() => import("@/pages/Integrations"));
const VerificationPage = lazy(() => import("@/pages/Verification"));
const Invitations = lazy(() => import("@/pages/Invitations"));
const JoinByInvite = lazy(() => import("@/pages/JoinByInvite"));
const Account = lazy(() => import("@/pages/Account"));

function RouteSuspenseFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

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
        <Suspense fallback={<RouteSuspenseFallback />}>
          <Switch>
            <Route path="/" component={Login} />
            <Route path="/login" component={Login} />
            <Route path="/account" component={Account} />
            <Route path="/register" component={Register} />
            <Route path="/register/company" component={RegisterCompany} />
            <Route path="/register/user" component={RegisterUser} />
            <Route path="/instructions" component={Instructions} />
            <Route path="/help" component={Help} />
            <Route path="/dashboard" component={Dashboard} />
            <Route path="/admin/users" component={AdminUsers} />
            <Route path="/admin/settings" component={CompanySettings} />
            <Route path="/admin/api-keys" component={ApiKeysPage} />
            <Route path="/admin/integrations" component={IntegrationsPage} />
            <Route path="/admin/verification" component={VerificationPage} />
            <Route path="/admin/invitations" component={Invitations} />
            <Route path="/join/:token" component={JoinByInvite} />
            <Route path="/tasks/new" component={CreateTask} />
            <Route path="/tasks/:id/edit" component={EditTask} />
            <Route path="/workers/new" component={CreateWorker} />
            <Route path="/workers/:id/edit" component={EditWorker} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </div>
    </>
  );
}

function App() {
  // reducedMotion="user" — Framer Motion уважает OS-настройку
  // prefers-reduced-motion: reduce. CSS-fallback в index.css:2680
  // покрывает CSS-анимации, но Framer (StatHero, StreakAchievement,
  // OnboardingTour, Login auth-hero, GreetingBanner и др.) — это JS,
  // CSS rule на animation-duration на него НЕ влияет. Без MotionConfig
  // пользователи с вестибулярными нарушениями / мигренями получают
  // полный спектр scale/translate-эффектов даже при включённом
  // системном reduced-motion. С "user" — финальные значения сразу
  // без анимации.
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <MotionConfig reducedMotion="user">
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <TooltipProvider>
                <Toaster />
                <Router />
              </TooltipProvider>
            </AuthProvider>
          </QueryClientProvider>
        </MotionConfig>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
