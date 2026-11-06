import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Цвет значков в полях блока: у каждого смыслового блока свой. */
export type FormBlockTone = "task" | "people" | "time" | "question" | "check" | "photo" | "more";

/**
 * Блок формы или окна задачи — белая карточка без заголовка: подписи живут
 * в placeholder полей, а смысл блока видно по цветным значкам в полях
 * (workspace.css, .form-block). Название — только для чтения с экрана.
 * Создание задачи и её выполнение собраны из одних блоков.
 */
export function FormBlock({
  label,
  tone,
  children,
  className,
  testId,
}: {
  label: string;
  tone: FormBlockTone;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section className={cn("form-block", className)} data-tone={tone} aria-label={label} data-testid={testId}>
      {children}
    </section>
  );
}
