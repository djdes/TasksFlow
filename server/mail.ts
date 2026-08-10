import nodemailer from "nodemailer";
import path from "path";
import { resolveUploadAbs } from "./uploads-paths";

// SMTP креды читаем из env. Раньше были hardcoded'ы прямо в коде:
//   user: 'admin@yesbeat.ru', pass: 'vsyc csjb evlz tcrk' (Google App Password).
// Они утекли в git history — необходима ротация App Password в Google
// Account → Security → App passwords + установка нового SMTP_PASS в
// prod env. До тех пор email-уведомления о выполненных задачах могут
// не отправляться — но дыра credentials в открытом коде закрыта.
const SMTP_HOST = process.env.SMTP_HOST?.trim();
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER?.trim();
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM =
  process.env.SMTP_FROM?.trim() ||
  (SMTP_USER ? `"TasksFlow" <${SMTP_USER}>` : `"TasksFlow" <support@tasksflow.ru>`);

// Локальный MTA FastPanel (тот же сценарий, что на wesetup: localhost:25)
// логина не требует — письмо сдаётся exim'у на loopback, а наружу его уже
// подписывает DKIM почтового домена. Раньше транспорт требовал USER+PASS
// и при localhost-конфиге молча не поднимался: SMTP_HOST задан, писем нет.
const isLocalRelay =
  !SMTP_USER &&
  !SMTP_PASS &&
  Boolean(SMTP_HOST) &&
  ["localhost", "127.0.0.1", "::1"].includes(SMTP_HOST!.toLowerCase());

const transporter = !SMTP_HOST
  ? null
  : SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        connectionTimeout: 5000,
        socketTimeout: 5000,
      })
    : isLocalRelay
      ? nodemailer.createTransport({
          host: SMTP_HOST,
          // Дефолт 587 осмысленен только для внешнего SMTP с логином;
          // локальный exim слушает 25.
          port: Number(process.env.SMTP_PORT) || 25,
          secure: false,
          // У локального exim сертификат самоподписанный и на другой hostname —
          // на loopback это не риск, а проверка ломала бы STARTTLS.
          tls: { rejectUnauthorized: false },
          connectionTimeout: 5000,
          socketTimeout: 5000,
        })
      : null;

if (!transporter) {
  console.warn(
    "[mail] SMTP не настроен: нужен либо локальный релей " +
      "(SMTP_HOST=localhost, SMTP_PORT=25), либо SMTP_HOST + SMTP_USER + SMTP_PASS. " +
      "Email-уведомления о выполненных задачах не отправляются."
  );
}

// Email по умолчанию (для старых компаний без email).
const DEFAULT_ADMIN_EMAIL =
  process.env.DEFAULT_ADMIN_EMAIL?.trim() || null;

export async function sendTaskCompletedEmail(
  taskTitle: string,
  workerName: string,
  photoUrls?: string[] | null,
  companyEmail?: string | null,
  comment?: string | null
) {
  if (!transporter || !SMTP_FROM) {
    return; // SMTP не настроен — silent skip.
  }
  try {
    const toEmail = companyEmail || DEFAULT_ADMIN_EMAIL;
    if (!toEmail) {
      console.warn("[mail] No recipient email — skipping notification");
      return;
    }

    let emailText = "";
    if (comment && comment.trim()) {
      emailText = `Комментарий: ${comment.trim()}`;
    }

    const mailOptions: nodemailer.SendMailOptions = {
      from: SMTP_FROM,
      to: toEmail,
      subject: `${taskTitle} - ${workerName}`,
      text: emailText,
    };

    // Path-traversal защита: photoUrls приходит из БД, но если
    // когда-нибудь попадёт injection-вектор (SQL, импорт) — относительный
    // путь '../../etc/passwd' в path.join даст путь в корень сервера.
    // Allowlist: только пути внутри uploads/.
    if (photoUrls && photoUrls.length > 0) {
      const safeAttachments: NonNullable<
        nodemailer.SendMailOptions["attachments"]
      > = [];
      for (let i = 0; i < photoUrls.length; i += 1) {
        const photoUrl = photoUrls[i];
        const abs = resolveUploadAbs(photoUrl);
        if (!abs) {
          console.warn("[mail] refusing attachment outside uploads/:", photoUrl);
          continue;
        }
        safeAttachments.push({
          filename: `photo-${i + 1}${path.extname(photoUrl) || ".jpg"}`,
          path: abs,
        });
      }
      if (safeAttachments.length > 0) {
        mailOptions.attachments = safeAttachments;
      }
    }

    await transporter.sendMail(mailOptions);
    // Operational visibility без PII: email адресата и имя сотрудника
    // в production-логах = privacy-leak (Sentry/CloudWatch собирают
    // их в централизованное хранилище). Достаточно photoCount + flag
    // hasComment; для расследования инцидента есть task-id / worker-id
    // в полнотекстовых логах /complete-route.
    const photoCount = mailOptions.attachments?.length || 0;
    const hasComment = Boolean(comment && comment.trim());
    console.log(
      `[mail] sent (photos=${photoCount}, comment=${hasComment ? "yes" : "no"})`,
    );
  } catch (error) {
    console.error("Error sending email:", error);
  }
}
