import { useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export type ViewerPhoto = { url: string; label?: string };

const SWIPE_MIN_PX = 48;

/**
 * Полноэкранный просмотр фото: стрелки, ←/→ и свайп. На Radix Dialog,
 * чтобы были ловушка фокуса, Escape и возврат фокуса на миниатюру, —
 * а не самодельный fixed-оверлей. Не шторка: фото нужен весь экран.
 */
export function PhotoViewer({
  photos,
  index,
  open,
  onOpenChange,
  onIndexChange,
}: {
  photos: readonly ViewerPhoto[];
  index: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIndexChange: (index: number) => void;
}) {
  const count = photos.length;
  const safeIndex = count ? Math.min(Math.max(index, 0), count - 1) : 0;
  const current = photos[safeIndex];
  const closeRef = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);

  const go = (delta: number) => {
    if (count > 1) onIndexChange((safeIndex + delta + count) % count);
  };

  return (
    <DialogPrimitive.Root open={open && count > 0} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="photo-viewer-overlay" />
        <DialogPrimitive.Content
          className="photo-viewer"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            event.preventDefault();
            closeRef.current?.focus();
          }}
          // Без Dialog.Trigger Radix фокус не возвращает — возвращаем на
          // миниатюру или фото, с которого открыли просмотр.
          onCloseAutoFocus={(event) => {
            if (opener.current?.isConnected) {
              event.preventDefault();
              opener.current.focus({ preventScroll: true });
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
            if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
          }}
          onPointerDown={(event) => {
            if (event.pointerType === "mouse") return;
            swipe.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
          }}
          onPointerUp={(event) => {
            const start = swipe.current;
            swipe.current = null;
            if (!start || start.id !== event.pointerId) return;
            const dx = event.clientX - start.x;
            const dy = event.clientY - start.y;
            if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1);
          }}
          onPointerCancel={() => { swipe.current = null; }}
        >
          <DialogPrimitive.Title className="photo-viewer-title">
            <span>{current?.label ?? "Фото"}</span>
            {count > 1 ? <span className="photo-viewer-count">{safeIndex + 1} из {count}</span> : null}
          </DialogPrimitive.Title>
          <div className="photo-viewer-stage">
            {current ? (
              <img key={current.url} src={current.url} alt={current.label ?? `Фото ${safeIndex + 1}`} draggable={false} />
            ) : null}
          </div>
          {count > 1 ? (
            <>
              <button type="button" className="photo-viewer-nav photo-viewer-nav--prev" onClick={() => go(-1)} aria-label="Предыдущее фото">
                <ChevronLeft aria-hidden="true" />
              </button>
              <button type="button" className="photo-viewer-nav photo-viewer-nav--next" onClick={() => go(1)} aria-label="Следующее фото">
                <ChevronRight aria-hidden="true" />
              </button>
            </>
          ) : null}
          <DialogPrimitive.Close ref={closeRef} className="photo-viewer-close" aria-label="Закрыть просмотр">
            <X aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
