import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Галочка для строки-кнопки выбора (сотрудник, строка журнала). Только
 * рисунок: radix Checkbox — сам <button>, а <button> внутри <button>
 * даёт бесконечный цикл обновлений («Maximum update depth») и роняет
 * окно. Строке нужны role="checkbox" и aria-checked.
 */
export function CheckMark({ checked, disabled = false, className }: { checked: boolean; disabled?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
        checked ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40",
        disabled && "opacity-50",
        className,
      )}
    >
      {checked && <Check className="h-3 w-3" />}
    </span>
  );
}
