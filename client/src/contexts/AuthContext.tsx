import { createContext, useContext, useEffect, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { ApiError, apiRequest, fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";
import { forgetThisDevice } from "@/lib/push";
import { setAppBadge } from "@/lib/pwa";
import type { UserAccess } from "@shared/roles";
import type { NotifyPrefs } from "@shared/notify";

type User = {
  id: number;
  // phone nullable: email-юзеры (ветка лендинга) телефона не имеют.
  phone?: string | null;
  name?: string | null;
  isAdmin: boolean;
  createdAt: number;
  email?: string | null;
  /** Производные поля сервера: PIN задан, вход заблокирован после ошибок. */
  hasPin?: boolean;
  pinLocked?: boolean;
  /** Недавний вход по email: PIN можно сменить без текущего. */
  pinResetByEmail?: boolean;
  position?: string | null;
  roleId?: number | null;
  /** Права по роли — считает сервер (shared/roles.ts). */
  access?: UserAccess;
  /** Личные настройки уведомлений. */
  notify?: NotifyPrefs;
  impersonation?: { actorId: number; readOnly: true; unavailable?: boolean };
} | null;

/** Ответ входа: следующий шаг (ввести или придумать PIN) либо готовая сессия. */
export type LoginResult = { step: "pin" | "setup" } | { step: "done" };

interface AuthContextType {
  user: User;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
  login: (phone: string, pin?: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  impersonate: (userId: number) => Promise<void>;
  stopImpersonating: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const accountChanged = (event: StorageEvent) => {
      if (event.key === "tf_account_changed") window.location.reload();
    };
    window.addEventListener("storage", accountChanged);
    return () => window.removeEventListener("storage", accountChanged);
  }, []);

  // Получаем текущего пользователя
  const { data: user = null, isLoading, isError, refetch } = useQuery<User>({
    queryKey: ["auth", "me"],
    queryFn: async ({ signal }) => {
      const response = await fetchOrFriendlyError(api.auth.me.path, {
        credentials: "include",
        signal: withTimeout(signal, 30_000),
      });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error("Не удалось проверить сессию");
      return response.json();
    },
    retry: false,
  });

  // Мутация для логина
  const loginMutation = useMutation({
    mutationFn: async ({ phone, pin }: { phone: string; pin?: string }): Promise<LoginResult> => {
      const response = await apiRequest("POST", api.auth.login.path, pin ? { phone, pin } : { phone });
      const body = await response.json();
      if (body?.step === "pin" || body?.step === "setup") return { step: body.step };
      return { step: "done" };
    },
    onSuccess: (result) => {
      // Промежуточный шаг (ввести или придумать PIN) — сессии ещё нет.
      if (result.step !== "done") return;
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      // Обновляем задачи после авторизации
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  // Мутация для выхода
  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", api.auth.logout.path);
      return response.json();
    },
    onSuccess: () => {
      queryClient.setQueryData(["auth", "me"], null);
      // Очищаем кэш задач при выходе
      queryClient.removeQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const login = (phone: string, pin?: string) => loginMutation.mutateAsync({ phone, pin });

  const logout = async () => {
    // Пока сессия жива — отвязать push этого устройства (общий планшет).
    // И убрать число задач с иконки: следующему человеку оно не про него.
    setAppBadge(0);
    if (!user?.impersonation) await forgetThisDevice();
    await logoutMutation.mutateAsync();
  };

  const switchAccount = async (path: string, body: { userId: number } | undefined, destination: string) => {
    try {
      await apiRequest("POST", path, body);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      destination = "/login";
    }
    try {
      // Cookie общая для вкладок: остальные кабинеты тоже сбрасывают данные.
      localStorage.setItem("tf_account_changed", `${Date.now()}-${Math.random()}`);
    } catch { /* В приватном режиме остаётся перезагрузка текущей вкладки. */ }
    // Полная навигация уничтожает кэш, открытые диалоги и запросы прежнего
    // аккаунта. В новом кабинете не мелькнут данные руководителя.
    window.location.assign(destination);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isError,
        retry: () => { void refetch(); },
        login,
        logout,
        impersonate: (userId) => switchAccount(api.auth.impersonate.path, { userId }, "/dashboard"),
        stopImpersonating: () => switchAccount(api.auth.stopImpersonating.path, undefined, `/admin/users?user=${user?.id ?? ""}`),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
