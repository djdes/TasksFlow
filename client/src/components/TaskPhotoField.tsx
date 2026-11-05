import { useId, useRef } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * «Фото к задаче» в создании, копировании и правке: прикрепить снимок, что и
 * как сделать. Не связано с «фото результата» — то сотрудник присылает сам.
 * Файл не загружается здесь: форма отправит его после создания задачи.
 */
export function TaskPhotoField({
  previewUrl,
  onPick,
  onRemove,
  busy = false,
  footer,
}: {
  previewUrl: string | null;
  onPick: (file: File) => void;
  onRemove: () => void;
  busy?: boolean;
  /** Под превью: например, «Сохранить фото» в правке задачи. */
  footer?: React.ReactNode;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2" data-testid="task-photo-field">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ImagePlus className="h-4 w-4" aria-hidden />
        Фото к задаче
      </div>
      <p className="text-xs text-muted-foreground">
        Необязательно. Покажите, что и как сделать — сотрудник увидит фото, открыв задачу.
      </p>
      {previewUrl ? (
        <div className="space-y-2">
          <div className="relative inline-block">
            <img src={previewUrl} alt="Фото к задаче" className="h-32 w-32 rounded-lg border border-border object-cover" />
            <button
              type="button"
              onClick={() => { onRemove(); if (inputRef.current) inputRef.current.value = ""; }}
              disabled={busy}
              aria-label="Убрать фото"
              className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {footer}
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPick(file);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()} className="gap-2">
            <ImagePlus className="h-4 w-4" aria-hidden />
            Прикрепить фото
          </Button>
        </>
      )}
    </div>
  );
}
