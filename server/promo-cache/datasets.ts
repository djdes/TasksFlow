/**
 * Доменные JSON-снимки БД для публичных страниц продвижения TasksFlow:
 *   • billing-prices.json   — цены платных тарифов для главной, JSON-LD и /llms-full.txt
 *   • price-promotions.json — все включённые акции (фильтр startsAt..endsAt в памяти)
 *   • public-banners.json   — все включённые промо-баннеры (фильтр placement + startsAt..endsAt в памяти)
 *
 * Плюс файловые снимки контента (blog-index.json, blog-posts.json, legal-docs.json),
 * чтобы не держать 120+ HTML-статей в куче Node.js.
 */
import { asc, desc, eq } from "drizzle-orm";
import {
  banners,
  billingPrices,
  pricePromotions,
  type Banner,
} from "@shared/schema";
import {
  DEFAULT_PRICES,
  isPaidPlan,
  type BillingMonths,
  type PlanPrice,
  type PricePromotion,
} from "@shared/billing";
import { logger } from "../logger";
import { warmBlogSnapshots } from "../blog";
import { warmLegalSnapshots } from "../public-data";
import {
  getDatasetFileStatus,
  getOrBuildPromoSnapshot,
  resolvePromoCacheDir,
  writePromoSnapshotAtomic,
  type PromoDatasetFileStatus,
} from "./store";

export type PromoDbDatasetName = "billing-prices" | "price-promotions" | "public-banners";

export const ALL_PROMO_DATASETS = [
  "billing-prices",
  "price-promotions",
  "public-banners",
  "blog-index",
  "blog-posts",
  "legal-docs",
] as const;

const isMonths = (n: number): n is BillingMonths => n === 1 || n === 3 || n === 6 || n === 12;

function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return (e?.code ?? e?.cause?.code) === "ER_NO_SUCH_TABLE";
}

async function queryBillingPricesFromDb(): Promise<PlanPrice[]> {
  try {
    const { db } = await import("../db");
    const rows = await db.select().from(billingPrices);
    return rows
      .filter((r) => isPaidPlan(r.plan) && isMonths(r.months) && r.priceRub > 0)
      .map((r) => ({
        plan: r.plan as PlanPrice["plan"],
        months: r.months as BillingMonths,
        priceRub: r.priceRub,
      }));
  } catch (err) {
    if (isMissingTableError(err)) {
      return DEFAULT_PRICES.map((p) => ({ ...p }));
    }
    throw err;
  }
}

async function queryPricePromotionsFromDb(): Promise<PricePromotion[]> {
  try {
    const { db } = await import("../db");
    // Сохраняем все включённые акции вместе с будущим startsAt и endsAt:
    // границы окна проверяет pickPromotion(..., nowSec) в памяти без SQL.
    const rows = await db
      .select()
      .from(pricePromotions)
      .where(eq(pricePromotions.active, true))
      .orderBy(desc(pricePromotions.id))
      .limit(200);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      percent: r.discountPercent,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
    }));
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

async function queryPublicBannersFromDb(): Promise<Banner[]> {
  try {
    const { db } = await import("../db");
    return await db
      .select()
      .from(banners)
      .where(eq(banners.active, true))
      .orderBy(asc(banners.position), desc(banners.createdAt));
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

export async function getPromoPrices(env: NodeJS.ProcessEnv = process.env): Promise<PlanPrice[]> {
  return getOrBuildPromoSnapshot("billing-prices", queryBillingPricesFromDb, { env });
}

export async function getPromoPromotions(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PricePromotion[]> {
  return getOrBuildPromoSnapshot("price-promotions", queryPricePromotionsFromDb, { env });
}

export async function getPromoBannersAll(env: NodeJS.ProcessEnv = process.env): Promise<Banner[]> {
  return getOrBuildPromoSnapshot("public-banners", queryPublicBannersFromDb, { env });
}

export function filterActiveBanners(
  list: readonly Banner[],
  placement: "top" | "content",
  nowSec = Math.floor(Date.now() / 1000),
): Banner[] {
  return list.filter(
    (b) =>
      b.active &&
      (b.placement === placement || b.placement === "both") &&
      (b.startsAt == null || b.startsAt <= nowSec) &&
      (b.endsAt == null || b.endsAt >= nowSec),
  );
}

export async function getPublicBannersForPlacement(
  placement: "top" | "content",
  nowSec = Math.floor(Date.now() / 1000),
  env: NodeJS.ProcessEnv = process.env,
): Promise<Banner[]> {
  const all = await getPromoBannersAll(env);
  return filterActiveBanners(all, placement, nowSec);
}

export async function getPublicBannersBothPlacementsSafe(
  nowSec = Math.floor(Date.now() / 1000),
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ top: Banner[]; content: Banner[] }> {
  try {
    const all = await getPromoBannersAll(env);
    return {
      top: filterActiveBanners(all, "top", nowSec),
      content: filterActiveBanners(all, "content", nowSec),
    };
  } catch {
    return { top: [], content: [] };
  }
}

export async function refreshPromoDataset(
  dataset: PromoDbDatasetName,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  switch (dataset) {
    case "billing-prices": {
      const prices = await queryBillingPricesFromDb();
      await writePromoSnapshotAtomic("billing-prices", prices, { env });
      return;
    }
    case "price-promotions": {
      const promotions = await queryPricePromotionsFromDb();
      await writePromoSnapshotAtomic("price-promotions", promotions, { env });
      return;
    }
    case "public-banners": {
      const activeBanners = await queryPublicBannersFromDb();
      await writePromoSnapshotAtomic("public-banners", activeBanners, { env });
      return;
    }
  }
}

/** Нефатальное обновление снимка после правок в админке: сбой диска/БД не роняет основной ответ. */
export async function refreshPromoDatasetSafe(
  dataset: PromoDbDatasetName,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  try {
    await refreshPromoDataset(dataset, env);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err), dataset },
      "[promo-cache] не удалось обновить JSON-снимок",
    );
  }
}

export async function refreshAllPromoDatasets(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ cacheDir: string; datasets: PromoDatasetFileStatus[] }> {
  warmBlogSnapshots(env);
  warmLegalSnapshots(env);
  await Promise.all([
    refreshPromoDataset("billing-prices", env),
    refreshPromoDataset("price-promotions", env),
    refreshPromoDataset("public-banners", env),
  ]);
  return getPromoCacheStatus(env);
}

export function getPromoCacheStatus(
  env: NodeJS.ProcessEnv = process.env,
): { cacheDir: string; datasets: PromoDatasetFileStatus[] } {
  return {
    cacheDir: resolvePromoCacheDir(env),
    datasets: ALL_PROMO_DATASETS.map((name) => getDatasetFileStatus(name, env)),
  };
}
