import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { RefreshCw } from "lucide-react";
import { generatePin, PIN_LENGTH } from "@shared/pin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = Omit<ComponentPropsWithoutRef<"input">, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

/**
 * PIN сотрудника глазами руководителя: цифры видны — их нужно сообщить
 * сотруднику. «Придумать» подставляет случайный непростой PIN.
 * Остальные props (id, aria-*) уходят в само поле — так его связывает
 * FormControl.
 */
export const AdminPinField = forwardRef<HTMLInputElement, Props>(function AdminPinField(
  { value, onChange, disabled, className, ...inputProps },
  ref,
) {
  return (
    <div className="flex items-center gap-2">
      <Input
        ref={ref}
        {...inputProps}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        maxLength={PIN_LENGTH}
        placeholder="····"
        disabled={disabled}
        className={`h-11 w-28 text-center font-mono text-xl tracking-[0.35em] tabular-nums ${className ?? ""}`}
      />
      <Button
        type="button"
        variant="outline"
        className="h-11"
        disabled={disabled}
        onClick={() => onChange(generatePin())}
      >
        <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" />
        Придумать
      </Button>
    </div>
  );
});
