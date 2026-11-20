import { createContext, useContext } from "react";
import { DEFAULT_CONTACT_EMAIL } from "./legal";
import type { PublicBannerItem, SiteConfig } from "./types";

/**
 * Настройки сайта, общие для всех публичных страниц: контактный email,
 * счётчики аналитики, признак сессии и предзагруженные баннеры. Сервер кладёт
 * их в window.__SSR_SITE__, клиент гидрирует с тем же значением.
 */
export const DEFAULT_SITE: SiteConfig = {
  contactEmail: DEFAULT_CONTACT_EMAIL,
  analytics: { ym: null, ga: null },
};

const SiteContext = createContext<SiteConfig>(DEFAULT_SITE);

export const SiteProvider = SiteContext.Provider;

export function useSite(): SiteConfig {
  return useContext(SiteContext);
}

/** Приводит то, что пришло из window/props, к полному SiteConfig. */
export function normalizeSite(raw: unknown): SiteConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<SiteConfig>;
  const a = (r.analytics ?? {}) as Partial<SiteConfig["analytics"]>;
  const b = r.banners && typeof r.banners === "object" ? r.banners : null;
  const hasBanners = Boolean(b && Array.isArray(b.top) && Array.isArray(b.content));

  return {
    contactEmail: typeof r.contactEmail === "string" && r.contactEmail ? r.contactEmail : DEFAULT_CONTACT_EMAIL,
    analytics: {
      ym: typeof a.ym === "string" && a.ym ? a.ym : null,
      ga: typeof a.ga === "string" && a.ga ? a.ga : null,
    },
    ...(r.authenticated === true ? { authenticated: true } : {}),
    ...(hasBanners
      ? {
          banners: {
            top: (b!.top as PublicBannerItem[]) ?? [],
            content: (b!.content as PublicBannerItem[]) ?? [],
          },
        }
      : {}),
  };
}
