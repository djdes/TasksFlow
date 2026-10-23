import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { pinProblem } from "@shared/pin";
import { PinInput } from "./PinInput";

/**
 * Шаг PIN после номера телефона — общий для входа в кабинет и формы
 * лендинга. «enter» — ввести заданный PIN; «create» — придумать и
 * повторить (первый вход или PIN сбросил руководитель).
 *
 * onSubmit возвращает null при успехе (переход делает вызывающий) или
 * ошибку сервера: текст, остаток попыток, блокировку, либо step:"pin",
 * если PIN успели задать, пока человек его придумывал.
 */
export type PinSubmitError = {
  message: string;
  attemptsLeft?: number;
  retryAfterSec?: number;
  step?: "pin";
};

type Props = {
  mode: "enter" | "create";
  phone: string;
  onSubmit: (pin: string) => Promise<PinSubmitError | null>;
  onBack: () => void;
  /** Сервер сообщил, что PIN уже задан — переключиться на ввод. */
  onModeChange?: (mode: "enter") => void;
  /** Ошибка, пришедшая ещё на шаге номера (например, блокировка). */
  initialError?: PinSubmitError | null;
  compact?: boolean;
};

/** 900 → «15:00», 5400 → «1:30:00». */
function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

function maskPhone(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length < 11) return phone;
  return `+${d[0]} ${d.slice(1, 4)} ***-${d.slice(7, 9)}-${d.slice(9, 11)}`;
}

export function PinFlow({ mode, phone, onSubmit, onBack, onModeChange, initialError = null, compact = false }: Props) {
  const [value, setValue] = useState("");
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<PinSubmitError | null>(initialError);
  const [errorKey, setErrorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lockedFor, setLockedFor] = useState(initialError?.retryAfterSec ?? 0);
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue("");
    setFirst(null);
  }, [mode]);

  // Пока вход заблокирован, поле недоступно; по истечении — снова можно.
  const wasLocked = useRef(lockedFor > 0);
  useEffect(() => {
    if (lockedFor > 0) {
      wasLocked.current = true;
    } else if (wasLocked.current) {
      wasLocked.current = false;
      inputRef.current?.focus();
    }
    if (lockedFor <= 0) return;
    const timer = window.setTimeout(() => setLockedFor((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [lockedFor]);

  const fail = (next: PinSubmitError) => {
    setError(next);
    setErrorKey((k) => k + 1);
    setValue("");
    if (next.retryAfterSec) setLockedFor(next.retryAfterSec);
  };

  const submit = async (pin: string) => {
    setBusy(true);
    const result = await onSubmit(pin);
    setBusy(false);
    if (!result) return;
    if (result.step === "pin") {
      onModeChange?.("enter");
      fail({ message: result.message });
      return;
    }
    fail(result);
  };

  const onComplete = (pin: string) => {
    if (busy) return;
    if (mode === "enter") {
      void submit(pin);
      return;
    }
    if (first === null) {
      const problem = pinProblem(pin);
      if (problem) {
        fail({ message: problem });
        return;
      }
      setFirst(pin);
      setError(null);
      setValue("");
      return;
    }
    if (pin !== first) {
      setFirst(null);
      fail({ message: "PIN не совпал. Придумайте его ещё раз." });
      return;
    }
    void submit(pin);
  };

  const title = mode === "enter" ? "Введите PIN" : first === null ? "Придумайте PIN" : "Повторите PIN";
  const hint =
    mode === "enter"
      ? "Забыли PIN? Попросите руководителя задать новый."
      : first === null
        ? "4 цифры — их нужно будет вводить при входе. Простые вроде 1234 не подойдут."
        : "Введите те же 4 цифры ещё раз.";
  const locked = lockedFor > 0;
  const errorText =
    error &&
    (error.attemptsLeft && !error.retryAfterSec
      ? `${error.message}. Осталось попыток: ${error.attemptsLeft}`
      : error.message);

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          aria-label="Изменить номер"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <div className={compact ? "text-lg font-bold text-foreground" : "text-xl font-bold text-foreground"}>{title}</div>
          <div className="text-sm text-muted-foreground tabular-nums">{maskPhone(phone)}</div>
        </div>
      </div>

      <PinInput
        key={`${mode}-${first === null ? "a" : "b"}`}
        inputRef={inputRef}
        value={value}
        onChange={(v) => {
          // Пока ждём сервер, ввод игнорируем, но поле не выключаем:
          // выключенное теряет фокус, и после ошибки пришлось бы тапать снова.
          if (busy) return;
          setValue(v);
          if (error && !locked) setError(null);
        }}
        onComplete={onComplete}
        label={title}
        autoFocus
        disabled={locked}
        errorKey={errorKey}
        invalid={Boolean(error)}
        describedBy={hintId}
      />

      <p
        id={hintId}
        className={`text-center text-sm ${error || locked ? "font-medium text-destructive" : "text-muted-foreground"}`}
        role={error || locked ? "alert" : undefined}
      >
        {busy ? (
          "Проверяем…"
        ) : locked ? (
          <>
            {error?.message ?? "Вход временно заблокирован"}
            {/* Отсчёт виден, но не зачитывается каждую секунду. */}
            <span aria-hidden="true" className="block tabular-nums">
              Повторите через {formatClock(lockedFor)}
            </span>
          </>
        ) : (
          errorText || hint
        )}
      </p>
    </div>
  );
}
