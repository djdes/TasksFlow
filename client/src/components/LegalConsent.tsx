import { useId } from "react";
import { Check } from "lucide-react";

export interface LegalConsentProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** id чекбокса; по умолчанию уникальный (useId) — на лендинге форм две. */
  id?: string;
  /** Мелкий текст — для узких форм и шагов внутри окна входа. */
  compact?: boolean;
  /** Текст ошибки под галочкой; null/пусто — ошибки нет. */
  error?: string | null;
}

const linkCls =
  "font-medium text-foreground underline decoration-border underline-offset-2 " +
  "transition-colors hover:text-primary hover:decoration-primary";

/**
 * Галочка согласия на обработку персональных данных — отдельно от других
 * документов, как требует 152-ФЗ с 01.09.2025. По умолчанию не отмечена:
 * состояние держит форма, она же решает, когда показать error. Ссылки
 * открываются в новой вкладке, чтобы не потерять введённое в форме.
 */
export function LegalConsent({ checked, onChange, id, compact = false, error }: LegalConsentProps) {
  const autoId = useId();
  const inputId = id ?? `legal-consent-${autoId.replace(/:/g, "")}`;
  const errorId = `${inputId}-error`;
  const invalid = Boolean(error);

  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      <div className="flex items-start gap-2.5">
        <span className="relative mt-px flex shrink-0">
          <input
            id={inputId}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? errorId : undefined}
            className={
              "peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[5px] border bg-background " +
              "transition-colors checked:border-primary checked:bg-primary " +
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
              "focus-visible:ring-offset-background " +
              (invalid ? "border-destructive" : "border-input hover:border-primary/60")
            }
          />
          <Check
            aria-hidden="true"
            strokeWidth={3.5}
            className="pointer-events-none absolute inset-0 m-auto h-3 w-3 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
          />
        </span>
        <label htmlFor={inputId} className="cursor-pointer leading-snug text-muted-foreground">
          Согласен на{" "}
          <a href="/consent" target="_blank" rel="noopener" className={linkCls}>
            обработку персональных данных
          </a>{" "}
          и ознакомлен с{" "}
          <a href="/privacy" target="_blank" rel="noopener" className={linkCls}>
            политикой
          </a>
        </label>
      </div>
      {invalid && (
        <p id={errorId} role="alert" className="mt-1.5 pl-7 text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
