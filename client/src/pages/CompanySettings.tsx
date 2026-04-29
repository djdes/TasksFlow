import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Copy,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Mail,
  Palette,
  PlugZap,
  RefreshCw,
  Save,
  ShieldCheck,
  User,
} from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

const WESETUP_PENDING_KEY_STORAGE = "tasksflow:pending-wesetup-api-key";

export default function CompanySettings() {
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [wesetupBaseUrl, setWesetupBaseUrl] = useState("");
  const [wesetupApiKey, setWesetupApiKey] = useState("");
  const [adminName, setAdminName] = useState("");
  const [showWesetupKey, setShowWesetupKey] = useState(false);
  const [wesetupHealth, setWesetupHealth] = useState<{
    ok: boolean;
    message?: string;
    journalsCount?: number;
    formsCount?: number;
    assignableUsersCount?: number;
    upstreamStatus?: number;
  } | null>(null);

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
      const pendingWesetupKey = window.localStorage.getItem(
        WESETUP_PENDING_KEY_STORAGE
      );
      setCompanyName(company.name || "");
      setCompanyEmail(company.email || "");
      setWesetupBaseUrl(company.wesetupBaseUrl || "");
      setWesetupApiKey(pendingWesetupKey || company.wesetupApiKey || "");
      if (pendingWesetupKey) {
        setShowWesetupKey(true);
        setWesetupHealth(null);
        window.localStorage.removeItem(WESETUP_PENDING_KEY_STORAGE);
        toast({
          title: "Ключ подставлен",
          description: "Проверьте адрес WeSetup и сохраните настройки.",
        });
      }
    }
  }, [company, toast]);

  useEffect(() => {
    if (user) {
      setAdminName(user.name || "");
    }
  }, [user]);

  // Мутация для обновления компании
  const updateCompanyMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      email: string;
      wesetupBaseUrl: string;
      wesetupApiKey: string;
    }) => {
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

  const checkWesetupMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/wesetup/health", {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({
        ok: false,
        message: "TasksFlow получил от сервера не JSON",
      }));
      if (!response.ok) {
        throw Object.assign(new Error(data?.message || "Проверка WeSetup не прошла"), {
          data,
        });
      }
      return data;
    },
    onSuccess: (data) => {
      setWesetupHealth(data);
      toast({
        title: "Доступ к WeSetup работает",
        description: `Журналов: ${data.journalsCount ?? 0}, форм: ${data.formsCount ?? 0}`,
      });
    },
    onError: (error: any) => {
      const data = error?.data || {
        ok: false,
        message: error?.message || "Проверка WeSetup не прошла",
      };
      setWesetupHealth(data);
      toast({
        title: "Нет доступа к WeSetup",
        description: data.message,
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
      wesetupBaseUrl,
      wesetupApiKey,
    });
  };

  const handleSaveAdmin = () => {
    updateAdminMutation.mutate({ name: adminName });
  };

  const handleCopyWesetupKey = async () => {
    if (!wesetupApiKey.trim()) return;
    try {
      await navigator.clipboard.writeText(wesetupApiKey);
      toast({ title: "Скопировано", description: "Ключ TasksFlow для WeSetup в буфере" });
    } catch {
      toast({
        title: "Ошибка",
        description: "Не удалось скопировать ключ",
        variant: "destructive",
      });
    }
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
    <div className="page-screen">
      <div className="page-container page-container--narrow">
        <div className="page-header">
          <button
            onClick={() => setLocation("/dashboard")}
            className="page-back group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Назад
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="page-icon">
              <Building2 className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="page-title">
              Настройки компании
            </h1>
          </div>
        </div>

        <div className="space-y-6">
          {/* Тема оформления — личная настройка устройства, живёт в
              localStorage. Не привязана к компании, поэтому отдельным
              блоком сверху. По умолчанию = «Авто» (как в браузере). */}
          <div className="content-panel">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex items-center gap-3">
                <div className="page-icon" style={{ width: 40, height: 40 }}>
                  <Palette className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <h2 className="text-base font-semibold">Тема оформления</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Тёмная экономит батарею и легче глазам вечером
                  </p>
                </div>
              </div>
              <div className="ml-auto">
                <ThemeSwitcher />
              </div>
            </div>
          </div>

          {/* Настройки компании */}
          <div className="content-panel">
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

              {/* Скрыто из UI 2026-04-29 — основной flow идёт через
                  WeSetup mini-app (race-claim + verifications), этот
                  обратный канал в большинстве случаев не нужен и сбивает
                  менеджеров. Значения wesetupBaseUrl + wesetupApiKey
                  остаются в БД — server-side endpoints (journals-catalog,
                  task-form, complete) продолжают работать с ранее
                  сохранёнными credentials. Чтобы вернуть UI — убрать
                  style display:none. */}
              <div
                style={{ display: "none" }}
                aria-hidden="true"
                className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <PlugZap className="w-4 h-4 text-primary" />
                      Доступ TasksFlow к журналам WeSetup
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Это не второй API. Здесь хранится адрес WeSetup и тот же tfk_ ключ TasksFlow, который указан в WeSetup для этой компании.
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                      wesetupBaseUrl.trim() && wesetupApiKey.trim()
                        ? "bg-green-500/10 text-green-700"
                        : "bg-amber-500/10 text-amber-700"
                    }`}
                  >
                    {wesetupBaseUrl.trim() && wesetupApiKey.trim()
                      ? "Настроено"
                      : "Не настроено"}
                  </span>
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    <div className="flex items-center gap-2">
                      <Link2 className="w-4 h-4 text-muted-foreground" />
                      Адрес WeSetup
                    </div>
                  </label>
                  <Input
                    value={wesetupBaseUrl}
                    onChange={(e) => {
                      setWesetupBaseUrl(e.target.value);
                      setWesetupHealth(null);
                    }}
                    placeholder="https://wesetup.ru"
                    className="h-12"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    Ключ TasksFlow для WeSetup
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type={showWesetupKey ? "text" : "password"}
                      value={wesetupApiKey}
                      onChange={(e) => {
                        setWesetupApiKey(e.target.value);
                        setWesetupHealth(null);
                      }}
                      placeholder="tfk_..."
                      className="h-12 min-w-0 font-mono text-sm"
                      autoComplete="off"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-12 w-12 shrink-0"
                      onClick={() => setShowWesetupKey((value) => !value)}
                      aria-label={showWesetupKey ? "Скрыть ключ" : "Показать ключ"}
                    >
                      {showWesetupKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-12 w-12 shrink-0"
                      onClick={handleCopyWesetupKey}
                      disabled={!wesetupApiKey.trim()}
                      aria-label="Скопировать ключ"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Этот ключ создаётся в разделе API ключей TasksFlow, вставляется в WeSetup и используется TasksFlow для обратного доступа к журналам.
                  </p>
                </div>

                <div className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-medium">Проверка доступа</div>
                      <div className="text-xs text-muted-foreground">
                        TasksFlow запросит каталог журналов WeSetup этим tfk_ ключом.
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => checkWesetupMutation.mutate()}
                      disabled={checkWesetupMutation.isPending}
                      className="h-10 shrink-0"
                    >
                      {checkWesetupMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Проверить
                    </Button>
                  </div>

                  {wesetupHealth ? (
                    <div
                      className={`flex items-start gap-3 rounded-xl p-3 text-sm ${
                        wesetupHealth.ok
                          ? "bg-green-500/10 text-green-700"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {wesetupHealth.ok ? (
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      )}
                      <div>
                        <div className="font-medium">
                          {wesetupHealth.ok ? "Связь работает" : "Связь не работает"}
                        </div>
                        <div className="mt-1">
                          {wesetupHealth.ok
                            ? `Журналов: ${wesetupHealth.journalsCount ?? 0}, форм: ${wesetupHealth.formsCount ?? 0}, сотрудников: ${wesetupHealth.assignableUsersCount ?? 0}`
                            : wesetupHealth.message || "Проверьте URL и ключ."}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
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
          <div className="content-panel">
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
