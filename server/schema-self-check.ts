import { db } from "./db";
import { logger } from "./logger";

/**
 * Startup-self-check для критичных колонок MySQL. Если миграция
 * `_add-verification-cols.ts` не прошла на проде (например упала
 * на одном из ALTER, или была пропущена в deploy), код приложения,
 * пишущий в эти колонки, валится с `Unknown column`. Это ломает
 * `createTask` и `submitForVerification`.
 *
 * Решение: при старте сервера пробуем SELECT каждой колонки.
 * Если падает — пытаемся ALTER её добавить. Если и это упало —
 * логируем error и продолжаем (приложение всё равно запустится,
 * но verification-фичи будут disabled).
 *
 * Проверяемые миграции:
 *   • verification колонки (verification_status, verifier_worker_id,
 *     verified_by_user_id, verified_at, reject_reason)
 *
 * Idempotent — безопасно вызывать каждый старт.
 */

type ColumnSpec = {
  name: string;
  ddl: string;
};

const VERIFICATION_COLUMNS: ColumnSpec[] = [
  {
    name: "verification_status",
    ddl: "ALTER TABLE tasks ADD COLUMN verification_status VARCHAR(20) NULL",
  },
  {
    name: "verifier_worker_id",
    ddl: "ALTER TABLE tasks ADD COLUMN verifier_worker_id INT NULL",
  },
  {
    name: "verified_by_user_id",
    ddl: "ALTER TABLE tasks ADD COLUMN verified_by_user_id INT NULL",
  },
  {
    name: "verified_at",
    ddl: "ALTER TABLE tasks ADD COLUMN verified_at INT NULL",
  },
  {
    name: "reject_reason",
    ddl: "ALTER TABLE tasks ADD COLUMN reject_reason TEXT NULL",
  },
];

const VERIFICATION_INDEXES: ColumnSpec[] = [
  {
    name: "idx_tasks_verifier_status",
    ddl: "CREATE INDEX idx_tasks_verifier_status ON tasks(verifier_worker_id, verification_status)",
  },
  {
    name: "idx_tasks_verification_status",
    ddl: "CREATE INDEX idx_tasks_verification_status ON tasks(verification_status)",
  },
];

async function columnExists(table: string, column: string): Promise<boolean> {
  // Простой пробный SELECT. Если колонки нет — mysql2 кидает
  // ER_BAD_FIELD_ERROR. Если колонка есть, но таблица пустая — OK.
  // Drizzle's db.execute поддерживает только один stringly-typed
  // аргумент в нашей версии, поэтому подставляем напрямую.
  // Безопасно — table и column задаём мы сами в коде, не из юзера.
  try {
    await db.execute(`SELECT \`${column}\` FROM \`${table}\` LIMIT 1` as never);
    return true;
  } catch {
    return false;
  }
}

async function ensureColumn(spec: ColumnSpec): Promise<"ok" | "added" | "failed"> {
  const exists = await columnExists("tasks", spec.name);
  if (exists) return "ok";
  try {
    await db.execute(spec.ddl as never);
    logger.info({ column: spec.name }, "[schema-self-check] added missing column");
    return "added";
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "ER_DUP_FIELDNAME") {
      // Race с другой инстанцией — кто-то добавил колонку параллельно.
      return "ok";
    }
    logger.error(
      { column: spec.name, err: err instanceof Error ? err.message : String(err) },
      "[schema-self-check] FAILED to add column — verification feature disabled",
    );
    return "failed";
  }
}

async function ensureIndex(spec: ColumnSpec): Promise<"ok" | "added" | "failed"> {
  // Index check: пробуем CREATE и ловим ER_DUP_KEYNAME.
  try {
    await db.execute(spec.ddl as never);
    logger.info({ index: spec.name }, "[schema-self-check] created missing index");
    return "added";
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "ER_DUP_KEYNAME") return "ok";
    logger.warn(
      { index: spec.name, err: err instanceof Error ? err.message : String(err) },
      "[schema-self-check] failed to create index (non-critical)",
    );
    return "failed";
  }
}

let cachedVerificationReady: boolean | null = null;

/**
 * Возвращает true если все verification-колонки доступны. Используется
 * в /complete и createTask чтобы не падать с unknown column на legacy
 * базе где migration не прошла — fallback на старое поведение.
 */
export function isVerificationSchemaReady(): boolean {
  return cachedVerificationReady === true;
}

export async function runSchemaSelfCheck(): Promise<void> {
  let allOk = true;
  for (const spec of VERIFICATION_COLUMNS) {
    const r = await ensureColumn(spec);
    if (r === "failed") allOk = false;
  }
  for (const spec of VERIFICATION_INDEXES) {
    await ensureIndex(spec); // index — non-critical, не валим check
  }
  cachedVerificationReady = allOk;
  if (allOk) {
    logger.info("[schema-self-check] verification schema OK");
  } else {
    logger.error(
      "[schema-self-check] verification schema NOT ready — verification disabled, all completes go legacy path",
    );
  }
}
