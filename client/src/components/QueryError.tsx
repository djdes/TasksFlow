import { Button } from "@/components/ui/button";
import { WifiOff } from "lucide-react";

/**
 * Ошибка загрузки с повтором. compact — узкая плашка над уже показанным
 * содержимым (например, не загрузились имена сотрудников, а задачи видны).
 */
export function QueryError({ onRetry, message = "Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз.", compact = false }: { onRetry: () => void; message?: string; compact?: boolean }) {
  if (compact) {
    return <div className="query-error-compact" role="alert">
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>Повторить</Button>
    </div>;
  }
  return <div className="content-panel text-center space-y-4" role="alert">
    <WifiOff className="h-7 w-7 mx-auto text-muted-foreground" />
    <p className="text-sm text-muted-foreground">{message}</p>
    <Button variant="outline" onClick={onRetry}>Повторить</Button>
  </div>;
}
