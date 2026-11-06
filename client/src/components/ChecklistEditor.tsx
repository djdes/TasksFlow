import { Camera, CameraOff, Plus, X } from "lucide-react";
import type { ChecklistItem } from "@shared/schema";
import { itemNeedsPhoto } from "@shared/checklist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const MAX_CHECKLIST_ITEMS = 30;

/** Пункт в форме: заголовок и нужно ли фото; done и фото — у существующих пунктов. */
export type ChecklistDraftItem = {
  id: string;
  title: string;
  requiresPhoto: boolean;
  done?: boolean;
  photoUrls?: string[];
};

export function newChecklistId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Пункты задачи → черновик формы (правка сохраняет done и фото по id). */
export function checklistDraftFrom(items: readonly ChecklistItem[] | null | undefined): ChecklistDraftItem[] {
  return (items ?? []).map((it) => ({
    id: it.id,
    title: it.title,
    requiresPhoto: itemNeedsPhoto(it),
    done: Boolean(it.done),
    photoUrls: it.photoUrls ?? [],
  }));
}

/**
 * Черновик → checklist для API: только непустые пункты. Новые пункты
 * стартуют невыполненными; у существующих done и фото сохраняются. Если у
 * пункта сняли «нужно фото» — отметка остаётся; если включили, а фото нет —
 * пункт снова ждёт фото.
 */
export function checklistPayload(items: readonly ChecklistDraftItem[]): ChecklistItem[] | null {
  const out = items
    .map((it) => {
      const photoUrls = it.photoUrls ?? [];
      const done = Boolean(it.done) && (!it.requiresPhoto || photoUrls.length > 0);
      return { id: it.id, title: it.title.trim(), done, photoUrls, requiresPhoto: it.requiresPhoto };
    })
    .filter((it) => it.title.length > 0);
  return out.length > 0 ? out : null;
}

/**
 * Подзадачи (чек-лист) в форме создания и правки: заголовки, добавить,
 * удалить и «нужно фото» у каждого пункта. Фото — только там, где без него
 * не проверить; остальное сотрудник отметит касанием.
 */
export function ChecklistEditor({
  items,
  onChange,
}: {
  items: ChecklistDraftItem[];
  onChange: (next: ChecklistDraftItem[]) => void;
}) {
  const update = (id: string, patch: Partial<ChecklistDraftItem>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  const withPhoto = items.filter((it) => it.title.trim() && it.requiresPhoto).length;
  const filled = items.filter((it) => it.title.trim()).length;

  return (
    <div className="checklist-editor" data-testid="checklist-editor">
      {items.map((it, i) => {
        const photoLabel = it.requiresPhoto
          ? `Пункт ${i + 1}: нужно фото. Нажмите, чтобы отмечать без фото`
          : `Пункт ${i + 1}: без фото. Нажмите, чтобы требовать фото`;
        return (
          <div key={it.id} className="checklist-editor-row">
            <span className="checklist-editor-num" aria-hidden="true">{i + 1}</span>
            <Input
              value={it.title}
              onChange={(e) => update(it.id, { title: e.target.value })}
              placeholder="Пункт"
              maxLength={200}
              className="things-input flex-1 min-w-0"
              aria-label={`Пункт ${i + 1}`}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => update(it.id, { requiresPhoto: !it.requiresPhoto })}
              aria-pressed={it.requiresPhoto}
              aria-label={photoLabel}
              title={it.requiresPhoto ? "Нужно фото" : "Без фото — отметка касанием"}
              data-testid="checklist-photo-toggle"
              className={cn(
                "checklist-editor-btn shrink-0",
                it.requiresPhoto
                  ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
                  : "text-muted-foreground",
              )}
            >
              {it.requiresPhoto ? <Camera className="w-4 h-4" aria-hidden="true" /> : <CameraOff className="w-4 h-4" aria-hidden="true" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(items.filter((x) => x.id !== it.id))}
              aria-label={`Удалить пункт ${i + 1}`}
              className="checklist-editor-btn shrink-0 text-muted-foreground hover:text-destructive"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        onClick={() => onChange([...items, { id: newChecklistId(), title: "", requiresPhoto: true }])}
        className="checklist-editor-add"
        disabled={items.length >= MAX_CHECKLIST_ITEMS}
      >
        <Plus className="w-5 h-5" aria-hidden="true" />
        Добавить пункт
      </Button>
      {/* Легенда значков вместо абзаца: камера — пункт закрывается фото, перечёркнутая — касанием. */}
      {items.length > 0 && (
        <p className="checklist-editor-legend">
          <span><Camera aria-hidden="true" /> с фото</span>
          <span><CameraOff aria-hidden="true" /> без фото</span>
          {filled > 0 ? <span className="sr-only">{`С фото: ${withPhoto} из ${filled}.`}</span> : null}
        </p>
      )}
    </div>
  );
}
