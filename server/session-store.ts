/**
 * MySQL-based session store для express-session, поверх drizzle БД.
 *
 * Раньше TasksFlow использовал `memorystore` — in-process хранилище,
 * которое теряет все сессии при рестарте сервера (deploy / crash /
 * scaling). Юзеры жаловались «постоянно вылетает с акка» — это
 * было проявление: каждый деплой = всех вышибало.
 *
 * Теперь сессии в таблице `sessions` (см. shared/schema.ts), переживают
 * рестарты. Данных мало — sid + JSON-payload + ttl, INSERT ON DUPLICATE
 * KEY UPDATE для upsert'а, периодический cleanup истёкших.
 *
 * API соответствует express-session Store contract:
 *   get(sid, cb)      — найти сессию
 *   set(sid, sess, cb)— upsert
 *   destroy(sid, cb)  — удалить
 *   touch(sid, sess, cb) — продлить expires (для rolling sessions)
 */
import { Store, type SessionData } from "express-session";
import { eq, lt } from "drizzle-orm";
import { db } from "./db";
import { sessions } from "@shared/schema";
import { logger } from "./logger";

type Callback = (err?: unknown) => void;
type GetCallback = (err: unknown, session?: SessionData | null) => void;

function expiresFromSession(session: SessionData): number {
  // express-session кладёт абсолютную дату в session.cookie.expires
  // когда maxAge задан в config'е. Бывает Date или ISO string после
  // json-roundtrip.
  const raw = session?.cookie?.expires as unknown;
  let ms: number | null = null;
  if (raw instanceof Date) {
    ms = raw.getTime();
  } else if (typeof raw === "string") {
    const parsed = new Date(raw).getTime();
    if (Number.isFinite(parsed)) ms = parsed;
  }
  if (ms === null || !Number.isFinite(ms)) {
    // Fallback на maxAge если задан, иначе 24 часа.
    const maxAge = session?.cookie?.maxAge;
    ms = Date.now() + (typeof maxAge === "number" ? maxAge : 24 * 60 * 60 * 1000);
  }
  return Math.floor(ms / 1000);
}

export class MySqlSessionStore extends Store {
  constructor() {
    super();
    // Background cleanup истёкших сессий — раз в час. Cheap:
    // одинокий DELETE с index lookup по expires.
    setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      db.delete(sessions)
        .where(lt(sessions.expires, now))
        .catch((err: unknown) => {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            "[session-store] cleanup failed",
          );
        });
    }, 60 * 60 * 1000).unref?.();
  }

  get(sid: string, cb: GetCallback): void {
    db.select()
      .from(sessions)
      .where(eq(sessions.sid, sid))
      .then((rows) => {
        const row = rows[0];
        if (!row) return cb(null, null);
        const now = Math.floor(Date.now() / 1000);
        if (row.expires < now) {
          // Истекла — лучше сразу удалить чтобы при следующем
          // обращении не было false-positive «есть строка но мертва».
          db.delete(sessions).where(eq(sessions.sid, sid)).catch(() => null);
          return cb(null, null);
        }
        try {
          const data = JSON.parse(row.data) as SessionData;
          cb(null, data);
        } catch (err) {
          // Корраптнутый JSON — проще удалить и заставить юзера
          // перелогиниться, чем тащить deserialize-ошибку дальше.
          db.delete(sessions).where(eq(sessions.sid, sid)).catch(() => null);
          cb(err);
        }
      })
      .catch((err) => cb(err));
  }

  set(sid: string, session: SessionData, cb?: Callback): void {
    const expires = expiresFromSession(session);
    const data = JSON.stringify(session);
    // INSERT … ON DUPLICATE KEY UPDATE — атомарный upsert MySQL.
    db.insert(sessions)
      .values({ sid, expires, data })
      .onDuplicateKeyUpdate({ set: { expires, data } })
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }

  destroy(sid: string, cb?: Callback): void {
    db.delete(sessions)
      .where(eq(sessions.sid, sid))
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }

  touch(sid: string, session: SessionData, cb?: Callback): void {
    // express-session ходит в touch когда rolling=true и юзер
    // активен — продлеваем expires без переписи data.
    const expires = expiresFromSession(session);
    db.update(sessions)
      .set({ expires })
      .where(eq(sessions.sid, sid))
      .then(() => cb?.())
      .catch((err) => cb?.(err));
  }
}
