"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  ExternalLink,
  CheckCircle2,
  Unlink,
  Thermometer,
  AlertTriangle,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface NotificationSettingsProps {
  botUsername: string;
  linkToken: string;
}

interface NotificationPrefs {
  temperature: boolean;
  deviations: boolean;
  compliance: boolean;
}

export function NotificationSettings({
  botUsername,
  linkToken,
}: NotificationSettingsProps) {
  const router = useRouter();
  const [isLinked, setIsLinked] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    temperature: true,
    deviations: true,
    compliance: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isUnlinking, setIsUnlinking] = useState(false);

  const botLink = botUsername
    ? `https://t.me/${botUsername}?start=${linkToken}`
    : "";

  useEffect(() => {
    fetch("/api/notifications/preferences")
      .then((res) => res.json())
      .then((data) => {
        setIsLinked(data.isLinked);
        setPrefs(data.prefs);
      })
      .catch(() => toast.error("Ошибка загрузки настроек"))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleUnlink() {
    setIsUnlinking(true);
    try {
      const res = await fetch("/api/notifications/telegram/unlink", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setIsLinked(false);
      toast.success("Telegram отвязан");
      router.refresh();
    } catch {
      toast.error("Ошибка при отвязке Telegram");
    } finally {
      setIsUnlinking(false);
    }
  }

  async function handlePrefChange(
    key: keyof NotificationPrefs,
    value: boolean
  ) {
    const oldPrefs = prefs;
    const newPrefs = { ...prefs, [key]: value };
    setPrefs(newPrefs);

    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPrefs),
      });
      if (!res.ok) throw new Error();
      toast.success("Настройки сохранены");
    } catch {
      setPrefs(oldPrefs);
      toast.error("Ошибка сохранения настроек");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Уведомления</h1>
          <p className="mt-1 text-muted-foreground">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Уведомления</h1>
        <p className="mt-1 text-muted-foreground">
          Настройка каналов уведомлений
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Bell className="size-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Telegram</CardTitle>
              <CardDescription>
                Получайте уведомления о критических событиях в Telegram
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLinked ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-green-600" />
                <Badge
                  variant="secondary"
                  className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                >
                  Telegram привязан
                </Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleUnlink}
                disabled={isUnlinking}
                className="text-destructive hover:text-destructive"
              >
                <Unlink className="size-4" />
                {isUnlinking ? "Отвязка..." : "Отвязать"}
              </Button>
            </div>
          ) : botLink ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Для получения уведомлений привяжите ваш Telegram-аккаунт.
                Нажмите кнопку ниже и отправьте команду /start боту.
              </p>
              <Button asChild>
                <a href={botLink} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Привязать Telegram
                </a>
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Telegram-бот не настроен. Обратитесь к администратору системы.
            </p>
          )}
        </CardContent>
      </Card>

      {isLinked && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Типы уведомлений</CardTitle>
            <CardDescription>
              Выберите, какие уведомления вы хотите получать в Telegram
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Thermometer className="size-4 text-muted-foreground" />
                <Label htmlFor="pref-temperature" className="cursor-pointer">
                  Отклонения температуры
                </Label>
              </div>
              <Switch
                id="pref-temperature"
                checked={prefs.temperature}
                onCheckedChange={(v) => handlePrefChange("temperature", v)}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="size-4 text-muted-foreground" />
                <Label htmlFor="pref-deviations" className="cursor-pointer">
                  Отклонения в журналах
                </Label>
              </div>
              <Switch
                id="pref-deviations"
                checked={prefs.deviations}
                onCheckedChange={(v) => handlePrefChange("deviations", v)}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ClipboardList className="size-4 text-muted-foreground" />
                <Label htmlFor="pref-compliance" className="cursor-pointer">
                  Незаполненные журналы
                </Label>
              </div>
              <Switch
                id="pref-compliance"
                checked={prefs.compliance}
                onCheckedChange={(v) => handlePrefChange("compliance", v)}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">О системе уведомлений</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              Уведомления отправляются при отклонении температуры от допустимых
              значений оборудования.
            </li>
            <li>
              Уведомления о бракераже, гигиене, ККТ и других отклонениях.
            </li>
            <li>
              Ежедневное напоминание о незаполненных обязательных журналах.
            </li>
            <li>
              Уведомления получают владельцы и технологи организации.
            </li>
            <li>
              Для отвязки в Telegram отправьте боту команду /stop.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
