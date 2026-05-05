import path from "path";

/**
 * Корень папки uploads/ на диске.
 *
 * Раньше большинство хендлеров делали:
 *   const abs = path.resolve(process.cwd(), photoUrl);
 * где photoUrl = "/uploads/task-123-456.jpg" (фронтовая URL-форма с
 * лидирующим слешем — потому что фронт грузит файл через
 * <img src="/uploads/...">). Проблема: если photoUrl АБСОЛЮТНЫЙ путь
 * (на Linux любой путь с `/` — абсолютный), `path.resolve` отбрасывает
 * cwd и возвращает сам photoUrl. То есть на проде:
 *   path.resolve("/var/www/TasksFlow", "/uploads/foo.jpg")
 *     === "/uploads/foo.jpg"  // НЕ существует на диске
 * И на Windows:
 *   path.resolve("C:\\www\\TasksFlow", "/uploads/foo.jpg")
 *     === "C:\\uploads\\foo.jpg"  // тоже не существует
 *
 * В результате — каждый unlink проваливается (либо silent ENOENT, либо
 * `if (!abs.startsWith(uploadsRoot))` гард рефьюзит). И /uploads/ растёт
 * бесконтрольно: удалённые задачи, заменённые example-photo, удалённые
 * фото — все файлы лежат orphan'ами. На проде disk-usage уплывает.
 *
 * Этот helper берёт ТОЛЬКО basename из photoUrl (защита от path
 * traversal) и склеивает с UPLOADS_ROOT. Так не зависим от того,
 * абсолютный ли путь во входе.
 */
export const UPLOADS_ROOT = path.resolve(process.cwd(), "uploads");

/**
 * Конвертирует frontend-relative URL фото ("/uploads/task-123.jpg")
 * в абсолютный путь к файлу на диске. Возвращает null если URL
 * невалиден или basename выглядит подозрительно (".", "..", пусто).
 */
export function resolveUploadAbs(photoUrl: string | null | undefined): string | null {
  if (!photoUrl || typeof photoUrl !== "string") return null;
  const base = path.basename(photoUrl);
  if (!base || base === "." || base === "..") return null;
  const abs = path.join(UPLOADS_ROOT, base);
  // Defense-in-depth — basename уже отрезает traversal, но проверим явно.
  if (!abs.startsWith(UPLOADS_ROOT + path.sep)) return null;
  return abs;
}
