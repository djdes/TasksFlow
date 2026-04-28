import { Input } from "@/components/ui/input";
import { forwardRef } from "react";

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
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={
          className ??
          "h-16 text-2xl font-semibold tracking-wider border-2 border-border rounded-2xl px-6 focus:border-primary focus:ring-primary focus:ring-2 transition-all bg-card shadow-sm"
        }
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          const cleaned = v.replace(/^\+?7?/, "");
          let digits = cleaned.replace(/\D/g, "");
          if (digits.startsWith("7") && digits.length > 1) {
            digits = digits.slice(1);
          }
          const limited = digits.slice(0, 10);
          onChange("+7" + limited);
        }}
        onKeyDown={(e) => {
          if (e.key === "Backspace") {
            const cursor = (e.target as HTMLInputElement).selectionStart ?? 0;
            if (cursor <= 2) e.preventDefault();
          }
          if (e.key === "Delete") {
            const cursor = (e.target as HTMLInputElement).selectionStart ?? 0;
            if (cursor < 2) e.preventDefault();
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
