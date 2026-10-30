import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { DEFAULT_PREFS, NOTIFY_PREF_KEYS, NOTIFY_PREF_TEXT, type NotifyPrefKey, type NotifyPrefs } from "@shared/notify";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/use-permissions";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * «Уведомления» в «Моём аккаунте»: что присылать в push (приложение, PWA,
 * браузер) и Telegram, и нужны ли письма о новых задачах. Есть у каждого;
 * пункты про проверку и итоги дня — тем, кто проверяет и руководит.
 *
 * Переключатель сохраняется сразу. Запросы идут по одному: быстрые щелчки
 * не обгоняют друг друга, на сервер уходит последнее состояние, а при
 * ошибке форма возвращается к тому, что сервер точно сохранил.
 */
export function NotifyPrefsCard() {
  const { user } = useAuth();
  const { isAdmin, isManager } = usePermissions();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotifyPrefs>(user?.notify ?? DEFAULT_PREFS);
  const latest = useRef(prefs);
  const confirmed = useRef<NotifyPrefs>(user?.notify ?? DEFAULT_PREFS);
  const inFlight = useRef(false);

  useEffect(() => {
    if (user?.notify && !inFlight.current) {
      confirmed.current = user.notify;
      latest.current = user.notify;
      setPrefs(user.notify);
    }
  }, [user?.notify]);

  const flush = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      // Пока сохраняли, могли щёлкнуть ещё — досылаем последнее состояние.
      while (JSON.stringify(latest.current) !== JSON.stringify(confirmed.current)) {
        const sending = latest.current;
        const res = await apiRequest("PUT", "/api/account/notify-prefs", sending);
        const { notify } = (await res.json()) as { notify: NotifyPrefs };
        confirmed.current = notify;
      }
      const saved = confirmed.current;
      queryClient.setQueryData(["auth", "me"], (old: unknown) => (old && typeof old === "object" ? { ...old, notify: saved } : old));
    } catch (err) {
      latest.current = confirmed.current;
      setPrefs(confirmed.current);
      toast({ title: "Не сохранилось", description: err instanceof Error ? err.message : "Нет связи с сервером", variant: "destructive" });
    } finally {
      inFlight.current = false;
    }
  };

  const toggle = (key: NotifyPrefKey, on: boolean) => {
    const next = { ...latest.current, [key]: on };
    latest.current = next;
    setPrefs(next);
    void flush();
  };

  const managers = isAdmin || isManager;
  const keys = NOTIFY_PREF_KEYS.filter((key) => managers || !NOTIFY_PREF_TEXT[key].managersOnly);
  const email = user?.email ?? null;

  return (
    <section className="content-panel account-section" aria-labelledby="notify-prefs-title" id="notifications">
      <div className="section-title">
        <BellRing className="w-5 h-5 text-primary" aria-hidden="true" />
        <h2 id="notify-prefs-title">Уведомления</h2>
      </div>
      <p className="text-sm text-muted-foreground -mt-1 mb-3">
        Приходят на устройства с включёнными уведомлениями и в Telegram, если он привязан.
      </p>
      <div className="schedule-slots notify-prefs">
        {keys.map((key) => {
          const id = `notify-pref-${key}`;
          const text = NOTIFY_PREF_TEXT[key];
          const hint =
            key === "emailNewTask"
              ? email
                ? `На ${email}`
                : "Укажите email в блоке ниже — без него писем не будет"
              : text.hint;
          return (
            <div key={key} className="schedule-slot" data-off={!prefs[key] || undefined}>
              <input
                id={id}
                type="checkbox"
                className="schedule-check"
                checked={prefs[key]}
                onChange={(e) => toggle(key, e.target.checked)}
              />
              <label htmlFor={id} className="schedule-slot-text">
                <span>{text.title}</span>
                <small>{hint}</small>
              </label>
            </div>
          );
        })}
      </div>
    </section>
  );
}
