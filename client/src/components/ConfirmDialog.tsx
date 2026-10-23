import { useEffect, useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Подтверждение действия на общем Dialog (desktop — окно, mobile — шторка)
 * вместо нативного confirm(): тот не стилизуется, не виден в тёмной теме
 * и на телефоне выглядит как системная ошибка.
 *
 * confirmWord — для необратимых действий: кнопка активна только после
 * ввода слова (например «УДАЛИТЬ»).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Отмена",
  destructive = false,
  confirmWord,
  busy = false,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirmWord?: string;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  /** Вторая кнопка делает что-то своё, а не просто закрывает окно. */
  onCancel?: () => void;
  children?: ReactNode;
}) {
  const inputId = useId();
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);
  const wordOk = !confirmWord || typed.trim().toUpperCase() === confirmWord.toUpperCase();

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="confirm-dialog">
        <DialogTitle className="text-lg font-semibold pr-8">{title}</DialogTitle>
        {description ? (
          <DialogDescription asChild>
            <div className="confirm-dialog-text">{description}</div>
          </DialogDescription>
        ) : null}
        {children}
        {confirmWord ? (
          <div className="grid gap-2">
            <label htmlFor={inputId} className="text-sm text-muted-foreground">
              Чтобы подтвердить, введите <b className="text-foreground">{confirmWord}</b>
            </label>
            <Input
              id={inputId}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === "Enter" && wordOk && !busy) onConfirm();
              }}
            />
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <div className="confirm-dialog-actions">
          <Button type="button" variant="outline" onClick={onCancel ?? (() => onOpenChange(false))} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={!wordOk}
            loading={busy}
            loadingLabel="Подождите…"
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
