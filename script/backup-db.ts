/**
 * mysqldump-backup для TasksFlow.
 *
 * Запускается deploy.yml до любых migration-ов и cron'ом раз в час.
 *
 * Создаёт gzipped dump в `~/backups/tasksflow-YYYY-MM-DD-HH-mm.sql.gz`.
 * Ротация — файлы старше 30 дней удаляются.
 *
 * Контекст: 28.04.2026 prod БД была wipe'нута через `drizzle-kit push --force`,
 * и backup'а не было — потеряли tasks/invitations навсегда. Чтобы такое не
 * повторилось, делаем dump перед каждым deploy'ем + почасово.
 */

import "dotenv/config";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { homedir } from "node:os";

const execFileP = promisify(execFile);

const KEEP_DAYS = 30;

async function main() {
  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;
  if (!host || !user || !password || !database) {
    throw new Error("MySQL credentials not set");
  }

  const backupDir = path.join(homedir(), "backups");
  await mkdir(backupDir, { recursive: true });

  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/T/, "-")
    .slice(0, 19);
  const file = path.join(backupDir, `tasksflow-${ts}.sql.gz`);

  // mysqldump | gzip > file
  // Используем pipe вместо --result-file чтобы не держать большой
  // временный файл несжатым.
  await new Promise<void>((resolve, reject) => {
    const dump = spawn(
      "mysqldump",
      [
        "-h",
        host,
        "-u",
        user,
        `-p${password}`,
        "--single-transaction",
        "--quick",
        "--lock-tables=false",
        "--routines",
        "--triggers",
        "--events",
        database,
      ],
      { stdio: ["ignore", "pipe", "inherit"] }
    );
    const gz = spawn("gzip", ["-c"], {
      stdio: [dump.stdout!, "pipe", "inherit"],
    });
    const out = fs.createWriteStream(file);
    gz.stdout!.pipe(out);
    gz.on("error", reject);
    dump.on("error", reject);
    out.on("close", () => {
      if (dump.exitCode === 0 && (gz.exitCode ?? 0) === 0) resolve();
      else
        reject(
          new Error(`mysqldump exit ${dump.exitCode}, gzip exit ${gz.exitCode}`)
        );
    });
  });

  const stats = await stat(file);
  console.log(`✅ ${file} — ${(stats.size / 1024).toFixed(1)} KB`);

  // Ротация — старше KEEP_DAYS дней.
  const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
  const files = await readdir(backupDir);
  let removed = 0;
  for (const f of files) {
    if (!f.startsWith("tasksflow-") || !f.endsWith(".sql.gz")) continue;
    const full = path.join(backupDir, f);
    const s = await stat(full);
    if (s.mtimeMs < cutoff) {
      await unlink(full);
      removed += 1;
    }
  }
  if (removed > 0) console.log(`Rotated: removed ${removed} old backups`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Backup failed:", err);
    process.exit(1);
  });
