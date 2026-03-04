import { requireAuth } from "@/lib/auth-helpers";
import { generateLinkToken } from "@/lib/telegram";
import { NotificationSettings } from "@/components/settings/notification-settings";

export default async function NotificationsSettingsPage() {
  const session = await requireAuth();

  const botUsername = process.env.TELEGRAM_BOT_USERNAME || "";
  const linkToken = generateLinkToken(session.user.id);

  return (
    <NotificationSettings botUsername={botUsername} linkToken={linkToken} />
  );
}
