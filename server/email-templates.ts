/**
 * HTML-шаблоны писем авторизации (welcome / login-link / recovery).
 *
 * Table-based вёрстка — почтовики (Gmail, Outlook, mail.ru) плохо
 * дружат с fl‍ex/grid. Брендовый indigo #5566f6 как в приложении.
 * Тексты на русском. Пароль показываем только в welcome/recovery.
 */

export type EmailKind = "welcome" | "login-link" | "recovery";

export interface EmailData {
  email: string;
  /** Только для welcome/recovery. */
  password?: string;
  /** Одноразовая ссылка «Открыть кабинет». */
  magicUrl: string;
}

const BRAND = "#5566f6";
const INK = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";

function button(url: string, label: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr><td align="center" bgcolor="${BRAND}" style="border-radius:12px;">
        <a href="${url}" target="_blank"
           style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;font-family:Arial,Helvetica,sans-serif;">
          ${label}
        </a>
      </td></tr>
    </table>`;
}

function credentialsBox(email: string, password?: string): string {
  const pwRow = password
    ? `<tr>
         <td style="padding:6px 0;color:${MUTED};font-size:13px;">Пароль</td>
         <td style="padding:6px 0;text-align:right;font-family:'Courier New',monospace;font-size:15px;color:${INK};font-weight:700;">${password}</td>
       </tr>`
    : "";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
           style="background:#f8fafc;border:1px solid ${BORDER};border-radius:12px;padding:16px 18px;margin:8px 0 4px;">
      <tr>
        <td style="padding:6px 0;color:${MUTED};font-size:13px;">Логин</td>
        <td style="padding:6px 0;text-align:right;font-size:15px;color:${INK};font-weight:600;">${email}</td>
      </tr>
      ${pwRow}
    </table>`;
}

function layout(inner: string): string {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:480px;background:#ffffff;border-radius:16px;padding:32px;font-family:Arial,Helvetica,sans-serif;">
        <tr><td>
          <div style="font-size:20px;font-weight:800;color:${INK};margin-bottom:24px;">
            Tasks<span style="color:${BRAND};">Flow</span>
          </div>
          ${inner}
          <hr style="border:none;border-top:1px solid ${BORDER};margin:28px 0 16px;">
          <p style="color:${MUTED};font-size:12px;line-height:1.5;margin:0;">
            Если вы не запрашивали это письмо — просто проигнорируйте его.<br>
            TasksFlow — постановка и контроль задач для выездных команд.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Возвращает { subject, html } для письма указанного типа. */
export function renderEmail(kind: EmailKind, data: EmailData): { subject: string; html: string } {
  const heading = (t: string) => `<h1 style="font-size:22px;color:${INK};margin:0 0 12px;">${t}</h1>`;
  const para = (t: string) => `<p style="font-size:15px;color:${INK};line-height:1.55;margin:0 0 8px;">${t}</p>`;

  switch (kind) {
    case "welcome":
      return {
        subject: "Добро пожаловать в TasksFlow — ваш доступ",
        html: layout(
          heading("Аккаунт создан 🎉") +
            para("Вы уже вошли в кабинет — на почту идти не обязательно. Это письмо на случай, если захотите войти с другого устройства.") +
            credentialsBox(data.email, data.password) +
            button(data.magicUrl, "Открыть кабинет →") +
            para(`<span style="color:${MUTED};font-size:13px;">Пароль можно сменить в кабинете → «Аккаунт».</span>`),
        ),
      };
    case "login-link":
      return {
        subject: "Вход в TasksFlow",
        html: layout(
          heading("Вход в кабинет") +
            para(`Нажмите кнопку ниже, чтобы войти под ${data.email} без ввода пароля.`) +
            button(data.magicUrl, "Открыть кабинет →") +
            para(`<span style="color:${MUTED};font-size:13px;">Ссылка действует 7 дней и работает один раз.</span>`),
        ),
      };
    case "recovery":
      return {
        subject: "Новый пароль для TasksFlow",
        html: layout(
          heading("Новый пароль") +
            para("Вы запросили сброс пароля. Вот новые данные для входа:") +
            credentialsBox(data.email, data.password) +
            button(data.magicUrl, "Открыть кабинет →") +
            para(`<span style="color:${MUTED};font-size:13px;">Войти можно по кнопке выше или этим паролем. Смените его в «Аккаунте».</span>`),
        ),
      };
  }
}
