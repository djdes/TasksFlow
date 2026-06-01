/**
 * Отправка писем авторизации СТРОГО через PHP.
 *
 * Транспорт — реле `send.php` в веб-корне домена (паттерн как у
 * ordersflow на FastPanel): Node POST-ит сюда JSON {to,subject,html}
 * с заголовком X-Relay-Token, PHP отдаёт письмо в локальный MTA через
 * native mail(). Никакого SMTP, никакого внешнего сервиса, ничего
 * настраивать кроме токена.
 *
 * Цепочка выбора транспорта:
 *   - есть PHP_RELAY_URL + PHP_RELAY_TOKEN → "php-relay"
 *   - иначе → "dev" (пишем письмо в .dev-outbox/*.html, чтобы локально
 *     видеть результат и ничего не отправлять)
 *
 * Это отдельный модуль от server/mail.ts (тот шлёт SMTP-уведомления о
 * выполненных задачах — другая фича, его не трогаем).
 */
import { promises as fs } from "fs";
import path from "path";
import { renderEmail, type EmailKind, type EmailData } from "./email-templates";

export type MailTransport = "php-relay" | "dev";

export function resolveTransport(): MailTransport {
  const url = process.env.PHP_RELAY_URL?.trim();
  const token = process.env.PHP_RELAY_TOKEN?.trim();
  if (url && token) return "php-relay";
  return "dev";
}

const DEV_OUTBOX = () => process.env.MAIL_DEV_OUTBOX?.trim() || ".dev-outbox";

async function sendDev(to: string, subject: string, html: string): Promise<void> {
  const dir = DEV_OUTBOX();
  await fs.mkdir(dir, { recursive: true });
  const safe = to.replace(/[^a-z0-9@._-]/gi, "_");
  const file = path.join(dir, `${Date.now()}-${safe}.html`);
  await fs.writeFile(file, `<!-- to:${to} subject:${subject} -->\n${html}`, "utf8");
  console.log(`[mailer] DEV: письмо записано в ${file} (subject: ${subject})`);
}

async function sendViaPhpRelay(to: string, subject: string, html: string): Promise<void> {
  const url = process.env.PHP_RELAY_URL!.trim();
  const token = process.env.PHP_RELAY_TOKEN!.trim();
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Relay-Token": token,
    },
    body: JSON.stringify({ to, subject, html }),
  });
  if (!r.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await r.json());
    } catch {
      /* ignore */
    }
    throw new Error(`PHP relay вернул ${r.status} ${detail}`);
  }
}

export interface SendMailArgs {
  to: string;
  kind: EmailKind;
  data: EmailData;
}

/** Рендерит письмо и отправляет выбранным транспортом. Бросает при ошибке доставки. */
export async function sendMail({ to, kind, data }: SendMailArgs): Promise<void> {
  const { subject, html } = renderEmail(kind, data);
  const transport = resolveTransport();
  if (transport === "php-relay") {
    await sendViaPhpRelay(to, subject, html);
  } else {
    await sendDev(to, subject, html);
  }
}
