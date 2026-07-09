import "dotenv/config";
import mysql from "mysql2/promise";
import { unlink } from "fs/promises";
import path from "path";

// Path-traversal защита: photoUrls в БД пишутся через сервер с safe
// filename'ами, но defense-in-depth — на случай если когда-нибудь
// WeSetup integration или другой sync-канал пропишет «../../etc/passwd»
// в БД. Daily-cron этого скрипта может работать под повышенными
// правами, тут же `unlink` без allowlist'а ушёл бы за пределы uploads/.
const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");
function resolveSafeUploadPath(photoUrl: string): string | null {
  // Только basename — отрезаем любые ../, абсолютные пути, slash-injection.
  // photoUrl формат: "/uploads/task-1-xxx.jpg" или "uploads/...".
  const basename = path.basename(photoUrl);
  if (!basename || basename === "." || basename === "..") return null;
  const resolved = path.resolve(UPLOADS_ROOT, basename);
  // Ещё одна проверка: resolved обязан начинаться с UPLOADS_ROOT/.
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep) && resolved !== UPLOADS_ROOT) {
    return null;
  }
  return resolved;
}

/**
 * Скрипт для сброса повторяющихся задач.
 * Запускать ежедневно через cron/планировщик задач в начале дня (например, в 00:00 или 06:00).
 *
 * Что делает:
 * 1. Находит все задачи с is_recurring = 1 и is_completed = 1
 * 2. Сбрасывает is_completed в 0
 * 3. Удаляет все фото (photo_url и photo_urls) и файлы с диска
 */

async function resetRecurringTasks() {
  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const password = process.env.MYSQL_PASSWORD;
  const database = process.env.MYSQL_DATABASE;

  if (!host || !user || !password || !database) {
    throw new Error("MySQL credentials not set");
  }

  const connection = await mysql.createConnection({
    host,
    user,
    password,
    database,
    port: 3306,
  });

  try {
    // Находим все повторяющиеся завершенные задачи
    const [tasks] = await connection.execute<any[]>(`
      SELECT id, photo_url, photo_urls FROM tasks
      WHERE is_recurring = 1 AND is_completed = 1
    `);

    console.log(`Найдено ${tasks.length} повторяющихся завершенных задач для сброса`);

    // Удаляем файлы фотографий
    for (const task of tasks) {
      // Удаляем фото из массива photo_urls
      if (task.photo_urls) {
        try {
          const photoUrls: string[] = JSON.parse(task.photo_urls);
          for (const photoUrl of photoUrls) {
            const photoPath = resolveSafeUploadPath(photoUrl);
            if (!photoPath) {
              console.warn(`Пропуск unsafe photoUrl для задачи ${task.id}:`, photoUrl);
              continue;
            }
            try {
              await unlink(photoPath);
              console.log(`Удален файл: ${photoPath}`);
            } catch (err: any) {
              if (err.code !== 'ENOENT') {
                console.error(`Ошибка удаления файла ${photoPath}:`, err.message);
              }
            }
          }
        } catch (parseErr) {
          console.error(`Ошибка парсинга photo_urls для задачи ${task.id}:`, parseErr);
        }
      }

      // Удаляем старое фото photo_url (для обратной совместимости)
      if (task.photo_url) {
        const photoPath = resolveSafeUploadPath(task.photo_url);
        if (!photoPath) {
          console.warn(`Пропуск unsafe legacy photo_url для задачи ${task.id}:`, task.photo_url);
        } else {
          try {
            await unlink(photoPath);
            console.log(`Удален файл (legacy): ${photoPath}`);
          } catch (err: any) {
            if (err.code !== 'ENOENT') {
              console.error(`Ошибка удаления файла ${photoPath}:`, err.message);
            }
          }
        }
      }
    }

    // ===== Сброс чек-листов (подзадач) =====
    // Ежедневно чистим прогресс по пунктам у ВСЕХ повторяющихся задач с
    // чек-листом (не только завершённых): галочки и фото пунктов
    // обнуляются, заголовки/id остаются. Иначе частично выполненный вчера
    // чек-лист «переехал» бы на сегодня.
    const [checklistTasks] = await connection.execute<any[]>(`
      SELECT id, checklist FROM tasks
      WHERE is_recurring = 1 AND checklist IS NOT NULL AND checklist <> '[]'
    `);
    console.log(`Найдено ${checklistTasks.length} повторяющихся задач с чек-листом`);
    for (const task of checklistTasks) {
      let items: any[];
      try {
        items = JSON.parse(task.checklist);
      } catch (e) {
        console.error(`Ошибка парсинга checklist для задачи ${task.id}:`, e);
        continue;
      }
      if (!Array.isArray(items) || items.length === 0) continue;
      // Удаляем файлы фото пунктов с диска.
      for (const item of items) {
        for (const photoUrl of item?.photoUrls || []) {
          const p = resolveSafeUploadPath(photoUrl);
          if (!p) continue;
          try {
            await unlink(p);
          } catch (err: any) {
            if (err.code !== "ENOENT") console.error(`Ошибка удаления фото пункта ${task.id}:`, err.message);
          }
        }
      }
      const reset = items.map((it) => ({ ...it, done: false, photoUrls: [] }));
      await connection.execute(`UPDATE tasks SET checklist = ? WHERE id = ?`, [
        JSON.stringify(reset),
        task.id,
      ]);
    }

    // Сбрасываем статус и все фото для всех повторяющихся задач
    const [result] = await connection.execute(`
      UPDATE tasks
      SET is_completed = 0, photo_url = NULL, photo_urls = NULL
      WHERE is_recurring = 1 AND is_completed = 1
    `);

    const affectedRows = (result as any).affectedRows;
    console.log(`Сброшено задач: ${affectedRows}`);
    console.log("Сброс повторяющихся задач завершен");

  } catch (error) {
    console.error("Ошибка:", error);
    // Exit code устанавливаем, но НЕ зовём process.exit здесь —
    // finally сначала закрывает connection. process.exit в finally
    // переопределял exit code на 0 даже при ошибке → cron не видел
    // failure и продолжал падать тихо изо дня в день.
    process.exitCode = 1;
  } finally {
    await connection.end();
    // Только если exitCode не выставлен явно через catch.
    // process.exit(0) в этой ветке избыточен — Node сам выходит с
    // process.exitCode когда event loop пуст.
  }
}

resetRecurringTasks();
