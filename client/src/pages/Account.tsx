import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, ApiError, fetchOrFriendlyError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TelegramSection } from "@/components/TelegramSection";
import { MotionToggle } from "@/components/MotionToggle";
import { FeedbackToggle } from "@/components/FeedbackToggle";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { plural } from "@/lib/i18n";
import { formatPhoneDisplay } from "@/lib/user-display";
import { ArrowLeft, Mail, KeyRound, Palette, TriangleAlert, UserRound } from "lucide-react";
import { ChangePinCard } from "@/components/ChangePinCard";
import { AppDeviceCard } from "@/components/AppDeviceCard";

type DeleteStep = "closed" | "confirm" | "sole_admin";

/**
 * Личные настройки аккаунта: оформление, email, Telegram, пароль и
 * удаление аккаунта. Отдельно от настроек компании (/admin/settings).
 */
export default function Account() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState(user?.email ?? "");
  const [emailBusy, setEmailBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const [deleteStep, setDeleteStep] = useState<DeleteStep>("closed");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [orphanCount, setOrphanCount] = useState(0);

  const saveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailBusy(true);
    try {
      await apiRequest("PUT", "/api/account/email", { email });
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      toast({ title: "Email обновлён", description: email });
    } catch (err) {
      toast({
        title: "Не удалось изменить email",
        description: err instanceof ApiError ? err.message : "Ошибка",
        variant: "destructive",
      });
    } finally {
      setEmailBusy(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwBusy(true);
    try {
      await apiRequest("PUT", "/api/account/password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      toast({ title: "Пароль обновлён" });
    } catch (err) {
      toast({
        title: "Не удалось изменить пароль",
        description: err instanceof ApiError ? err.message : "Ошибка",
        variant: "destructive",
      });
    } finally {
      setPwBusy(false);
    }
  };

  // Единственный admin с сотрудниками получает 409 sole_admin: показываем
  // второй шаг с выбором «назначить другого» или «всё равно удалить».
  const deleteAccount = async (confirmOrphan: boolean) => {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetchOrFriendlyError("/api/auth/me", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmOrphan ? { confirmOrphan: true } : {}),
        signal: AbortSignal.timeout(30_000),
      });
      const body = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (res.status === 409 && body?.code === "sole_admin") {
        setOrphanCount(typeof body.otherUsers === "number" ? body.otherUsers : 0);
        setDeleteStep("sole_admin");
        return;
      }
      if (!res.ok) {
        setDeleteError(
          typeof body?.message === "string" && body.message
            ? body.message
            : "Не удалось удалить аккаунт. Попробуйте ещё раз.",
        );
        return;
      }
      // Жёсткий переход на лендинг сбрасывает кэш запросов и контекст.
      window.location.href = "/";
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Нет связи с сервером. Попробуйте ещё раз.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const closeDelete = (open: boolean) => {
    if (open) return;
    setDeleteStep("closed");
    setDeleteError(null);
  };

  const identity = formatPhoneDisplay(user?.phone) || user?.email || "";

  return (
    <div className="page-screen">
      <div className="page-container page-container--narrow">
        <button
          type="button"
          onClick={() => setLocation("/dashboard")}
          data-home-back className="page-back group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          В кабинет
        </button>

        <div className="page-header">
          <div className="page-title-row">
            <div className="page-icon">
              <UserRound className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h1 className="page-title">Аккаунт</h1>
              <p className="page-subtitle">
                {user?.name ? <>{user.name}{identity ? ` · ${identity}` : ""}</> : identity || "Личные настройки"}
              </p>
            </div>
          </div>
        </div>

        <div className="page-sections">
          <section className="content-panel account-section">
            <div className="section-title">
              <Palette className="w-5 h-5 text-primary" />
              <h2>Оформление</h2>
            </div>
            <div className="account-appearance">
              <ThemeSwitcher />
              <MotionToggle />
              <FeedbackToggle />
            </div>
          </section>

          {/* PIN — пароль входа по телефону */}
          <ChangePinCard />

          {/* Установка на это устройство и push на нём */}
          <AppDeviceCard />

          {/* Смена email */}
          <section className="content-panel account-section">
            <div className="section-title">
              <Mail className="w-5 h-5 text-primary" />
              <h2>Email</h2>
            </div>
            <form onSubmit={saveEmail} className="account-form">
              <Input
                type="email"
                aria-label="Email"
                placeholder="you@company.ru"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Button type="submit" disabled={!email.trim()} loading={emailBusy} loadingLabel="Сохраняем…">
                Сохранить email
              </Button>
            </form>
          </section>

          {/* Привязка Telegram-бота */}
          <TelegramSection />

          {/* Смена пароля */}
          <section className="content-panel account-section">
            <div className="section-title">
              <KeyRound className="w-5 h-5 text-primary" />
              <h2>Пароль</h2>
            </div>
            <form onSubmit={savePassword} className="account-form">
              <Input
                type="password"
                aria-label="Текущий пароль"
                placeholder="Текущий пароль (если уже задан)"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <Input
                type="password"
                aria-label="Новый пароль"
                placeholder="Новый пароль (мин. 6 символов)"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <Button type="submit" disabled={newPassword.length < 6} loading={pwBusy} loadingLabel="Сохраняем…">
                Сменить пароль
              </Button>
            </form>
          </section>

          <section className="content-panel account-section account-danger" aria-labelledby="account-danger-title">
            <div className="section-title">
              <TriangleAlert className="w-5 h-5" />
              <h2 id="account-danger-title">Опасная зона</h2>
            </div>
            <p className="account-danger-text">
              Аккаунт и вход по нему удалятся навсегда. Задачи, назначенные вам,
              останутся в компании без исполнителя.
            </p>
            <Button type="button" variant="outline" className="account-danger-button" onClick={() => setDeleteStep("confirm")}>
              Удалить аккаунт
            </Button>
          </section>
        </div>
      </div>

      {/* Одно окно на оба шага: второй шаг меняет содержимое на месте,
          без закрытия и повторного открытия шторки. */}
      {deleteStep === "sole_admin" ? (
        <ConfirmDialog
          open
          onOpenChange={closeDelete}
          title="Вы единственный администратор"
          description={
            <>
              <p>
                {orphanCount > 0
                  ? `В компании ещё ${orphanCount} ${plural(orphanCount, "человек", "человека", "человек")}. `
                  : null}
                Без администратора никто не сможет создавать задачи, приглашать
                сотрудников и менять настройки компании.
              </p>
              <p>Сначала назначьте администратором кого-то из команды в разделе «Сотрудники».</p>
            </>
          }
          cancelLabel="Назначить администратора"
          onCancel={() => { closeDelete(false); setLocation("/admin/users"); }}
          confirmLabel="Всё равно удалить"
          destructive
          busy={deleteBusy}
          error={deleteError}
          onConfirm={() => { void deleteAccount(true); }}
        />
      ) : (
        <ConfirmDialog
          open={deleteStep === "confirm"}
          onOpenChange={closeDelete}
          title="Удалить аккаунт?"
          description={
            <>
              <p>Это нельзя отменить: восстановить аккаунт не получится.</p>
              <p>Задачи, назначенные вам, останутся без исполнителя.</p>
            </>
          }
          confirmLabel="Удалить навсегда"
          destructive
          confirmWord="УДАЛИТЬ"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={() => { void deleteAccount(false); }}
        />
      )}
    </div>
  );
}
