import { useEffect, useState } from "react";
import { Countdown } from "./Countdown";

type Banner = {
  id: number;
  text: string;
  linkUrl: string | null;
  linkLabel: string | null;
  bgColor: string | null;
  textColor: string | null;
  endsAt: number | null;
};

/**
 * Баннер-вставка в контент (та же акция, что и сверху, но крупным блоком).
 * Берёт первый активный баннер места показа "content" из /api/banners.
 * SSR безопасен: на сервере null, появляется после гидрации.
 */
export function ContentBanner({ className = "" }: { className?: string }) {
  const [banner, setBanner] = useState<Banner | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/banners?placement=content")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Banner[]) => {
        if (alive && Array.isArray(list) && list[0]) setBanner(list[0]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!banner) return null;

  const custom = !!(banner.bgColor || banner.textColor);
  const style = custom
    ? { background: banner.bgColor || undefined, color: banner.textColor || undefined }
    : undefined;

  return (
    <div
      className={
        "rounded-2xl px-6 py-5 sm:px-8 sm:py-6 flex flex-col sm:flex-row sm:items-center gap-4 shadow-lg " +
        (custom ? "" : "bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 text-white ") +
        className
      }
      style={style}
      role="region"
      aria-label="Промо-блок"
    >
      <div className="flex-1">
        <p className="text-base sm:text-lg font-semibold leading-snug">{banner.text}</p>
        <Countdown
          endsAt={banner.endsAt}
          className="mt-1 inline-block rounded-full bg-black/15 px-2.5 py-0.5 text-sm font-semibold whitespace-nowrap"
        />
      </div>
      {banner.linkUrl && (
        <a
          href={banner.linkUrl}
          className="shrink-0 inline-flex items-center justify-center rounded-full bg-white text-indigo-700 font-semibold px-6 py-2.5 hover:bg-white/90 transition"
        >
          {banner.linkLabel || "Подробнее"}
        </a>
      )}
    </div>
  );
}
