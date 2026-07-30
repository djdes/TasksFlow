import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Unlink } from "lucide-react";

/**
 * Привязка Telegram-аккаунта на странице «Аккаунт».
 *
 * Используется popup-флоу (`Telegram.Login.auth`), а не встраиваемый
 * iframe-виджет: iframe не стилизуется под тему и молча ничего не делает,
 * если домен не прописан в BotFather — пользователь видит мёртвую кнопку
 * без единого сообщения об ошибке.
 *
 * ВАЖНО: привязка работает только на домене из `/setdomain` в BotFather и
 * только по https. На localhost Telegram откажет — это ограничение их
 * стороны, а не бага здесь.
 */

const TELEGRAM_WIDGET_SRC = "https://telegram.org/js/telegram-widget.js?22";

type TelegramLoginPayload = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

declare global {
  interface Window {
    Telegram?: {
      Login?: {
        auth: (
          options: { bot_id: string; request_access?: string; lang?: string },
          callback: (user: TelegramLoginPayload | false) => void,
        ) => void;
      };
    };
  }
}

type TelegramStatus = {
  connected: boolean;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  tgStarted: boolean;
  botConfigured: boolean;
  botId: string | null;
  botUsername: string | null;
  botDeepLink: string | null;
};

export function TelegramSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [widgetReady, setWidgetReady] = useState(false);

  const { data: status, isLoading } = useQuery<TelegramStatus>({
    queryKey: ["me", "telegram"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/me/telegram");
      return (await res.json()) as TelegramStatus;
    },
  });

  // Скрипт подгружаем только когда он реально нужен: бот настроен и
  // аккаунт ещё не привязан.
  const needWidget = Boolean(status?.botConfigured && status?.botId && !status?.connected);
  useEffect(() => {
    if (!needWidget) return;
    if (window.Telegram?.Login) {
      setWidgetReady(true);
      return;
    }

    let cancelled = false;
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${TELEGRAM_WIDGET_SRC}"]`,
    );
    if (!existing) {
      const script = document.createElement("script");
      script.src = TELEGRAM_WIDGET_SRC;
      script.async = true;
      document.head.appendChild(script);
    }

    // Опрашиваем, а не слушаем 'load': на уже загруженном теге (SPA,
    // повторный вход на страницу) событие давно прошло, и слушатель не
    // сработает никогда — кнопка оставалась заблокированной навсегда.
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (cancelled) return;
      if (window.Telegram?.Login) {
        setWidgetReady(true);
        window.clearInterval(timer);
      } else if (Date.now() - started > 8000) {
        // telegram.org недоступен — виджета не будет, но привязка через
        // бота работает и без него.
        window.clearInterval(timer);
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [needWidget]);

  const connect = useCallback(() => {
    const auth = window.Telegram?.Login?.auth;
    if (!auth || !status?.botId) return;

    auth({ bot_id: status.botId, request_access: "write" }, (payload) => {
      if (!payload) return;
      void (async () => {
        setBusy(true);
        try {
          const res = await apiRequest("POST", "/api/me/telegram/connect", payload);
          const body = (await res.json()) as { botDeepLink?: string | null };
          await queryClient.invalidateQueries({ queryKey: ["me", "telegram"] });
          toast({ title: "Telegram привязан" });
          // Бот не может написать первым, пока пользователь не нажал Start.
          // Открываем сразу здесь — это ещё контекст клика, попап не блокируется.
          if (body?.botDeepLink) {
            window.open(body.botDeepLink, "_blank", "noopener");
          }
        } catch (err) {
          toast({
            title: "Не удалось привязать Telegram",
            description: err instanceof ApiError ? err.message : "Ошибка",
            variant: "destructive",
          });
        } finally {
          setBusy(false);
        }
      })();
    });
  }, [status?.botId, queryClient, toast]);

  /**
   * Привязка через бота — основной путь.
   *
   * Не зависит ни от /setdomain в BotFather, ни от доступности
   * telegram.org в браузере, ни от попапов. Сайт выдаёт одноразовый код,
   * ссылка открывает бота, бот связывает аккаунт.
   */
  const connectViaBot = async () => {
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/me/telegram/link-code");
      const { url } = (await res.json()) as { url: string };
      // Открываем в контексте клика — иначе браузер заблокирует.
      window.open(url, "_blank", "noopener");
      toast({
        title: "Открываю бота",
        description: "Нажми Start в Telegram — аккаунт привяжется сам.",
      });
      // Пользователь уйдёт в Telegram и вернётся: обновим статус, чтобы
      // секция сама переключилась на «привязан».
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["me", "telegram"] });
      }, 5000);
    } catch (err) {
      toast({
        title: "Не удалось создать ссылку",
        description: err instanceof ApiError ? err.message : "Ошибка",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await apiRequest("DELETE", "/api/me/telegram");
      await queryClient.invalidateQueries({ queryKey: ["me", "telegram"] });
      toast({ title: "Telegram отвязан" });
    } catch (err) {
      toast({
        title: "Не удалось отвязать",
        description: err instanceof ApiError ? err.message : "Ошибка",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 mb-5">
      <div className="flex items-center gap-2 mb-4">
        <Send className="w-5 h-5 text-primary" />
        <h2 className="font-semibold">Telegram</h2>
      </div>

      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : !status?.botConfigured ? (
        // Токена бота нет в окружении сервера. Раньше здесь была одна
        // строка «бот не настроен» — админ видел тупик и не понимал,
        // что именно сделать, чтобы кнопка появилась.
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Бот не подключён на этом сервере — привязывать пока нечего.
          </p>
          <p className="text-sm text-muted-foreground">
            Чтобы кнопка появилась, добавьте в <code>.env</code> сервера{" "}
            <code className="px-1 rounded bg-muted">TASKSFLOW_BOT_TOKEN</code> и{" "}
            <code className="px-1 rounded bg-muted">TELEGRAM_BOT_USERNAME</code>,
            перезапустите приложение, а в BotFather выполните{" "}
            <code className="px-1 rounded bg-muted">/setdomain</code> на домен сайта —
            без него Telegram не пустит привязку.
          </p>
        </div>
      ) : status.connected ? (
        <div className="space-y-3">
          <p className="text-sm">
            Привязан:{" "}
            <span className="font-medium">
              {status.telegramUsername
                ? `@${status.telegramUsername}`
                : status.telegramFirstName || "аккаунт Telegram"}
            </span>
          </p>
          {!status.tgStarted && status.botDeepLink && (
            <p className="text-sm text-muted-foreground">
              Осталось нажать «Start» в боте —{" "}
              <a
                href={status.botDeepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                открыть бота
              </a>
              . Без этого он не сможет написать первым.
            </p>
          )}
          <Button variant="outline" onClick={disconnect} disabled={busy}>
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Unlink className="w-4 h-4 mr-2" /> Отвязать
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Ставь задачи и закрывай их фотографией прямо из Telegram.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {/* Основная кнопка: работает всегда, без зависимости от
                telegram.org в браузере и /setdomain у бота. */}
            <Button onClick={connectViaBot} disabled={busy}>
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" /> Привязать Telegram
                </>
              )}
            </Button>
            {/* Виджет — только если он реально загрузился. Раньше кнопка
                просто висела заблокированной, если скрипт не пришёл. */}
            {widgetReady && (
              <Button variant="outline" onClick={connect} disabled={busy}>
                Войти через Telegram
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Откроется бот {status.botUsername ? `@${status.botUsername}` : ""} — нажми
            в нём «Start», и аккаунт свяжется. Ссылка живёт 10 минут.
          </p>
        </div>
      )}
    </section>
  );
}
