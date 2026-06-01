import { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { apiRequest, fetchOrFriendlyError, withTimeout } from "@/lib/queryClient";

type User = {
  id: number;
  // phone nullable: email-юзеры (ветка лендинга) телефона не имеют.
  phone?: string | null;
  name?: string | null;
  isAdmin: boolean;
  createdAt: number;
  email?: string | null;
} | null;

interface AuthContextType {
  user: User;
  isLoading: boolean;
  login: (phone: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // Получаем текущего пользователя
  const { data: user = null, isLoading } = useQuery<User>({
    queryKey: ["auth", "me"],
    queryFn: async ({ signal }) => {
      const response = await fetchOrFriendlyError(api.auth.me.path, {
        credentials: "include",
        signal: withTimeout(signal, 30_000),
      });
      if (!response.ok) {
        return null;
      }
      return response.json();
    },
    retry: false,
  });

  // Мутация для логина
  const loginMutation = useMutation({
    mutationFn: async ({ phone }: { phone: string }) => {
      const response = await apiRequest("POST", api.auth.login.path, { phone });
      return response.json();
    },
    onSuccess: () => {
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

  const login = async (phone: string) => {
    await loginMutation.mutateAsync({ phone });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
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
