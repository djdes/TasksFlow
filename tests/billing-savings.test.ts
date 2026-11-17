/** Выгода длинного срока на странице оплаты: процент и рубли против помесячной оплаты. */
import { describe, expect, it } from "vitest";
import { bestSavingsMonths, periodSavings, type PlanPrice } from "../shared/billing";

const prices: PlanPrice[] = [
  { plan: "team", months: 1, priceRub: 990 },
  { plan: "team", months: 3, priceRub: 2970 },
  { plan: "team", months: 6, priceRub: 5340 },
  { plan: "team", months: 12, priceRub: 9900 },
  { plan: "business", months: 12, priceRub: 30000 },
];

describe("periodSavings", () => {
  it("считает процент и рубли против месячной цены", () => {
    expect(periodSavings(prices, "team", 12)).toEqual({ percent: 16, rub: 1980 });
    expect(periodSavings(prices, "team", 6)).toEqual({ percent: 10, rub: 600 });
  });

  it("без выгоды и для одного месяца — ничего", () => {
    expect(periodSavings(prices, "team", 3)).toBeNull();
    expect(periodSavings(prices, "team", 1)).toBeNull();
  });

  it("без месячной цены не сравнивает", () => {
    expect(periodSavings(prices, "business", 12)).toBeNull();
  });

  it("длинный срок дороже месячного — выгоды нет", () => {
    expect(periodSavings([{ plan: "team", months: 1, priceRub: 100 }, { plan: "team", months: 12, priceRub: 1300 }], "team", 12)).toBeNull();
  });

  it("акция в процентах: процент тот же, рубли меньше", () => {
    const promo = (rub: number) => rub - Math.round(rub * 0.2);
    expect(periodSavings(prices, "team", 12, promo)).toEqual({ percent: 16, rub: 1584 });
  });

  it("лучший срок — с наибольшим процентом", () => {
    expect(bestSavingsMonths(prices, "team")).toBe(12);
    expect(bestSavingsMonths(prices, "business")).toBeNull();
  });
});
