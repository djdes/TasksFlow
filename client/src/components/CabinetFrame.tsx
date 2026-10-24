import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { CommandPalette } from "@/components/CommandPalette";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { isTypingTarget } from "@/hooks/use-keyboard-shortcuts";
import { usePermissions } from "@/hooks/use-permissions";
import { isCabinetPath } from "@/lib/cabinet-nav";

/** Открыто окно, меню или выпадающий список — клавиши принадлежат ему. */
const OVERLAY = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

/**
 * Можно ли перехватить одиночную клавишу: человек не печатает, не стоит
 * на элементе формы (галочка, переключатель, выбор из списка — это кнопки)
 * и не заполняет форму — иначе N унёс бы его с несохранённых правок.
 */
function freeForShortcut(target: EventTarget | null, path: string): boolean {
  if (document.querySelector(OVERLAY) || isTypingTarget(target)) return false;
  if (/\/(new|edit)$/.test(path)) return false;
  return !(target instanceof Element && target.closest('form, [role="checkbox"], [role="switch"], [role="radio"], [role="combobox"], [role="slider"]'));
}

/**
 * Каркас кабинета: на ПК меню слева во всю высоту, справа — страница; на
 * телефоне — только страница (меню в шапке). Горячие клавиши: Ctrl+K / ⌘K —
 * быстрый переход, N — новая задача (тем, кто их ставит).
 */
export function CabinetFrame({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { canManageTasks } = usePermissions();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const inCabinet = !!user && isCabinetPath(location);

  useEffect(() => {
    if (!inCabinet) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === "KeyK") {
        // Поверх другого окна не открываем: две ловушки фокуса подряд.
        const otherOverlay = Array.from(document.querySelectorAll(OVERLAY)).some((el) => !el.closest(".command-palette"));
        if (otherOverlay) return;
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      // По коду клавиши, а не символу: работает и в русской раскладке («Т»).
      if (event.code === "KeyN" && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && canManageTasks && freeForShortcut(event.target, location)) {
        event.preventDefault();
        setLocation("/tasks/new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inCabinet, canManageTasks, location, setLocation]);

  // Обёртка одна и та же с меню и без: когда сессия догрузилась и меню
  // появилось, страница не пересоздаётся.
  return (
    <div className="cabinet-frame" data-cabinet-frame={inCabinet || undefined}>
      {inCabinet && <AppSidebar onOpenPalette={() => setPaletteOpen(true)} />}
      {/* Своя «защита» у страницы: если она упала, меню остаётся — можно
          уйти в другой раздел; смена адреса сбрасывает ошибку. */}
      <div className="cabinet-main">
        <ErrorBoundary key={location}>{children}</ErrorBoundary>
      </div>
      {inCabinet && <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />}
    </div>
  );
}
