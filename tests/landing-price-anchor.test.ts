/**
 * Якорь цены на лендинге: «≈ 33 ₽ за сотрудника, если вас 30» и выгода длинного срока.
 */
import { describe, expect, it } from "vitest";
import { perSeatRub, planPriceExtras, type PlanPrice } from "../shared/billing";

describe("perSeatRub", () => {
  it("делит месячную цену на потолок тарифа с округлением вверх", () => {
    expect(perSeatRub(990, 30)).toBe(33);
    expect(perSeatRub(1000, 30)).toBe(34);
  });
  it("без потолка или без цены — нет якоря", () => {
    expect(perSeatRub(990, null)).toBeNull();
    expect(perSeatRub(0, 30)).toBeNull();
  });
});

describe("planPriceExtras", () => {
  const monthly: PlanPrice[] = [{ plan: "team", months: 1, priceRub: 990 }];
  it("только месячная цена — одна подпись за сотрудника", () => {
    expect(planPriceExtras(monthly, "team", 990)).toEqual(["≈ 33\u00a0₽ за сотрудника, если вас 30"]);
  });
  it("с акцией якорь считается от цены со скидкой", () => {
    expect(planPriceExtras(monthly, "team", 792)).toEqual(["≈ 27\u00a0₽ за сотрудника, если вас 30"]);
  });
  it("годовая оплата дешевле — показывает лучшую выгоду срока", () => {
    const prices: PlanPrice[] = [...monthly, { plan: "team", months: 12, priceRub: 9_900 }];
    expect(planPriceExtras(prices, "team", 990)).toEqual([
      "≈ 33\u00a0₽ за сотрудника, если вас 30",
      "−16 % при оплате за 12 месяцев",
    ]);
  });
  it("Премиум без потолка — без якоря за сотрудника", () => {
    expect(planPriceExtras([{ plan: "business", months: 1, priceRub: 4_990 }], "business", 4_990)).toEqual([]);
  });
});
