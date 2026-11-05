import { ApiError, fetchOrFriendlyError } from "@/lib/queryClient";
import { preparePhoto, stampText } from "@/lib/photo-prep";
import { classifyStatus, enqueueUpload, queueAvailable, type QueuedUpload, type SendResult } from "@/lib/upload-queue";

/** POST фото к задаче или к пункту чек-листа. */
export function postTaskPhoto(taskId: number, file: Blob, name: string, itemId: string | null): Promise<Response> {
  const form = new FormData();
  form.append("photo", file, name);
  const url = itemId
    ? `/api/tasks/${taskId}/checklist/${encodeURIComponent(itemId)}/photo`
    : `/api/tasks/${taskId}/photo`;
  // 120 с: даже сжатое фото на 2G грузится долго.
  return fetchOrFriendlyError(url, { method: "POST", credentials: "include", body: form, signal: AbortSignal.timeout(120_000) });
}

async function errorMessage(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  return typeof body?.message === "string" ? body.message : "Ошибка загрузки фото";
}

export type UploadOutcome<T> = { queued: false; data: T } | { queued: true };

/**
 * Подготовить (сжать, подписать временем) и отправить фото. Нет связи или
 * сервер перезапускается — кладём в очередь и говорим об этом; фото уйдёт
 * само. Отказ по существу (лимит фото, нет прав) — обычная ошибка.
 */
export async function uploadTaskPhoto<T>(args: {
  taskId: number;
  itemId?: string | null;
  file: File;
  stamp: boolean;
  place?: string | null;
}): Promise<UploadOutcome<T>> {
  const prepared = await preparePhoto(args.file, { stamp: args.stamp ? stampText(new Date(), args.place) : null });
  const itemId = args.itemId ?? null;
  let res: Response;
  try {
    res = await postTaskPhoto(args.taskId, prepared, prepared.name, itemId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 0 && queueAvailable()) {
      await enqueueUpload({ taskId: args.taskId, itemId, blob: prepared, name: prepared.name });
      return { queued: true };
    }
    throw err;
  }
  if (res.ok) return { queued: false, data: (await res.json()) as T };
  if (classifyStatus(res.status) === "retry" && queueAvailable()) {
    await enqueueUpload({ taskId: args.taskId, itemId, blob: prepared, name: prepared.name });
    return { queued: true };
  }
  throw new ApiError(await errorMessage(res), res.status);
}

/** Отправка одного фото из очереди. */
export async function sendQueued(item: QueuedUpload): Promise<SendResult> {
  try {
    const res = await postTaskPhoto(item.taskId, item.blob, item.name, item.itemId);
    return classifyStatus(res.status);
  } catch {
    return "retry";
  }
}

/**
 * Фото к задаче (поле `examplePhotoUrl`): что и как сделать. Руководитель
 * прикрепляет его при создании, копировании и правке; сотрудник видит фото
 * в окне задачи. Сжимаем как фото результата, без подписи временем.
 */
export async function uploadTaskAttachmentPhoto(taskId: number, file: File): Promise<string> {
  const prepared = await preparePhoto(file, { stamp: null });
  const form = new FormData();
  form.append("photo", prepared, prepared.name);
  const res = await fetchOrFriendlyError(`/api/tasks/${taskId}/example-photo`, {
    method: "POST",
    credentials: "include",
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new ApiError(await errorMessage(res), res.status);
  const body = await res.json().catch(() => ({}));
  return typeof body?.examplePhotoUrl === "string" ? body.examplePhotoUrl : "";
}

/** Уже загруженное фото задачи → файл, чтобы прикрепить его к копии. */
export async function fileFromUploadedPhoto(url: string): Promise<File | null> {
  try {
    const res = await fetch(url, { credentials: "include", signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    const name = url.split("/").pop() || "photo.jpg";
    return new File([blob], name, { type: blob.type });
  } catch {
    return null;
  }
}
