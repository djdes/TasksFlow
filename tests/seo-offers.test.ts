import { describe, expect, it } from "vitest";
import { softwareApplicationLd } from "../client/src/public/seo";

describe("softwareApplicationLd: тарифы в разметке", () => {
  it("бесплатный + платные по месячной цене", () => {
    const ld = softwareApplicationLd("https://tasksflow.ru", [
      { plan: "team", months: 1, priceRub: 990 },
      { plan: "business", months: 1, priceRub: 2990 },
    ]) as any;
    expect(ld.offers["@type"]).toBe("AggregateOffer");
    expect(ld.offers.lowPrice).toBe("0");
    expect(ld.offers.highPrice).toBe("2990");
    expect(ld.offers.offerCount).toBe(3);
    expect(ld.offers.offers.map((o: any) => o.name)).toEqual(["Бесплатный", "Стандарт", "Премиум"]);
  });
  it("без месячной цены остаётся один бесплатный Offer", () => {
    const ld = softwareApplicationLd("https://tasksflow.ru", [{ plan: "team", months: 12, priceRub: 9000 }]) as any;
    expect(ld.offers["@type"]).toBe("Offer");
    expect(ld.offers.price).toBe("0");
  });
});
