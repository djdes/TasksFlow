import { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { apiRequest, fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";
import { forgetThisDevice } from "@/lib/push";

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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

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
    await forgetThisDevice();
    await logoutMutation.mutateAsync();
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
