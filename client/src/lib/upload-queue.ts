import { useSyncExternalStore } from "react";

/**
 * Фото, которые не ушли из-за связи, ждут в IndexedDB и отправляются сами:
 * при появлении сети, при открытии кабинета и раз в 30 секунд. Переживают
 * перезагрузку страницы и закрытие вкладки — сотрудник в подвале склада
 * не теряет снимок.
 *
 * Без IndexedDB (приватный режим старых Safari) очередь не работает, и
 * ошибка показывается как раньше.
 */
export type QueuedUpload = {
  id: string;
  taskId: number;
  /** Пункт чек-листа; null — фото к самой задаче. */
  itemId: string | null;
  blob: Blob;
  name: string;
  createdAt: number;
  attempts: number;
};

export type QueuedMeta = Pick<QueuedUpload, "id" | "taskId" | "itemId" | "createdAt">;

const DB_NAME = "tasksflow-offline";
const STORE = "uploads";

function hasIdb(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

// --- Наблюдаемый список для интерфейса («2 фото ждут сети») ---------------

const EMPTY: QueuedMeta[] = [];
let snapshot: QueuedMeta[] = EMPTY;
const listeners = new Set<() => void>();

async function refreshSnapshot(): Promise<void> {
  const all = hasIdb() ? await tx<QueuedUpload[]>("readonly", (s) => s.getAll()).catch(() => []) : [];
  snapshot = all.length ? all.map(({ id, taskId, itemId, createdAt }) => ({ id, taskId, itemId, createdAt })) : EMPTY;
  listeners.forEach((l) => l());
}

export function useQueuedUploads(): QueuedMeta[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
    () => EMPTY,
  );
}

export function queueAvailable(): boolean {
  return hasIdb();
}

export async function enqueueUpload(u: Pick<QueuedUpload, "taskId" | "itemId" | "blob" | "name">): Promise<void> {
  const item: QueuedUpload = {
    ...u,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    attempts: 0,
  };
  await tx("readwrite", (s) => s.put(item));
  await refreshSnapshot();
}

/**
 * Что делать с фото после попытки: ok — ушло; retry — сеть/сервер лежит,
 * попробуем позже; drop — сервер отказал по существу (задачу удалили,
 * фото уже 10, нет прав) и повтор не поможет.
 */
export type SendResult = "ok" | "retry" | "drop";

export function classifyStatus(status: number): SendResult {
  if (status >= 200 && status < 300) return "ok";
  if (status === 0 || status === 408 || status === 429 || status >= 500) return "retry";
  return "drop";
}

let flushing: Promise<{ sent: number; dropped: number; left: number }> | null = null;

/** Отправить всё, что ждёт. Параллельные вызовы ждут один и тот же проход. */
export function flushUploads(send: (u: QueuedUpload) => Promise<SendResult>) {
  if (!hasIdb()) return Promise.resolve({ sent: 0, dropped: 0, left: 0 });
  if (!flushing) {
    flushing = (async () => {
      let sent = 0;
      let dropped = 0;
      const all = (await tx<QueuedUpload[]>("readonly", (s) => s.getAll()).catch(() => [])).sort(
        (a, b) => a.createdAt - b.createdAt,
      );
      for (const item of all) {
        const result = await send(item).catch((): SendResult => "retry");
        if (result === "retry") {
          // Сеть всё ещё лежит — остальные тоже не уйдут, ждём следующего раза.
          await tx("readwrite", (s) => s.put({ ...item, attempts: item.attempts + 1 })).catch(() => {});
          break;
        }
        await tx("readwrite", (s) => s.delete(item.id)).catch(() => {});
        if (result === "ok") sent++;
        else dropped++;
      }
      await refreshSnapshot();
      return { sent, dropped, left: snapshot.length };
    })().finally(() => {
      flushing = null;
    });
  }
  return flushing;
}

if (typeof window !== "undefined" && hasIdb()) void refreshSnapshot();
