import { BellRing } from "lucide-react";
import { useLocation } from "wouter";
import { usePushState } from "@/lib/push";

/**
 * «Уведомления на этом телефоне» в меню: включить — браузер спросит
 * разрешение и телефон подпишется. Нужен рядом со «Звуком при «Готово»»:
 * его путали с уведомлениями, а он разрешения не спрашивает.
 * iPhone без иконки на экране «Домой» и запрет в настройках — ведём в
 * «Мой аккаунт» → «Уведомления», там пошаговая подсказка.
 */
export function PushMenuToggle({ onNavigate }: { onNavigate?: () => void }) {
  const push = usePushState();
  const [, setLocation] = useLocation();
  if (push.status === "loading" || push.status === "unsupported" || push.status === "server-off") return null;

  const on = push.status === "on";
  const needsHelp = push.status === "needs-install" || push.status === "denied";
  return (
    <>
      <button
        type="button"
        role={needsHelp ? undefined : "switch"}
        aria-checked={needsHelp ? undefined : on}
        aria-busy={push.busy || undefined}
        className="dropdown-item w-full"
        data-testid="menu-push-toggle"
        onClick={(e) => {
          e.stopPropagation();
          if (needsHelp) {
            onNavigate?.();
            setLocation("/account#notifications");
            return;
          }
          if (push.busy) return;
          void (on ? push.disable() : push.enable());
        }}
      >
        <BellRing className="w-5 h-5 text-primary" />
        <span className="flex-1 text-left">
          <span className="font-medium block">Уведомления на телефоне</span>
          {needsHelp && (
            <small className="block text-xs text-muted-foreground">
              {push.status === "needs-install" ? "Сначала добавьте TasksFlow на экран «Домой»" : "Запрещены в настройках телефона — как включить"}
            </small>
          )}
        </span>
        {!needsHelp && <span className="motion-toggle" data-checked={on} aria-hidden="true"><span /></span>}
      </button>
      {push.error && (
        <p className="px-4 pb-2 text-xs text-destructive" role="alert">
          {push.error}
        </p>
      )}
    </>
  );
}
