import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TelegramSection } from "@/components/TelegramSection";
import { ArrowLeft, Loader2, Mail, KeyRound } from "lucide-react";

/**
 * Личные настройки аккаунта: смена email и пароля (ветка email-входа).
 * Отдельно от настроек компании (/admin/settings).
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

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <button
          onClick={() => setLocation("/dashboard")}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> В кабинет
        </button>

        <h1 className="text-2xl font-bold mb-6">Аккаунт</h1>

        {/* Смена email */}
        <section className="rounded-xl border border-border bg-card p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Email</h2>
          </div>
          <form onSubmit={saveEmail} className="space-y-3">
            <Input
              type="email"
              placeholder="you@company.ru"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button type="submit" disabled={emailBusy || !email.trim()}>
              {emailBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сохранить email"}
            </Button>
          </form>
        </section>

        {/* Привязка Telegram-бота */}
        <TelegramSection />

        {/* Смена пароля */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Пароль</h2>
          </div>
          <form onSubmit={savePassword} className="space-y-3">
            <Input
              type="password"
              placeholder="Текущий пароль (если уже задан)"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Новый пароль (мин. 6 символов)"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <Button type="submit" disabled={pwBusy || newPassword.length < 6}>
              {pwBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Сменить пароль"}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
