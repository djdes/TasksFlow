import { useEffect, useState } from "react";
import { useSite } from "../site";
import type { PublicBannerItem } from "../types";
import { Countdown } from "./Countdown";

/**
 * Баннер-вставка в контент. Использует предзагруженный в SSR список
 * `window.__SSR_SITE__.banners.content` (0 клиентских fetch и 0 SQL),
 * при отсутствии обращается к `/api/banners?placement=content` (JSON-снимок).
 */
export function ContentBanner({ className = "" }: { className?: string }) {
  const { banners } = useSite();
  const [banner, setBanner] = useState<PublicBannerItem | null>(null);

  useEffect(() => {
    if (banners && Array.isArray(banners.content)) {
      setBanner(banners.content[0] ?? null);
      return;
    }

    let alive = true;
    fetch("/api/banners?placement=content")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: PublicBannerItem[]) => {
        if (alive && Array.isArray(list) && list[0]) setBanner(list[0]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [banners]);

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
