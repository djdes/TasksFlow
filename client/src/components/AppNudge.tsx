import { useEffect, useState, type ReactNode } from "react";
import { Bell, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { promptInstall, useInstallState } from "@/lib/pwa";
import { usePushState } from "@/lib/push";

const FIRST_SEEN_KEY = "tf_first_seen";
const DISMISS_KEY = "tf_app_nudge_dismissed";
const DAY = 86_400_000;
const QUIET_DAYS = 21;

function readNumber(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? Number(raw) || null : null;
  } catch {
    return null;
  }
}

function Nudge({ icon, title, text, action, onClose }: { icon: ReactNode; title: string; text: string; action: ReactNode; onClose: () => void }) {
  return (
    <div className="app-nudge" role="region" aria-label={title}>
      <span className="app-nudge-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="app-nudge-title">{title}</p>
        <p className="app-nudge-text">{text}</p>
      </div>
      {action}
      <button type="button" className="app-nudge-close" onClick={onClose} aria-label="Скрыть подсказку">
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function PushNudge({ onClose }: { onClose: () => void }) {
  const push = usePushState();
  if (push.status !== "off") return null;
  return (
    <Nudge
      icon={<Bell className="w-5 h-5" />}
      title="Включите уведомления"
      text="Утром — сводка задач на день, днём — напоминания и новые задачи."
      action={
        <Button type="button" size="sm" onClick={push.enable} disabled={push.busy}>
          Включить
        </Button>
      }
      onClose={onClose}
    />
  );
}

/**
 * Одна ненавязчивая подсказка на главной: на телефоне в браузере —
 * поставить приложение, в приложении — включить уведомления. Установку
 * предлагаем не в первый день работы; уведомления в установленном
 * приложении (PWA на рабочем столе) — сразу: ради них и ставили, а без них
 * не придут утренняя сводка и напоминания. После «×» — тишина три недели.
 */
export function AppNudge() {
  const install = useInstallState();
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const now = Date.now();
    const first = readNumber(FIRST_SEEN_KEY);
    const dismissed = readNumber(DISMISS_KEY);
    const quiet = dismissed !== null && now - dismissed < QUIET_DAYS * DAY;
    if (!first) {
      try {
        localStorage.setItem(FIRST_SEEN_KEY, String(now));
      } catch {
        // без localStorage подсказку не показываем вовсе
        return;
      }
      if (install.installed) setHidden(quiet);
      return;
    }
    setHidden(quiet || (!install.installed && now - first < DAY));
  }, [install.installed]);

  if (hidden) return null;
  const close = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ничего
    }
  };

  if (install.installed) return <PushNudge onClose={close} />;
  if (install.platform === "desktop") return null;
  return (
    <Nudge
      icon={<Smartphone className="w-5 h-5" />}
      title="Установите приложение"
      text="Задачи — в одно касание с экрана телефона."
      action={
        install.canPrompt ? (
          <Button type="button" size="sm" onClick={() => void promptInstall()}>
            Установить
          </Button>
        ) : (
          <Button asChild size="sm">
            <a href="/app">Как?</a>
          </Button>
        )
      }
      onClose={close}
    />
  );
}
