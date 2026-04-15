import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Building2, Mail, User, Save, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export default function CompanySettings() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [adminName, setAdminName] = useState("");

  // Получаем данные компании
  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ["company-me"],
    queryFn: async () => {
      const response = await fetch("/api/companies/me", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch company");
      }
      return response.json();
    },
    enabled: !!user?.isAdmin,
  });

  // Заполняем форму при загрузке данных
  useEffect(() => {
    if (company) {
      setCompanyName(company.name || "");
      setCompanyEmail(company.email || "");
    }
  }, [company]);

  useEffect(() => {
    if (user) {
      setAdminName(user.name || "");
    }
  }, [user]);

  // Мутация для обновления компании
  const updateCompanyMutation = useMutation({
    mutationFn: async (data: { name: string; email: string }) => {
      const response = await fetch("/api/companies/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Ошибка обновления");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-me"] });
      toast({
        title: "Сохранено",
        description: "Настройки компании обновлены",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Мутация для обновления имени админа
  const updateAdminMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const response = await fetch("/api/auth/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Ошибка обновления");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth-me"] });
      toast({
        title: "Сохранено",
        description: "Ваше имя обновлено",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveCompany = () => {
    if (!companyName.trim()) {
      toast({
        title: "Ошибка",
        description: "Название компании обязательно",
        variant: "destructive",
      });
      return;
    }
    updateCompanyMutation.mutate({
      name: companyName,
      email: companyEmail,
    });
  };

  const handleSaveAdmin = () => {
    updateAdminMutation.mutate({ name: adminName });
  };

  // Проверка прав
  if (authLoading || companyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-muted-foreground">Загрузка...</span>
        </div>
      </div>
    );
  }

  if (!user || !user.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-muted/20 to-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Доступ запрещен</h1>
          <p className="text-muted-foreground mb-4">Требуются права администратора</p>
          <Button onClick={() => setLocation("/dashboard")}>На главную</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/10 to-background">
      <div className="max-w-2xl mx-auto p-6 md:p-8">
        <div className="mb-8">
          <button
            onClick={() => setLocation("/dashboard")}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Назад
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
              <Building2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Настройки компании
            </h1>
          </div>
        </div>

        <div className="space-y-6">
          {/* Настройки компании */}
          <div className="bg-card/80 backdrop-blur-sm rounded-2xl border border-border/50 shadow-xl p-6 md:p-8">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Данные компании
            </h2>

            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Название компании
                </label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="ИП Иванов Иван"
                  className="h-12"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    Email для уведомлений
                  </div>
                </label>
                <Input
                  type="email"
                  value={companyEmail}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                  placeholder="admin@company.ru"
                  className="h-12"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  На этот адрес будут приходить уведомления о выполненных задачах с фото
                </p>
              </div>

              <Button
                onClick={handleSaveCompany}
                disabled={updateCompanyMutation.isPending}
                className="w-full h-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg"
              >
                {updateCompanyMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Сохранить данные компании
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Настройки администратора */}
          <div className="bg-card/80 backdrop-blur-sm rounded-2xl border border-border/50 shadow-xl p-6 md:p-8">
            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Ваш профиль
            </h2>

            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Ваше имя
                </label>
                <Input
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="Иван Иванов"
                  className="h-12"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Телефон
                </label>
                <Input
                  value={user.phone}
                  disabled
                  className="h-12 bg-muted/50"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Телефон используется для входа и не может быть изменен
                </p>
              </div>

              <Button
                onClick={handleSaveAdmin}
                disabled={updateAdminMutation.isPending}
                className="w-full h-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg"
              >
                {updateAdminMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Сохранение...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Сохранить профиль
                  </>
                )}
              </Button>
            </div>

            <div className="bg-card rounded-lg border p-4 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">API ключи</h3>
                  <p className="text-sm text-muted-foreground">
                    Для интеграций со сторонними сервисами
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setLocation("/admin/api-keys")}
                >
                  Управлять
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
