/**
 * Чистая логика экрана «На проверке»: какие фото показать, куда перейти
 * после решения, какая клавиша что делает. Вынесено из Verification.tsx,
 * чтобы проверять тестами без DOM.
 */

type PhotoTask = {
  photoUrl?: string | null;
  photoUrls?: readonly string[] | null;
  examplePhotoUrl?: string | null;
  examplePhotoUrls?: readonly string[] | null;
  checklist?: readonly { title: string; photoUrls?: readonly string[] | null }[] | null;
};

export type ReviewPhoto = { url: string; label: string };

/** Эталон «как надо»: массив, а у старых задач — одиночная колонка. */
export function getExamplePhotos(task: PhotoTask): string[] {
  const list = (task.examplePhotoUrls ?? []).filter(Boolean);
  if (list.length > 0) return Array.from(new Set(list));
  return task.examplePhotoUrl ? [task.examplePhotoUrl] : [];
}

/**
 * Все фото сотрудника по задаче: общие и из пунктов чек-листа (с
 * подписью пункта). Повторы убираются — один и тот же URL мог попасть
 * и в задачу, и в пункт.
 */
export function collectTaskPhotos(task: PhotoTask): ReviewPhoto[] {
  const seen = new Set<string>();
  const out: ReviewPhoto[] = [];
  const push = (url: string | null | undefined, label: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, label });
  };
  const own = (task.photoUrls ?? []).filter(Boolean);
  if (own.length === 0) push(task.photoUrl, "Фото 1");
  own.forEach((url, index) => push(url, `Фото ${index + 1}`));
  for (const item of task.checklist ?? []) {
    for (const url of item.photoUrls ?? []) push(url, item.title);
  }
  return out;
}

/**
 * Какая задача станет текущей после решения по decidedId: следующая в
 * очереди, а если решили последнюю — предыдущая. null — очередь пуста.
 */
export function nextTaskIdAfter(ids: readonly number[], decidedId: number): number | null {
  const index = ids.indexOf(decidedId);
  const rest = ids.filter((id) => id !== decidedId);
  if (rest.length === 0) return null;
  if (index < 0) return rest[0];
  return rest[Math.min(index, rest.length - 1)];
}

export type ReviewHotkey = "approve" | "reject" | "prev" | "next";

type KeyLike = {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  target?: EventTarget | null;
};

function isTypingTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; isContentEditable?: boolean; closest?: (s: string) => unknown };
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  // Внутри открытого окна (просмотр фото, меню) клавиши принадлежат ему.
  return typeof el.closest === "function" && Boolean(el.closest('[role="dialog"], [role="menu"], [role="listbox"]'));
}

/**
 * A — принять, R — вернуть, ←/→ — соседняя задача. Код клавиши, а не
 * символ: на русской раскладке A и R печатают «ф» и «к».
 */
export function reviewHotkey(event: KeyLike): ReviewHotkey | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  if (isTypingTarget(event.target)) return null;
  if (event.key === "ArrowLeft") return "prev";
  if (event.key === "ArrowRight") return "next";
  if (event.shiftKey) return null;
  const code = event.code ?? "";
  const key = event.key.toLowerCase();
  if (code === "KeyA" || key === "a" || key === "ф") return "approve";
  if (code === "KeyR" || key === "r" || key === "к") return "reject";
  return null;
}
