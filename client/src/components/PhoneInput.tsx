import { Input } from "@/components/ui/input";
import { forwardRef } from "react";
import { formatPhoneInput, shouldBlockPhoneKey } from "@/lib/phone-input-format";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
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
  ({ value, onChange, placeholder = "xxx xxx xx xx", className, autoFocus }, ref) => {
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
        autoFocus={autoFocus}
        className={
          className ??
          "h-16 text-2xl font-semibold tracking-wider border-2 border-border rounded-2xl px-6 focus:border-primary focus:ring-primary focus:ring-2 transition-all bg-card shadow-sm"
        }
        value={value}
        onChange={(e) => onChange(formatPhoneInput(e.target.value))}
        onKeyDown={(e) => {
          const cursor = (e.target as HTMLInputElement).selectionStart ?? 0;
          if (shouldBlockPhoneKey({ key: e.key, cursor })) {
            e.preventDefault();
          }
        }}
        onFocus={(e) => {
          if (value === "+7" || value === "") {
            setTimeout(() => e.currentTarget.setSelectionRange(2, 2), 0);
          }
        }}
      />
    );
  },
);
PhoneInput.displayName = "PhoneInput";
