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
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors max-md:h-[26px] max-md:w-[26px] max-md:rounded-lg",
        checked ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40",
        disabled && "opacity-50",
        className,
      )}
    >
      {checked && <Check className="h-3.5 w-3.5 max-md:h-[18px] max-md:w-[18px]" strokeWidth={3} />}
    </span>
  );
}
