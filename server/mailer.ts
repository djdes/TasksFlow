/**
 * Отправка писем авторизации СТРОГО через PHP.
 *
 * Прод — FastPanel/Linux, где есть PHP. По умолчанию шлём через PHP CLI:
 * Node вызывает `php -r` с нативным mail() (как DocsFlow). Это не требует
 * ни токена, ни nginx-роутинга, ни правок .env — «от меня ничего не нужно».
 *
 * Цепочка выбора транспорта:
 *   - PHP_RELAY_URL + PHP_RELAY_TOKEN заданы → "php-relay" (HTTP send.php)
 *   - NODE_ENV=production                    → "php-cli"  (php -r mail())
 *   - иначе                                  → "dev"      (.dev-outbox/*.html)
 *
 * Отдельно от server/mail.ts (тот — SMTP-уведомления о выполненных задачах).
 */
import { promises as fs } from "fs";
import path from "path";
import { spawn } from "child_process";
import { renderEmail, type EmailKind, type EmailData } from "./email-templates";

export type MailTransport = "php-relay" | "php-cli" | "dev";

export function resolveTransport(): MailTransport {
  const url = process.env.PHP_RELAY_URL?.trim();
  const token = process.env.PHP_RELAY_TOKEN?.trim();
  if (url && token) return "php-relay";
  if (process.env.NODE_ENV === "production") return "php-cli";
  return "dev";
}

function phpBin(): string {
  return process.env.PHP_BIN?.trim() || "php";
}

const FROM_NAME = "TasksFlow";
function fromEmail(): string {
  const raw = process.env.MAIL_FROM?.trim();
  if (raw) {
    const m = raw.match(/<([^>]+)>/);
    return (m ? m[1] : raw).trim();
  }
  // По умолчанию шлём от домена сервера (yesbeat.ru) — он аутентифицирован
  // (SPF/DKIM/PTR), поэтому From и конверт совпадают по домену и Gmail НЕ
  // показывает «via …». Чтобы слать от noreply@tasksflow.ru без «via» —
  // задайте MAIL_FROM и пропишите SPF+DKIM для tasksflow.ru.
  return "noreply@yesbeat.ru";
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

// Инлайн-PHP: читает HTML из stdin, тему/адреса из argv, шлёт mail().
// argv[1]=to argv[2]=base64(subject) argv[3]=from argv[4]=envelope argv[5]=fromName
const PHP_SEND = [
  "$to=$argv[1];",
  "$s=base64_decode($argv[2]);",
  "$from=$argv[3];$fn=$argv[4];$envFlag=$argv[5];",
  "$b=stream_get_contents(STDIN);",
  '$es="=?UTF-8?B?".base64_encode($s)."?=";',
  '$fh="=?UTF-8?B?".base64_encode($fn)."?= <".$from.">";',
  '$h="MIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\nFrom: ".$fh."\r\nReply-To: ".$from;',
  // Видимый From всегда брендовый. Конверт (-f) подменяем на этот же домен
  // ТОЛЬКО если MAIL_FROM задан явно (значит под него настроен SPF). Иначе
  // return-path остаётся дефолтным отправителем сервера — он аутентифицирован
  // (PTR/SPF домена сервера), поэтому письмо доставляется, а From красивый.
  'if($envFlag==="1"){$ok=@mail($to,$es,$b,$h,"-f".$from);}else{$ok=@mail($to,$es,$b,$h);}',
  "exit($ok?0:1);",
].join("");

function sendViaPhpCli(to: string, subject: string, html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const from = fromEmail(); // по умолчанию noreply@tasksflow.ru
    const envFlag = process.env.MAIL_FROM?.trim() ? "1" : "0";
    const args = [
      "-r",
      PHP_SEND,
      to,
      Buffer.from(subject, "utf8").toString("base64"),
      from,
      FROM_NAME,
      envFlag,
    ];
    let child;
    try {
      child = spawn(phpBin(), args, { stdio: ["pipe", "ignore", "pipe"] });
    } catch (e: any) {
      reject(new Error(`php spawn error: ${e?.message || e}`));
      return;
    }
    let stderr = "";
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (e) => reject(new Error(`php недоступен (${phpBin()}): ${e.message}`)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`php mail() вернул код ${code}${stderr ? ": " + stderr.trim() : ""}`));
    });
    child.stdin?.write(html, "utf8");
    child.stdin?.end();
  });
}

async function sendViaPhpRelay(to: string, subject: string, html: string): Promise<void> {
  const url = process.env.PHP_RELAY_URL!.trim();
  const token = process.env.PHP_RELAY_TOKEN!.trim();
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Relay-Token": token },
    body: JSON.stringify({ to, subject, html }),
  });
  if (!r.ok) {
    let detail = "";
    try { detail = JSON.stringify(await r.json()); } catch { /* ignore */ }
    throw new Error(`PHP relay вернул ${r.status} ${detail}`);
  }
}

export interface SendMailArgs {
  to: string;
  kind: EmailKind;
  data: EmailData;
}

/** Рендерит письмо и отправляет выбранным транспортом. Бросает при ошибке. */
export async function sendMail({ to, kind, data }: SendMailArgs): Promise<void> {
  const { subject, html } = renderEmail(kind, data);
  const transport = resolveTransport();
  if (transport === "php-relay") return sendViaPhpRelay(to, subject, html);
  if (transport === "php-cli") return sendViaPhpCli(to, subject, html);
  return sendDev(to, subject, html);
}

/** Диагностика наличия PHP на хосте (для проверки прод-окружения). */
export function phpVersion(): Promise<{ ok: boolean; bin: string; version?: string; error?: string }> {
  const bin = phpBin();
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, ["-v"]);
    } catch (e: any) {
      resolve({ ok: false, bin, error: e?.message || String(e) });
      return;
    }
    let out = "";
    let err = "";
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.stderr?.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => resolve({ ok: false, bin, error: e.message }));
    child.on("close", (code) =>
      resolve(
        code === 0
          ? { ok: true, bin, version: out.split("\n")[0].trim() }
          : { ok: false, bin, error: err || `exit ${code}` },
      ),
    );
  });
}
