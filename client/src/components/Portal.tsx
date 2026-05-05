import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Рендерит детей в `document.body`, минуя `#root` scroll-контейнер.
 *
 * Зачем: в TasksFlow `#root` имеет `position: fixed; overflow-y: auto`
 * (паттерн против pull-to-refresh браузера). Это превращает root в
 * собственный scroll-контейнер, и любой `position: fixed` ВНУТРИ
 * него ведёт себя как `absolute` — прибивается к низу контента,
 * а не к viewport'у. Модалки и FAB-кнопки в результате «уезжают»
 * вниз страницы.
 *
 * Portal в body решает проблему: дети рендерятся ВНЕ #root, и
 * их `position: fixed` снова работает относительно viewport'а.
 *
 * SSR-safe: на сервере `document` нет → возвращаем null до hydrate.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
