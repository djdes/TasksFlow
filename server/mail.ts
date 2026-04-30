import nodemailer from "nodemailer";
import path from "path";

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
  (SMTP_USER ? `"TasksFlow" <${SMTP_USER}>` : null);

const transporter =
  SMTP_HOST && SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        connectionTimeout: 5000,
        socketTimeout: 5000,
      })
    : null;

if (!transporter) {
  console.warn(
    "[mail] SMTP не настроен (нужны SMTP_HOST + SMTP_USER + SMTP_PASS). " +
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
      const uploadsRoot = path.resolve(process.cwd(), "uploads");
      const safeAttachments: NonNullable<
        nodemailer.SendMailOptions["attachments"]
      > = [];
      for (let i = 0; i < photoUrls.length; i += 1) {
        const photoUrl = photoUrls[i];
        if (typeof photoUrl !== "string" || !photoUrl) continue;
        const abs = path.resolve(process.cwd(), photoUrl);
        if (!abs.startsWith(uploadsRoot + path.sep)) {
          console.warn("[mail] refusing attachment outside uploads/:", abs);
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
    const photoCount = mailOptions.attachments?.length || 0;
    const hasComment = comment && comment.trim();
    console.log(
      `Email sent to ${toEmail}: ${taskTitle} - ${workerName}` +
        (photoCount > 0
          ? ` (with ${photoCount} photo${photoCount > 1 ? "s" : ""})`
          : "") +
        (hasComment ? " (with comment)" : "")
    );
  } catch (error) {
    console.error("Error sending email:", error);
  }
}
