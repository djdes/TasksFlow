import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Цвет значка блока: у каждого смыслового блока свой, чтобы различать их с одного взгляда. */
export type FormBlockTone = "task" | "people" | "time" | "question" | "check" | "photo" | "more";

/**
 * Блок формы или окна задачи: значок в цветном квадрате, заголовок в одно-два
 * слова и содержимое. Создание задачи и её выполнение собраны из одних блоков,
 * поэтому шрифты, отступы и значки везде одинаковые (workspace.css, .form-block).
 */
export function FormBlock({
  icon: Icon,
  title,
  tone,
  aside,
  children,
  className,
  testId,
}: {
  icon: LucideIcon;
  title: string;
  tone: FormBlockTone;
  /** Справа в заголовке: счётчик «1/3», «готово» и т. п. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section className={cn("form-block", className)} data-tone={tone} aria-label={title} data-testid={testId}>
      <h3 className="form-block-title">
        <span className="form-block-icon" aria-hidden>
          <Icon />
        </span>
        <span className="form-block-name">{title}</span>
        {aside ? <span className="form-block-aside">{aside}</span> : null}
      </h3>
      <div className="form-block-body">{children}</div>
    </section>
  );
}
