/**
 * Пункт чек-листа: нужно ли к нему фото.
 *
 * У старых задач поля requiresPhoto нет — фото нужно, как и было. false —
 * пункт закрывается касанием (например «Проверил свой внешний вид»), чтобы
 * фото оставалось только там, где без него не проверить. Вопрос с выбором
 * ответа фото не требует никогда — он закрывается ответом.
 */
export type ChecklistPhotoFlag = { requiresPhoto?: boolean | null; options?: readonly string[] | null };

export function itemNeedsPhoto(item: ChecklistPhotoFlag): boolean {
  if (isQuestionItem(item)) return false;
  return item.requiresPhoto !== false;
}

/** Все пункты закрываются фото — тогда в подсказках честно писать «с фото». */
export function allItemsNeedPhoto(items: readonly ChecklistPhotoFlag[]): boolean {
  return items.length > 0 && items.every(itemNeedsPhoto);
}

/**
 * Свой вопрос с выбором ответа: «Кто заполняет?» → «Лариса», «Галина».
 * Хранится пунктом чек-листа с вариантами (options) и выбранным ответом
 * (answer): так проверка «все пункты закрыты», снимок в истории дня и
 * ежедневный сброс работают для вопроса без отдельной колонки в базе.
 * Пункт закрыт (done), когда выбран один из вариантов.
 */
export type ChecklistQuestionFields = { options?: readonly string[] | null; answer?: string | null };

export const MAX_QUESTION_OPTIONS = 20;
export const MAX_QUESTION_OPTION_LENGTH = 100;

export function isQuestionItem(item: { options?: readonly string[] | null }): boolean {
  return Array.isArray(item.options) && item.options.length > 0;
}

/** Ответ засчитывается, только если он — один из вариантов вопроса. */
export function validAnswer(item: ChecklistQuestionFields, answer: unknown): string | null {
  if (typeof answer !== "string" || !Array.isArray(item.options)) return null;
  const value = answer.trim();
  return item.options.includes(value) ? value : null;
}

/**
 * Варианты ответа из строки «Лариса, Галина» (через запятую, точку с
 * запятой или с новой строки): без пустых, повторов и лишних пробелов.
 */
export function parseQuestionOptions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,;\n]/)) {
    const value = raw.trim().replace(/\s+/g, " ").slice(0, MAX_QUESTION_OPTION_LENGTH);
    const key = value.toLocaleLowerCase("ru");
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_QUESTION_OPTIONS) break;
  }
  return out;
}

/** Отвеченные вопросы задачи: «Кто заполняет?» → «Лариса» — для отчётов и проверки. */
export function checklistAnswers(
  items: readonly { title: string; options?: readonly string[] | null; answer?: string | null }[] | null | undefined,
): { question: string; answer: string }[] {
  return (items ?? [])
    .filter((it) => isQuestionItem(it) && typeof it.answer === "string" && it.answer)
    .map((it) => ({ question: it.title, answer: it.answer as string }));
}

/** Пункт на новый день: без отметки, фото и ответа; состав и варианты те же. */
export function resetChecklistItem<T extends { done?: boolean; photoUrls?: string[]; answer?: string | null }>(item: T): T {
  const { answer: _answer, ...rest } = item;
  return { ...(rest as T), done: false, photoUrls: [] };
}

type ProgressItem = {
  id: string;
  title: string;
  done?: boolean;
  photoUrls?: string[];
  requiresPhoto?: boolean;
  options?: string[];
  answer?: string | null;
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
    if (isQuestionItem(it)) {
      // Ответ сотрудника живёт, пока он остаётся среди вариантов: убрали
      // «Галину» из списка — вопрос снова ждёт ответа.
      const { answer: _incoming, ...rest } = it;
      const answer = validAnswer(it, prev?.answer);
      return questionItem(rest, answer) as T;
    }
    const { answer: _stray, ...rest } = it;
    const photoUrls = prev?.photoUrls ?? [];
    const done = Boolean(prev?.done) && (!itemNeedsPhoto(it) || photoUrls.length > 0);
    return { ...rest, done, photoUrls } as T;
  });
}

/** Вопрос с ответом (или без): «готово» — ровно когда ответ есть, фото нет. */
function questionItem<T extends object>(rest: T, answer: string | null): T & { done: boolean; photoUrls: string[]; answer?: string } {
  return { ...rest, done: answer !== null, photoUrls: [], ...(answer !== null ? { answer } : {}) };
}

/**
 * Чек-лист новой задачи: отметки и фото — как прислали (так было всегда),
 * а у вопроса засчитывается только ответ из его вариантов, и «готово»
 * совпадает с наличием ответа.
 */
export function normalizeNewChecklist<T extends ProgressItem>(items: readonly T[] | null | undefined): T[] | null | undefined {
  if (!items) return items;
  return items.map((it) => {
    const { answer: rawAnswer, ...rest } = it;
    if (!isQuestionItem(it)) return rest as T;
    const answer = validAnswer(it, rawAnswer);
    return questionItem(rest, answer) as T;
  });
}
