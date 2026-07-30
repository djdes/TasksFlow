/**
 * Разбор синтаксиса сообщения ДО обращения к AI.
 *
 * `помыть пол @Олег` — исполнитель указан явно, и угадывать его моделью
 * незачем: это быстрее, бесплатно и, главное, предсказуемо. AI остаётся
 * для расписания, премии и разбивки на задачи.
 *
 * Чистые функции без I/O — резолв «@Олег» → id делает вызывающий,
 * потому что только он знает список доступных сотрудников.
 */

export type ParsedMessage = {
  /** null — «@» не было вовсе; "" — «@» без имени. */
  assigneeQuery: string | null;
  /** Текст без @-токенов. */
  taskText: string;
};

/**
 * Берём ПОСЛЕДНИЙ @-токен: в «@Олегу помыть @Ане» человек явно
 * переназначил в конце. Все @-токены вырезаются из текста, иначе имя
 * исполнителя уедет в заголовок задачи.
 */
export function parseMessage(raw: string): ParsedMessage {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { assigneeQuery: null, taskText: "" };

  const tokens = trimmed.split(/\s+/);
  let assigneeQuery: string | null = null;
  const rest: string[] = [];

  for (const token of tokens) {
    if (token.startsWith("@")) {
      // Пунктуация после имени — часть предложения, а не имени:
      // «@Олег, помой» → «Олег».
      assigneeQuery = token.slice(1).replace(/[.,;:!?]+$/, "");
      continue;
    }
    rest.push(token);
  }

  return { assigneeQuery, taskText: rest.join(" ").trim() };
}

export type MatchableWorker = {
  id: number;
  name: string;
  position: string | null;
};

/**
 * Поиск сотрудника по «@query».
 *
 * Порядок намеренный: сначала точные совпадения, потом префиксные, и
 * только потом подстрока. Возвращаем null при неоднозначности — назначить
 * не того человека хуже, чем не назначить никого: руководитель увидит
 * «не выбран» и ткнёт кнопку, а вот чужую задачу он может и не заметить.
 */
export function matchWorker(
  query: string,
  workers: readonly MatchableWorker[],
): MatchableWorker | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const parts = (w: MatchableWorker) => [
    w.name.toLowerCase(),
    ...w.name.toLowerCase().split(/\s+/),
    ...(w.position ? [w.position.toLowerCase()] : []),
  ];

  const exact = workers.filter((w) => parts(w).some((p) => p === q));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;

  const prefix = workers.filter((w) => parts(w).some((p) => p.startsWith(q)));
  if (prefix.length === 1) return prefix[0];
  if (prefix.length > 1) return null;

  // Подстрока — последний шанс, и только если он единственный.
  const partial = workers.filter((w) => parts(w).some((p) => p.includes(q)));
  return partial.length === 1 ? partial[0] : null;
}
