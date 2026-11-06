/**
 * Строка «Проверяет» в окне задачи: кто примет выполненное.
 * Сервер считает список (`GET /api/tasks/:id/reviewers`), текст — здесь,
 * чтобы кабинет и тесты говорили одинаково.
 */
export type TaskReviewers = {
  /** «Готово» уйдёт на проверку: назначен проверяющий или так требует роль. */
  required: boolean;
  /** Кто может принять: назначенный проверяющий или админы и роли с правом. */
  names: string[];
};

export const REVIEWERS_SHOWN = 3;

export function reviewersLine(r: TaskReviewers | null | undefined): string | null {
  if (!r?.required) return null;
  const names = r.names.filter((n) => n.trim());
  if (names.length === 0) return "Проверяет: руководитель";
  if (names.length === 1) return `Проверяет: ${names[0]}`;
  if (names.length <= REVIEWERS_SHOWN) {
    return `Проверяет: ${names.slice(0, -1).join(", ")} или ${names[names.length - 1]}`;
  }
  const rest = names.length - REVIEWERS_SHOWN;
  return `Проверяет: ${names.slice(0, REVIEWERS_SHOWN).join(", ")} и ещё ${rest}`;
}
