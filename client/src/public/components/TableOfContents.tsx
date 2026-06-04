import { useEffect, useRef, useState } from "react";

type TocItem = { id: string; text: string; level: number };

/**
 * Содержание статьи: закреплено при скролле (sticky), подсвечивает активный
 * раздел (scrollspy через IntersectionObserver) и двигает к нему бегущий
 * индикатор. SSR-безопасно: список рендерится на сервере с первым активным
 * пунктом, индикатор/обсервер включаются только на клиенте. Уважает
 * prefers-reduced-motion (transition выключается в CSS).
 */
export function TableOfContents({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Scrollspy: активный — самый верхний видимый заголовок.
  useEffect(() => {
    const headings = items
      .map((t) => document.getElementById(t.id))
      .filter((el): el is HTMLElement => !!el);
    if (!headings.length) return;

    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -65% 0px", threshold: [0, 1] },
    );
    headings.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, [items]);

  // Двигаем индикатор к активной ссылке.
  useEffect(() => {
    if (!navRef.current || !activeId) return;
    const el = navRef.current.querySelector<HTMLElement>(`[data-toc="${activeId}"]`);
    if (el) setIndicator({ top: el.offsetTop, height: el.offsetHeight });
  }, [activeId, items]);

  return (
    <div className="sticky top-24">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
        Содержание
      </div>
      <div ref={navRef} className="relative">
        {/* статичный трек */}
        <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded bg-border" aria-hidden="true" />
        {/* бегущий индикатор активного раздела */}
        {indicator && (
          <span
            className="toc-indicator absolute left-0 w-0.5 rounded bg-primary"
            style={{ top: indicator.top, height: indicator.height }}
            aria-hidden="true"
          />
        )}
        <nav className="flex flex-col text-sm">
          {items.map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              data-toc={t.id}
              onClick={() => setActiveId(t.id)}
              className={
                "block py-1.5 pr-1 transition-colors duration-200 " +
                (t.level === 3 ? "pl-7" : "pl-4") +
                (activeId === t.id
                  ? " text-primary font-semibold"
                  : " text-muted-foreground hover:text-foreground")
              }
            >
              {t.text}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
