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
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${TELEGRAM_WIDGET_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => setWidgetReady(true));
      return;
    }
    const script = document.createElement("script");
    script.src = TELEGRAM_WIDGET_SRC;
    script.async = true;
    script.onload = () => setWidgetReady(true);
    document.head.appendChild(script);
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
        <p className="text-sm text-muted-foreground">
          Бот не настроен на этом сервере.
        </p>
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
          <Button onClick={connect} disabled={busy || !widgetReady}>
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" /> Привязать Telegram
              </>
            )}
          </Button>
        </div>
      )}
    </section>
  );
}
