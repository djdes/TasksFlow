import { Input } from "@/components/ui/input";
import { forwardRef, useState } from "react";
import {
  formatPhoneInput,
  shouldBlockPhoneKey,
  shouldResetPhoneCursor,
} from "@/lib/phone-input-format";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Подпись поля: видна placeholder'ом, пока номер не начали вводить. */
  placeholder?: string;
  /** Для экранного диктора, если подпись отличается от placeholder. */
  "aria-label"?: string;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Контролируемый инпут российского телефона. Всегда хранит значение
 * вида "+7XXXXXXXXXX" (12 символов). Запрещает удаление "+7" и режет
 * лишние цифры на 10 после кода. Извлечён из Login.tsx, чтобы можно
 * было использовать в JoinByInvite и других местах.
 */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, placeholder = "Телефон", className, autoFocus, "aria-label": ariaLabel }, ref) => {
    // Подписей над полями нет: пока номер пуст и поле не в фокусе, вместо «+7»
    // показываем placeholder («Ваш телефон»). В форме значение остаётся «+7».
    const [focused, setFocused] = useState(false);
    const empty = value.replace(/\D/g, "").length <= 1;
    return (
      <Input
        ref={ref}
        type="tel"
        // type="tel" уже даёт numeric keyboard на iOS/Android, но
        // inputMode дублирует на случай если браузер игнорирует type
        // (некоторые Android-WebView). autoComplete=«tel» включает
        // autofill из системных контактов — воркер с сохранённым в
        // Google Account телефоном получит быстрый tap-to-fill вместо
        // 11 нажатий каждый раз. enterKeyHint меняет лейбл клавиши
        // Enter на «Go», подталкивая к отправке формы.
        inputMode="tel"
        autoComplete="tel"
        enterKeyHint="go"
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoFocus={autoFocus}
        className={
          className ??
          "h-16 text-2xl font-semibold tracking-wider border-2 border-border rounded-2xl px-6 focus:border-primary focus:ring-primary focus:ring-2 transition-all bg-card shadow-sm"
        }
        value={empty && !focused ? "" : value}
        onChange={(e) => onChange(formatPhoneInput(e.target.value))}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          const cursor = (e.target as HTMLInputElement).selectionStart ?? 0;
          if (shouldBlockPhoneKey({ key: e.key, cursor })) {
            e.preventDefault();
          }
        }}
        onFocus={(e) => {
          setFocused(true);
          const input = e.currentTarget;
          if (shouldResetPhoneCursor(value)) {
            requestAnimationFrame(() => {
              if (input.isConnected && document.activeElement === input && shouldResetPhoneCursor(input.value)) {
                input.setSelectionRange(2, 2);
              }
            });
          }
        }}
      />
    );
  },
);
PhoneInput.displayName = "PhoneInput";
