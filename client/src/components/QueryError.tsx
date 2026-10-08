import { Button } from "@/components/ui/button";
import { WifiOff } from "lucide-react";

export function QueryError({ onRetry, message = "Не удалось загрузить данные. Проверьте соединение и попробуйте ещё раз." }: { onRetry: () => void; message?: string }) {
  return <div className="content-panel text-center space-y-4" role="alert">
    <WifiOff className="h-7 w-7 mx-auto text-muted-foreground" />
    <p className="text-sm text-muted-foreground">{message}</p>
    <Button variant="outline" onClick={onRetry}>Повторить</Button>
  </div>;
}
