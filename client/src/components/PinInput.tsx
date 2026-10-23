import { useEffect, useRef, useState, type Ref } from "react";
import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from "input-otp";
import { Eye, EyeOff } from "lucide-react";
import { PIN_LENGTH } from "@shared/pin";

/**
 * Поле PIN из 4 ячеек. Цифры скрыты точками (PIN вводят при людях),
 * кнопка-глаз показывает их. Стили — только Tailwind, чтобы поле работало
 * и в кабинете, и в форме лендинга. При ошибке ячейки коротко вздрагивают;
 * без движения — только красная рамка.
 */
type Props = {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  label: string;
  id?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Меняйте значение (например, счётчик ошибок), чтобы поле вздрогнуло. */
  errorKey?: number;
  invalid?: boolean;
  describedBy?: string;
  inputRef?: Ref<HTMLInputElement>;
};

function reducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return (
    document.documentElement.dataset.motion === "reduced" ||
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function Cell({ char, isActive, hasFakeCaret, revealed, invalid, disabled }: SlotProps & { revealed: boolean; invalid: boolean; disabled: boolean }) {
  return (
    <div
      className={[
        "relative grid h-16 w-14 place-items-center rounded-2xl border-2 bg-card text-2xl font-semibold text-foreground",
        "transition-[border-color,box-shadow,opacity] duration-150",
        disabled ? "opacity-60" : "",
        invalid
          ? "border-destructive"
          : isActive && !disabled
            ? "border-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.15)]"
            : char
              ? "border-primary/40"
              : "border-border",
      ].join(" ")}
    >
      {char ? (
        revealed ? (
          <span className="tabular-nums">{char}</span>
        ) : (
          <span className="h-3.5 w-3.5 rounded-full bg-foreground" aria-hidden="true" />
        )
      ) : null}
      {hasFakeCaret && !disabled ? (
        <span className="absolute h-7 w-0.5 animate-pulse rounded bg-primary motion-reduce:animate-none" aria-hidden="true" />
      ) : null}
    </div>
  );
}

export function PinInput({ value, onChange, onComplete, label, id, autoFocus, disabled, errorKey = 0, invalid = false, describedBy, inputRef }: Props) {
  const [revealed, setRevealed] = useState(false);
  const cellsRef = useRef<HTMLDivElement | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    if (!errorKey || reducedMotion() || !cellsRef.current?.animate) return;
    cellsRef.current.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-8px)" },
        { transform: "translateX(7px)" },
        { transform: "translateX(-4px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 320, easing: "ease-out" },
    );
  }, [errorKey]);

  return (
    <div className="flex items-center justify-center gap-3">
      <OTPInput
        ref={inputRef}
        id={id}
        maxLength={PIN_LENGTH}
        value={value}
        onChange={(next) => onChange(next.replace(/\D/g, ""))}
        onComplete={onComplete}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        containerClassName="flex"
        render={({ slots }) => (
          <div ref={cellsRef} className="flex gap-2.5">
            {slots.map((slot, i) => (
              <Cell key={i} {...slot} revealed={revealed} invalid={invalid} disabled={!!disabled} />
            ))}
          </div>
        )}
      />
      <button
        type="button"
        onClick={() => setRevealed((v) => !v)}
        className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        aria-label={revealed ? "Скрыть цифры PIN" : "Показать цифры PIN"}
        aria-pressed={revealed}
      >
        {revealed ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
      </button>
    </div>
  );
}
