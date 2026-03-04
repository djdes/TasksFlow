import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "localhost",
  port: Number(process.env.SMTP_PORT) || 25,
  secure: false,
  tls: { rejectUnauthorized: false },
});

const FROM = process.env.SMTP_FROM || "HACCP-Online <noreply@haccp.magday.ru>";
const APP_URL = process.env.NEXTAUTH_URL || "https://haccp.magday.ru";

function layout(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
<tr><td align="center">
<table width="100%" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
  <tr><td style="background:#18181b;padding:24px 32px">
    <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">HACCP-Online</h1>
  </td></tr>
  <tr><td style="padding:32px">
    <h2 style="margin:0 0 16px;font-size:18px;color:#18181b">${title}</h2>
    ${body}
  </td></tr>
  <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #e4e4e7">
    <p style="margin:0;font-size:12px;color:#a1a1aa;text-align:center">&copy; 2026 HACCP-Online. Электронные журналы ХАССП.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
  } catch (error) {
    console.error("Email send error:", error);
  }
}

export async function sendInviteEmail(params: {
  to: string;
  name: string;
  password: string;
  organizationName: string;
}) {
  const { to, name, password, organizationName } = params;
  const subject = `Вас пригласили в ${organizationName} — HACCP-Online`;

  const body = `
    <p style="margin:0 0 16px;color:#3f3f46;line-height:1.6">Здравствуйте, <strong>${name}</strong>!</p>
    <p style="margin:0 0 16px;color:#3f3f46;line-height:1.6">Вас пригласили в организацию <strong>${organizationName}</strong> для ведения электронных журналов ХАССП.</p>
    <div style="background:#f4f4f5;border-radius:8px;padding:20px;margin:0 0 24px">
      <p style="margin:0 0 8px;font-size:13px;color:#71717a">Ваши данные для входа:</p>
      <p style="margin:0 0 4px;color:#18181b"><strong>Email:</strong> ${to}</p>
      <p style="margin:0;color:#18181b"><strong>Пароль:</strong> ${password}</p>
    </div>
    <a href="${APP_URL}/login" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Войти в систему</a>
    <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa">Рекомендуем сменить пароль после первого входа.</p>`;

  await sendEmail(to, subject, layout("Приглашение в систему", body));
}

export async function sendWelcomeEmail(params: {
  to: string;
  name: string;
  organizationName: string;
}) {
  const { to, name, organizationName } = params;
  const subject = "Добро пожаловать в HACCP-Online!";

  const body = `
    <p style="margin:0 0 16px;color:#3f3f46;line-height:1.6">Здравствуйте, <strong>${name}</strong>!</p>
    <p style="margin:0 0 16px;color:#3f3f46;line-height:1.6">Организация <strong>${organizationName}</strong> успешно зарегистрирована. Ваш пробный период — <strong>14 дней</strong> с полным доступом ко всем функциям.</p>
    <div style="background:#f4f4f5;border-radius:8px;padding:20px;margin:0 0 24px">
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#18181b">С чего начать:</p>
      <p style="margin:0 0 8px;color:#3f3f46;font-size:14px">1. Добавьте производственные зоны в <strong>Настройки → Зоны</strong></p>
      <p style="margin:0 0 8px;color:#3f3f46;font-size:14px">2. Добавьте оборудование в <strong>Настройки → Оборудование</strong></p>
      <p style="margin:0 0 8px;color:#3f3f46;font-size:14px">3. Заполните первый журнал в разделе <strong>Журналы</strong></p>
      <p style="margin:0;color:#3f3f46;font-size:14px">4. Пригласите сотрудников в <strong>Настройки → Сотрудники</strong></p>
    </div>
    <a href="${APP_URL}/dashboard" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Перейти в панель</a>`;

  await sendEmail(to, subject, layout("Добро пожаловать!", body));
}

export async function sendDeviationAlertEmail(params: {
  to: string;
  journalName: string;
  journalCode: string;
  deviationType: string;
  details: string;
  filledBy: string;
}) {
  const { to, journalName, journalCode, deviationType, details, filledBy } = params;
  const subject = `⚠ ${deviationType} — ${journalName}`;

  const body = `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;margin:0 0 24px">
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#dc2626">${deviationType}</p>
      <p style="margin:0;color:#7f1d1d;font-size:14px;line-height:1.6">${details}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#71717a;font-size:13px;width:140px">Журнал</td><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#18181b;font-weight:600">${journalName}</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#71717a;font-size:13px">Записал</td><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#18181b">${filledBy}</td></tr>
      <tr><td style="padding:8px 0;color:#71717a;font-size:13px">Время</td><td style="padding:8px 0;color:#18181b">${new Date().toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })}</td></tr>
    </table>
    <a href="${APP_URL}/journals/${journalCode}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Открыть журнал</a>`;

  await sendEmail(to, subject, layout("Отклонение зафиксировано", body));
}

export async function sendComplianceReminderEmail(params: {
  to: string;
  missingJournals: string[];
  organizationName: string;
}) {
  const { to, missingJournals, organizationName } = params;
  const subject = `📋 Незаполненные журналы — ${organizationName}`;

  const listHtml = missingJournals
    .map((j) => `<li style="margin:0 0 4px;color:#18181b;font-size:14px">${j}</li>`)
    .join("");

  const body = `
    <p style="margin:0 0 16px;color:#3f3f46;line-height:1.6">Следующие обязательные журналы не были заполнены сегодня:</p>
    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:20px;margin:0 0 24px">
      <ul style="margin:0;padding:0 0 0 20px">${listHtml}</ul>
    </div>
    <a href="${APP_URL}/journals" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Заполнить журналы</a>`;

  await sendEmail(to, subject, layout("Напоминание о журналах", body));
}

export async function sendTemperatureAlertEmail(params: {
  to: string;
  equipmentName: string;
  temperature: number;
  tempMin: number | null;
  tempMax: number | null;
  areaName?: string;
  filledBy: string;
}) {
  const { to, equipmentName, temperature, tempMin, tempMax, areaName, filledBy } = params;
  const subject = `⚠ Нарушение температуры: ${equipmentName}`;

  const limitsText = tempMin != null && tempMax != null
    ? `${tempMin}°C — ${tempMax}°C`
    : tempMin != null ? `от ${tempMin}°C` : `до ${tempMax}°C`;

  const body = `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;margin:0 0 24px">
      <p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#dc2626">Температура вне нормы!</p>
      <p style="margin:0;color:#7f1d1d;font-size:14px;line-height:1.6">Зафиксировано отклонение температуры. Требуется корректирующее действие.</p>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
      <tr><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#71717a;font-size:13px;width:140px">Оборудование</td><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#18181b;font-weight:600">${equipmentName}</td></tr>
      ${areaName ? `<tr><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#71717a;font-size:13px">Зона</td><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#18181b">${areaName}</td></tr>` : ""}
      <tr><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#71717a;font-size:13px">Факт. температура</td><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#dc2626;font-weight:700;font-size:18px">${temperature}°C</td></tr>
      <tr><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#71717a;font-size:13px">Допустимый диапазон</td><td style="padding:8px 0;border-bottom:1px solid #e4e4e7;color:#18181b">${limitsText}</td></tr>
      <tr><td style="padding:8px 0;color:#71717a;font-size:13px">Записал</td><td style="padding:8px 0;color:#18181b">${filledBy}</td></tr>
    </table>
    <a href="${APP_URL}/journals/temp_control" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">Открыть журнал</a>`;

  await sendEmail(to, subject, layout("Температурный алерт", body));
}
