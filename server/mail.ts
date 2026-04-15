import nodemailer from "nodemailer";
import path from "path";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "admin@yesbeat.ru",
    pass: "vsyc csjb evlz tcrk",
  },
});

// Email по умолчанию (для старых компаний без email)
const DEFAULT_ADMIN_EMAIL = "bugdenes@gmail.com";

export async function sendTaskCompletedEmail(
  taskTitle: string,
  workerName: string,
  photoUrls?: string[] | null,
  companyEmail?: string | null,
  comment?: string | null
) {
  try {
    // Используем email компании или email по умолчанию
    const toEmail = companyEmail || DEFAULT_ADMIN_EMAIL;

    // Формируем текст письма
    let emailText = "";
    if (comment && comment.trim()) {
      emailText = `Комментарий: ${comment.trim()}`;
    }

    const mailOptions: nodemailer.SendMailOptions = {
      from: '"TasksFlow" <admin@yesbeat.ru>',
      to: toEmail,
      subject: `${taskTitle} - ${workerName}`,
      text: emailText,
    };

    // Если есть фото, прикрепляем их к письму
    if (photoUrls && photoUrls.length > 0) {
      mailOptions.attachments = photoUrls.map((photoUrl, index) => ({
        filename: `photo-${index + 1}${path.extname(photoUrl) || '.jpg'}`,
        path: path.join(process.cwd(), photoUrl),
      }));
    }

    await transporter.sendMail(mailOptions);
    const photoCount = photoUrls?.length || 0;
    const hasComment = comment && comment.trim();
    console.log(`Email sent to ${toEmail}: ${taskTitle} - ${workerName}${photoCount > 0 ? ` (with ${photoCount} photo${photoCount > 1 ? 's' : ''})` : ''}${hasComment ? ' (with comment)' : ''}`);
  } catch (error) {
    console.error("Error sending email:", error);
  }
}
