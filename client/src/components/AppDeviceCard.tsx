import { useState } from "react";
import { Bell, Download, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { formatMegabytes, useAppInfo } from "@/hooks/use-app-info";
import { promptInstall, useInstallState } from "@/lib/pwa";
import { sendTestPush, usePushState, type PushStatus } from "@/lib/push";

const PUSH_TEXT: Record<PushStatus, string> = {
  loading: "Проверяем…",
  on: "Включены на этом устройстве: новые задачи, возвраты и напоминания.",
  off: "Новые задачи, возвраты на доработку и напоминания — сразу на экран.",
  denied: "Запрещены в настройках браузера или телефона — разрешите их для tasksflow.ru.",
  "needs-install": "На iPhone уведомления приходят после установки на экран «Домой».",
  "server-off": "На сервере уведомления ещё не включены.",
  unsupported: "Этот браузер не умеет показывать уведомления.",
};

/**
 * «Приложение и уведомления» в аккаунте: установка на это устройство и
 * push на нём. Коротко: одна строка состояния и одна-две кнопки на пункт.
 */
export function AppDeviceCard() {
  const install = useInstallState();
  const push = usePushState();
  const { data: info } = useAppInfo();
  const { toast } = useToast();
  const [testing, setTesting] = useState(false);

  const apk = info?.android.apk ?? null;
  const store = install.platform === "ios" ? info?.ios.appStoreUrl : info?.android.playUrl ?? info?.android.rustoreUrl;

  const test = async () => {
    setTesting(true);
    try {
      const { sent } = await sendTestPush();
      toast({ title: sent > 0 ? "Отправили — уведомление сейчас придёт" : "Это устройство не получило уведомление — выключите и включите снова" });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Не получилось", variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="content-panel account-section" aria-labelledby="app-device-title" id="app">
      <div className="section-title">
        <Smartphone className="w-5 h-5 text-primary" aria-hidden="true" />
        <h2 id="app-device-title">Приложение и уведомления</h2>
      </div>

      <div className="app-device-rows">
        <div className="app-device-row">
          <div className="min-w-0">
            <p className="app-device-label">Приложение</p>
            <p className="app-device-text">
              {install.shell
                ? "Вы в приложении TasksFlow."
                : install.installed
                  ? "Установлено на этом устройстве."
                  : install.platform === "ios"
                    ? <>Safari: <Share className="inline w-4 h-4 -mt-1" aria-label="Поделиться" /> → «На экран Домой».</>
                    : install.platform === "android"
                      ? "Иконка на экране, без адресной строки, уведомления."
                      : "Можно поставить на компьютер, а на телефоне открыть tasksflow.ru/app."}
            </p>
          </div>
          {!install.installed && (
            <div className="app-device-actions">
              {install.canPrompt ? (
                <Button type="button" onClick={() => void promptInstall()}>
                  Установить
                </Button>
              ) : store ? (
                <Button asChild>
                  <a href={store} target="_blank" rel="noopener">
                    {install.platform === "ios" ? "App Store" : "Google Play"}
                  </a>
                </Button>
              ) : null}
              {install.platform === "android" && apk && (
                <Button asChild variant="outline">
                  <a href={apk.url} download>
                    <Download className="w-4 h-4" aria-hidden="true" />
                    APK · {formatMegabytes(apk.size)}
                  </a>
                </Button>
              )}
              {!install.canPrompt && install.platform !== "android" && (
                <Button asChild variant="outline">
                  <a href="/app">Как установить</a>
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="app-device-row">
          <div className="min-w-0">
            <p className="app-device-label">
              <Bell className="inline w-4 h-4 -mt-0.5 mr-1" aria-hidden="true" />
              Уведомления
            </p>
            <p className="app-device-text" aria-live="polite">
              {push.error ?? PUSH_TEXT[push.status]}
            </p>
          </div>
          <div className="app-device-actions">
            {push.status === "off" && (
              <Button type="button" onClick={push.enable} disabled={push.busy}>
                {push.busy ? "Включаем…" : "Включить"}
              </Button>
            )}
            {push.status === "on" && (
              <>
                <Button type="button" variant="outline" onClick={test} disabled={testing}>
                  {testing ? "Отправляем…" : "Проверить"}
                </Button>
                <Button type="button" variant="ghost" onClick={push.disable} disabled={push.busy}>
                  Выключить
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
