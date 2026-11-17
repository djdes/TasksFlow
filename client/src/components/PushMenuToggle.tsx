import { useState } from "react";
import { BellRing, ChevronDown } from "lucide-react";
import { useLocation } from "wouter";
import { readDeviceInfo, usePushState } from "@/lib/push";

/**
 * «Уведомления на телефоне» в меню: включить — браузер спросит разрешение
 * и телефон подпишется. Нужен рядом со «Звуком при «Готово»»: его путали с
 * уведомлениями, а он разрешения не спрашивает.
 *
 * Включить прямо отсюда нельзя в двух случаях — тогда пункт раскрывает
 * пошаговую подсказку тут же, а не уводит на страницу аккаунта:
 *   • iPhone без иконки на экране «Домой» — Safari push не даёт;
 *   • уведомления запрещены в настройках телефона или браузера.
 */
export function PushMenuToggle({ onNavigate }: { onNavigate?: () => void }) {
  const push = usePushState();
  const [, setLocation] = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  if (push.status === "loading" || push.status === "unsupported" || push.status === "server-off") return null;

  const on = push.status === "on";
  const needsHelp = push.status === "needs-install" || push.status === "denied" || push.status === "ios-update";
  const device = readDeviceInfo();

  return (
    <>
      <button
        type="button"
        role={needsHelp ? undefined : "switch"}
        aria-checked={needsHelp ? undefined : on}
        aria-expanded={needsHelp ? helpOpen : undefined}
        aria-busy={push.busy || undefined}
        className="dropdown-item w-full"
        data-testid="menu-push-toggle"
        onClick={(e) => {
          e.stopPropagation();
          if (needsHelp) {
            setHelpOpen((v) => !v);
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
            <small className="block text-xs text-amber-700 dark:text-amber-300">
              {push.status === "needs-install"
                ? "Открыто в браузере — нужно открыть с иконки"
                : push.status === "ios-update"
                  ? `iOS ${device.iosVersion ?? ""} — нужно обновить iPhone`
                  : "Запрещены в настройках — как разрешить"}
            </small>
          )}
        </span>
        {needsHelp ? (
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${helpOpen ? "rotate-180" : ""}`} aria-hidden />
        ) : (
          <span className="motion-toggle" data-checked={on} aria-hidden="true"><span /></span>
        )}
      </button>

      {needsHelp && helpOpen && (
        <div className="push-menu-help" data-testid="menu-push-help" onClick={(e) => e.stopPropagation()}>
          {push.status === "needs-install" ? (
            <>
              <p className="push-menu-help-note">
                Сейчас TasksFlow открыт <b>в браузере</b>, а не как приложение. Если вы открыли с иконки, но вверху или внизу видна строка с адресом tasksflow.ru — иконка открывает сайт в браузере. Удалите её и добавьте заново:
              </p>
              <ol>
                <li>
                  Откройте tasksflow.ru в <b>Safari</b>, нажмите <b>«Поделиться»</b> — квадрат со стрелкой вверх.
                </li>
                <li>
                  <b>«На экран Домой»</b>. Если есть переключатель <b>«Открыть как веб-приложение»</b> — включите его. Затем «Добавить».
                </li>
                <li>
                  Откройте TasksFlow <b>с новой иконки</b> — адресной строки не будет. Войдите и включите здесь «Уведомления на телефоне» — iPhone спросит разрешение.
                </li>
              </ol>
            </>
          ) : push.status === "ios-update" ? (
            <ol>
              <li>
                На этом iPhone iOS {device.iosVersion ?? "старой версии"}: уведомления от веб-приложений работают с <b>iOS 16.4</b>.
              </li>
              <li>
                Обновите iPhone: <b>Настройки → Основные → Обновление ПО</b>.
              </li>
              <li>Пока не обновили — привяжите Telegram-бота в «Мой аккаунт»: напоминания придут туда.</li>
            </ol>
          ) : device.ios ? (
            <ol>
              <li>
                Откройте <b>Настройки</b> iPhone → <b>Уведомления</b>.
              </li>
              <li>
                Найдите <b>TasksFlow</b> и включите «Допуск уведомлений».
              </li>
              <li>Вернитесь сюда и включите «Уведомления на телефоне».</li>
            </ol>
          ) : (
            <ol>
              <li>
                Нажмите на <b>значок слева от адреса</b> tasksflow.ru (замок или настройки).
              </li>
              <li>
                <b>Уведомления</b> → «Разрешить». В приложении TasksFlow: Настройки телефона → Приложения → TasksFlow → Уведомления.
              </li>
              <li>Вернитесь сюда и включите «Уведомления на телефоне».</li>
            </ol>
          )}
          <p className="push-menu-help-tech" data-testid="menu-push-tech">
            Для поддержки: {device.ios ? `iPhone, iOS ${device.iosVersion ?? "?"}` : "не iPhone"} · {device.standalone ? "с иконки" : "в браузере"}
            {device.otherIosBrowser ? " (не Safari)" : ""} · уведомления в браузере: {device.webPush ? "есть" : "нет"}
          </p>
          <button
            type="button"
            className="push-menu-help-link"
            onClick={() => {
              onNavigate?.();
              setLocation("/account#app");
            }}
          >
            Подробнее в «Мой аккаунт»
          </button>
        </div>
      )}

      {push.error && (
        <p className="px-4 pb-2 text-xs text-destructive" role="alert">
          {push.error}
        </p>
      )}
    </>
  );
}
