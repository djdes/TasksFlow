/**
 * Пункт чек-листа: нужно ли к нему фото.
 *
 * У старых задач поля requiresPhoto нет — фото нужно, как и было. false —
 * пункт закрывается касанием (например «Проверил свой внешний вид»), чтобы
 * фото оставалось только там, где без него не проверить.
 */
export type ChecklistPhotoFlag = { requiresPhoto?: boolean | null };

export function itemNeedsPhoto(item: ChecklistPhotoFlag): boolean {
  return item.requiresPhoto !== false;
}

/** Все пункты закрываются фото — тогда в подсказках честно писать «с фото». */
export function allItemsNeedPhoto(items: readonly ChecklistPhotoFlag[]): boolean {
  return items.length > 0 && items.every(itemNeedsPhoto);
}

type ProgressItem = {
  id: string;
  title: string;
  done?: boolean;
  photoUrls?: string[];
  requiresPhoto?: boolean;
};

/**
 * Правка чек-листа (PUT задачи) меняет только состав: названия, порядок,
 * «нужно фото». Отметки и фото принадлежат исполнителю и берутся из базы
 * по id пункта — иначе форма, открытая утром, затёрла бы то, что сотрудник
 * успел отметить днём, а API мог бы поставить «готово» без фото. Новый
 * пункт стартует невыполненным. Включили «нужно фото» у отмеченного без
 * фото пункта — он снова ждёт фото.
 */
export function mergeChecklistProgress<T extends ProgressItem>(
  existing: readonly ProgressItem[] | null | undefined,
  incoming: readonly T[] | null | undefined,
): T[] | null {
  if (!incoming || incoming.length === 0) return null;
  const byId = new Map((existing ?? []).map((it) => [it.id, it]));
  return incoming.map((it) => {
    const prev = byId.get(it.id);
    const photoUrls = prev?.photoUrls ?? [];
    const done = Boolean(prev?.done) && (!itemNeedsPhoto(it) || photoUrls.length > 0);
    return { ...it, done, photoUrls };
  });
}
