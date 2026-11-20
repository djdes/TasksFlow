/**
 * Файловый кэш именованных JSON-снимков для публичных страниц продвижения.
 *
 * Правила хранения:
 *   • Никакого Redis, демонов и удержания данных в памяти процесса (Map/LRU):
 *     JSON читается с диска (из страничного кэша ОС) на каждый запрос.
 *   • Запись — строго атомарная: временный файл в той же папке + rename поверх
 *     рабочего файла. Снимки никогда не удаляются ради инвалидации.
 *   • Папка снимков переживает выкладку (git reset --hard и замену dist) без
 *     прав root: PROMO_CACHE_DIR → /var/www/tasksflow/data/promo-cache →
 *     локальная .cache/promo-cache (в .gitignore).
 *   • Никаких TTL на чтении посетителями: обновление идёт при записи в админке,
 *     при деплое (promo-cache:refresh) и по явному запросу.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export interface PromoSnapshotEnvelope<T> {
  version: 1;
  dataset: string;
  generatedAt: string;
  sourceSignature?: string;
  data: T;
}

export interface PromoDatasetFileStatus {
  dataset: string;
  filePath: string;
  exists: boolean;
  generatedAt: string | null;
  sizeBytes: number;
  sourceSignature: string | null;
}

const PROD_DATA_PARENT = "/var/www/tasksflow/data";
const PROD_PROMO_CACHE_DIR = "/var/www/tasksflow/data/promo-cache";

export function resolvePromoCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.PROMO_CACHE_DIR?.trim();
  if (explicit) return path.resolve(explicit);

  try {
    if (process.platform !== "win32" && fs.existsSync(PROD_DATA_PARENT)) {
      fs.accessSync(PROD_DATA_PARENT, fs.constants.W_OK);
      return PROD_PROMO_CACHE_DIR;
    }
  } catch {
    // Нет доступа к /var/www/tasksflow/data — используем локальную папку проекта.
  }

  return path.join(process.cwd(), ".cache", "promo-cache");
}

function sanitizeDatasetName(dataset: string): string {
  const clean = dataset.trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!clean) throw new Error("Empty promo snapshot dataset name");
  return clean;
}

export function snapshotFilePath(dataset: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolvePromoCacheDir(env), `${sanitizeDatasetName(dataset)}.json`);
}

export function readPromoSnapshotSync<T>(
  dataset: string,
  env: NodeJS.ProcessEnv = process.env,
): PromoSnapshotEnvelope<T> | null {
  try {
    const raw = fs.readFileSync(snapshotFilePath(dataset, env), "utf-8");
    const parsed = JSON.parse(raw) as PromoSnapshotEnvelope<T>;
    if (parsed && parsed.version === 1 && "data" in parsed) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function readPromoSnapshot<T>(
  dataset: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PromoSnapshotEnvelope<T> | null> {
  try {
    const raw = await fsp.readFile(snapshotFilePath(dataset, env), "utf-8");
    const parsed = JSON.parse(raw) as PromoSnapshotEnvelope<T>;
    if (parsed && parsed.version === 1 && "data" in parsed) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function writePromoSnapshotAtomicSync<T>(
  dataset: string,
  data: T,
  opts?: { sourceSignature?: string; env?: NodeJS.ProcessEnv },
): PromoSnapshotEnvelope<T> {
  const env = opts?.env ?? process.env;
  const dir = resolvePromoCacheDir(env);
  fs.mkdirSync(dir, { recursive: true });
  const target = snapshotFilePath(dataset, env);
  const nonce = crypto.randomBytes(6).toString("hex");
  const tmp = `${target}.${process.pid}.${nonce}.tmp`;
  const envelope: PromoSnapshotEnvelope<T> = {
    version: 1,
    dataset,
    generatedAt: new Date().toISOString(),
    ...(opts?.sourceSignature ? { sourceSignature: opts.sourceSignature } : {}),
    data,
  };
  try {
    fs.writeFileSync(tmp, JSON.stringify(envelope, null, 2) + "\n", "utf-8");
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      // ignore tmp cleanup failure
    }
    throw err;
  }
  return envelope;
}

export async function writePromoSnapshotAtomic<T>(
  dataset: string,
  data: T,
  opts?: { sourceSignature?: string; env?: NodeJS.ProcessEnv },
): Promise<PromoSnapshotEnvelope<T>> {
  const env = opts?.env ?? process.env;
  const dir = resolvePromoCacheDir(env);
  await fsp.mkdir(dir, { recursive: true });
  const target = snapshotFilePath(dataset, env);
  const nonce = crypto.randomBytes(6).toString("hex");
  const tmp = `${target}.${process.pid}.${nonce}.tmp`;
  const envelope: PromoSnapshotEnvelope<T> = {
    version: 1,
    dataset,
    generatedAt: new Date().toISOString(),
    ...(opts?.sourceSignature ? { sourceSignature: opts.sourceSignature } : {}),
    data,
  };
  try {
    await fsp.writeFile(tmp, JSON.stringify(envelope, null, 2) + "\n", "utf-8");
    await fsp.rename(tmp, target);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
  return envelope;
}

const inflight = new Map<string, Promise<unknown>>();

/**
 * Читает снимок с диска (0 обращений к БД). К загрузчику `loader` идёт только
 * при холодном промахе (файла ещё нет) или при смене `sourceSignature`,
 * объединяя параллельные промахи в один запрос (singleflight).
 */
export async function getOrBuildPromoSnapshot<T>(
  dataset: string,
  loader: () => Promise<T>,
  opts?: { sourceSignature?: string; env?: NodeJS.ProcessEnv },
): Promise<T> {
  const env = opts?.env ?? process.env;
  const cached = await readPromoSnapshot<T>(dataset, env);
  if (cached && (!opts?.sourceSignature || cached.sourceSignature === opts.sourceSignature)) {
    return cached.data;
  }

  const key = `${resolvePromoCacheDir(env)}::${dataset}`;
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const job = (async () => {
    const fresh = await loader();
    await writePromoSnapshotAtomic(dataset, fresh, opts);
    return fresh;
  })();
  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

export function getDatasetFileStatus(
  dataset: string,
  env: NodeJS.ProcessEnv = process.env,
): PromoDatasetFileStatus {
  const filePath = snapshotFilePath(dataset, env);
  try {
    const stat = fs.statSync(filePath);
    const snap = readPromoSnapshotSync<unknown>(dataset, env);
    return {
      dataset,
      filePath,
      exists: Boolean(snap),
      generatedAt: snap?.generatedAt ?? null,
      sizeBytes: stat.size,
      sourceSignature: snap?.sourceSignature ?? null,
    };
  } catch {
    return {
      dataset,
      filePath,
      exists: false,
      generatedAt: null,
      sizeBytes: 0,
      sourceSignature: null,
    };
  }
}
