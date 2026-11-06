import { useState } from "react";
import { List, MessageCircleQuestion, Plus, X } from "lucide-react";
import type { ChecklistItem } from "@shared/schema";
import { isQuestionItem, MAX_QUESTION_OPTIONS, parseQuestionOptions } from "@shared/checklist";
import { newChecklistId } from "@/components/ChecklistEditor";

export const MAX_TASK_QUESTIONS = 5;

/** Свой вопрос в форме: текст вопроса и варианты ответа для выпадающего списка. */
export type QuestionDraft = {
  id: string;
  title: string;
  options: string[];
};

/** Вопросы задачи → черновик формы (ответ сотрудника сервер сохранит сам). */
export function questionDraftsFrom(items: readonly ChecklistItem[] | null | undefined): QuestionDraft[] {
  return (items ?? []).filter(isQuestionItem).map((it) => ({ id: it.id, title: it.title, options: [...(it.options ?? [])] }));
}

/** Обычные пункты чек-листа без вопросов — для ChecklistEditor. */
export function withoutQuestions(items: readonly ChecklistItem[] | null | undefined): ChecklistItem[] {
  return (items ?? []).filter((it) => !isQuestionItem(it));
}

/** Что не так с вопросами: пусто — можно сохранять. */
export function questionsError(drafts: readonly QuestionDraft[]): string | null {
  for (const q of drafts) {
    const title = q.title.trim();
    if (!title && q.options.length === 0) continue;
    if (!title) return "Напишите вопрос";
    if (q.options.length < 2) return `Нужно два ответа минимум: «${title}»`;
  }
  return null;
}

/** Черновик → пункты checklist для API. Ответа нет: его выберет сотрудник. */
export function questionsPayload(drafts: readonly QuestionDraft[]): ChecklistItem[] {
  return drafts
    .filter((q) => q.title.trim() && q.options.length >= 2)
    .map((q) => ({
      id: q.id,
      title: q.title.trim(),
      options: q.options,
      done: false,
      photoUrls: [],
      requiresPhoto: false,
    }));
}

/** Пункты чек-листа и вопросы — одним списком для API, пустой — null. */
export function mergeChecklistAndQuestions(
  checklist: ChecklistItem[] | null,
  questions: readonly QuestionDraft[],
): ChecklistItem[] | null {
  const all = [...(checklist ?? []), ...questionsPayload(questions)];
  return all.length > 0 ? all : null;
}

/**
 * Свой вопрос к регулярной задаче: «Кто заполняет?» и варианты «Лариса»,
 * «Галина». Сотрудник выбирает ответ из выпадающего списка — без ответа
 * задачу не закрыть, ответ попадает в историю дня. Варианты вводятся через
 * запятую или Enter и становятся чипами.
 */
export function TaskQuestionsEditor({
  items,
  onChange,
}: {
  items: QuestionDraft[];
  onChange: (next: QuestionDraft[]) => void;
}) {
  const update = (id: string, patch: Partial<QuestionDraft>) =>
    onChange(items.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  const add = () => onChange([...items, { id: newChecklistId(), title: "", options: [] }]);

  if (items.length === 0) {
    return (
      <button type="button" className="task-question-add" onClick={add} data-testid="task-question-add">
        <MessageCircleQuestion aria-hidden />
        <span>Добавить вопрос</span>
        <Plus aria-hidden className="task-question-add-plus" />
      </button>
    );
  }

  return (
    <div className="task-questions" data-testid="task-questions">
      {items.map((q, i) => (
        <QuestionBlock
          key={q.id}
          index={i}
          draft={q}
          onChange={(patch) => update(q.id, patch)}
          onRemove={() => onChange(items.filter((x) => x.id !== q.id))}
        />
      ))}
      {items.length < MAX_TASK_QUESTIONS && (
        <button type="button" className="task-question-more" onClick={add}>
          <Plus aria-hidden />
          Ещё вопрос
        </button>
      )}
    </div>
  );
}

function QuestionBlock({
  index,
  draft,
  onChange,
  onRemove,
}: {
  index: number;
  draft: QuestionDraft;
  onChange: (patch: Partial<QuestionDraft>) => void;
  onRemove: () => void;
}) {
  const [pending, setPending] = useState("");
  const n = index + 1;
  const full = draft.options.length >= MAX_QUESTION_OPTIONS;

  // Набранное становится чипами; повторы и пустые отбрасываются.
  const commit = (text: string) => {
    const seen = new Set(draft.options.map((o) => o.toLocaleLowerCase("ru")));
    const next = [...draft.options];
    for (const opt of parseQuestionOptions(text)) {
      const key = opt.toLocaleLowerCase("ru");
      if (seen.has(key) || next.length >= MAX_QUESTION_OPTIONS) continue;
      seen.add(key);
      next.push(opt);
    }
    if (next.length !== draft.options.length) onChange({ options: next });
    setPending("");
  };

  return (
    <div className="task-question" data-testid="task-question">
      <div className="task-question-row">
        <input
          value={draft.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Например: кто заполняет?"
          aria-label={`Вопрос ${n}`}
          maxLength={200}
          className="task-question-title"
          data-testid="task-question-title"
        />
        <button type="button" className="task-question-remove" onClick={onRemove} aria-label={`Убрать вопрос ${n}`} title="Убрать вопрос">
          <X aria-hidden />
        </button>
      </div>
      <div className="task-question-options" role="group" aria-label={`Варианты ответа на вопрос ${n}`}>
        <List aria-hidden className="task-question-options-icon" />
        {draft.options.map((opt) => (
          <span key={opt} className="task-question-chip">
            {opt}
            <button
              type="button"
              onClick={() => onChange({ options: draft.options.filter((o) => o !== opt) })}
              aria-label={`Убрать вариант «${opt}»`}
            >
              <X aria-hidden />
            </button>
          </span>
        ))}
        {!full && (
          <input
            value={pending}
            onChange={(e) => {
              const v = e.target.value;
              // Запятая или вставка списка — сразу в чипы, хвост остаётся в поле.
              if (/[,;\n]/.test(v)) {
                const parts = v.split(/[,;\n]/);
                const tail = parts.pop() ?? "";
                commit(parts.join(","));
                setPending(tail.trimStart());
              } else {
                setPending(v);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit(pending);
              } else if (e.key === "Backspace" && !pending && draft.options.length > 0) {
                onChange({ options: draft.options.slice(0, -1) });
              }
            }}
            onBlur={() => pending.trim() && commit(pending)}
            placeholder={draft.options.length ? "Ещё ответ" : "Ответы через запятую"}
            aria-label={`Новый вариант ответа на вопрос ${n}`}
            enterKeyHint="done"
            maxLength={100}
            className="task-question-option-input"
            data-testid="task-question-options"
          />
        )}
      </div>
    </div>
  );
}
