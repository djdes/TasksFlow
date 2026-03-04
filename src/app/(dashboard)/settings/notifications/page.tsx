import { Bell, ExternalLink, CheckCircle2 } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { generateLinkToken } from "@/lib/telegram";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function NotificationsSettingsPage() {
  const session = await requireAuth();

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { telegramChatId: true },
  });

  const isLinked = !!user?.telegramChatId;
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || "";
  const linkToken = generateLinkToken(session.user.id);
  const botLink = botUsername
    ? `https://t.me/${botUsername}?start=${linkToken}`
    : "";

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
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-green-600" />
              <Badge
                variant="secondary"
                className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
              >
                Telegram привязан
              </Badge>
            </div>
          ) : botLink ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Для получения уведомлений привяжите ваш Telegram-аккаунт.
                Нажмите кнопку ниже и отправьте команду /start боту.
              </p>
              <Button asChild>
                <a
                  href={botLink}
                  target="_blank"
                  rel="noopener noreferrer"
                >
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
              Уведомления получают владельцы и технологи организации.
            </li>
            <li>
              Для отключения уведомлений обратитесь к администратору.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
