import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useSite } from "../site";
import type { PublicBannerItem } from "../types";
import { Countdown } from "./Countdown";

const dismissKey = (id: number) => "tf_banner_dismiss_" + id;

function pickUndismissed(list: PublicBannerItem[]): PublicBannerItem | null {
  return (
    list.find((b) => {
      try {
        return localStorage.getItem(dismissKey(b.id)) !== "1";
      } catch {
        return true;
      }
    }) ?? null
  );
}

/**
 * Узкая промо-полоса над шапкой. Берёт предзагруженный SSR-список баннеров
 * из `window.__SSR_SITE__.banners.top` (0 клиентских запросов и 0 SQL),
 * а если его нет — запрашивает `/api/banners?placement=top` (тоже из JSON-снимка).
 */
export function TopBanner() {
  const { banners } = useSite();
  const [banner, setBanner] = useState<PublicBannerItem | null>(null);

  useEffect(() => {
    if (banners && Array.isArray(banners.top)) {
      setBanner(pickUndismissed(banners.top));
      return;
    }

    let alive = true;
    fetch("/api/banners?placement=top")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: PublicBannerItem[]) => {
        if (!alive || !Array.isArray(list)) return;
        const fresh = pickUndismissed(list);
        if (fresh) setBanner(fresh);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [banners]);

  if (!banner) return null;

  const dismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      localStorage.setItem(dismissKey(banner.id), "1");
    } catch {
      // приватный режим — просто закроем на эту сессию
    }
    setBanner(null);
  };

  const custom = !!(banner.bgColor || banner.textColor);
  const style = custom
    ? { background: banner.bgColor || undefined, color: banner.textColor || undefined }
    : undefined;

  const content = (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
      <span>{banner.text}</span>
      <Countdown
        endsAt={banner.endsAt}
        className="rounded-full bg-black/15 px-2 py-0.5 font-semibold whitespace-nowrap"
      />
      {banner.linkUrl && banner.linkLabel && (
        <span className="font-semibold underline underline-offset-2 whitespace-nowrap">
          {banner.linkLabel} →
        </span>
      )}
    </span>
  );

  return (
    <div
      className={
        "relative z-[51] text-sm font-medium" +
        (custom ? "" : " bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 text-white")
      }
      style={style}
      role="region"
      aria-label="Промо-баннер"
    >
      {banner.linkUrl ? (
        <a href={banner.linkUrl} className="block px-10 py-2.5 text-center hover:opacity-95 transition">
          {content}
        </a>
      ) : (
        <div className="px-10 py-2.5 text-center">{content}</div>
      )}
      <button
        onClick={dismiss}
        aria-label="Закрыть баннер"
        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-black/15 transition"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
