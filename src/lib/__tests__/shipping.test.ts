import { describe, it, expect } from "vitest";
import { computeShipping, shipmentCount } from "@/lib/shipping";

const item = (p: any) => ({
  quantity: 1,
  product: {
    delivery_group: "small",
    ...p,
  },
});

describe("computeShipping — merge_delivery toggle", () => {
  it("returns 0 for empty/nullish input", () => {
    expect(computeShipping([])).toBe(0);
    expect(computeShipping(null as any)).toBe(0);
    expect(computeShipping(undefined as any)).toBe(0);
  });

  it("merge=ON items share one shipment (MAX wins)", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 3000, merge_delivery: true }),
        item({ id: "B", shipping_iqd: 5000, merge_delivery: true }),
        item({ id: "C", shipping_iqd: 2000, merge_delivery: true }),
      ]),
    ).toBe(5000);
  });

  it("merge=OFF items are independent (each billed alone)", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 3000, merge_delivery: false }),
        item({ id: "B", shipping_iqd: 5000, merge_delivery: false }),
      ]),
    ).toBe(3000 + 5000);
  });

  it("mixed: merge=ON group + merge=OFF independents", () => {
    // merged bucket MAX = 5000 ; two independents 4000 + 6000
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 3000, merge_delivery: true }),
        item({ id: "B", shipping_iqd: 5000, merge_delivery: true }),
        item({ id: "C", shipping_iqd: 4000, merge_delivery: false }),
        item({ id: "D", shipping_iqd: 6000, merge_delivery: false }),
      ]),
    ).toBe(5000 + 4000 + 6000);
  });

  it("merge_delivery missing/undefined/null defaults to ON (merges)", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 3000 }),
        item({ id: "B", shipping_iqd: 5000, merge_delivery: undefined }),
        item({ id: "C", shipping_iqd: 2000, merge_delivery: null }),
      ]),
    ).toBe(5000);
  });

  it("items without delivery group are independent (each billed alone)", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 3000, delivery_group: null }),
        item({ id: "B", shipping_iqd: 5000, delivery_group: "" }),
      ]),
    ).toBe(3000 + 5000);
  });

  it("coerces bad shipping_iqd to 0", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: null, merge_delivery: true }),
        item({ id: "B", shipping_iqd: "abc", merge_delivery: true }),
        item({ id: "C", shipping_iqd: -100, merge_delivery: true }),
        item({ id: "D", shipping_iqd: "4000", merge_delivery: true }),
      ]),
    ).toBe(4000);
  });

  it("ignores null/undefined products", () => {
    expect(
      computeShipping([
        { product: null } as any,
        { product: undefined } as any,
        item({ id: "A", shipping_iqd: 2500, merge_delivery: true }),
      ]),
    ).toBe(2500);
  });

  it("order-independent", () => {
    const a = computeShipping([
      item({ id: "A", shipping_iqd: 1000, merge_delivery: true }),
      item({ id: "B", shipping_iqd: 5000, merge_delivery: false }),
    ]);
    const b = computeShipping([
      item({ id: "B", shipping_iqd: 5000, merge_delivery: false }),
      item({ id: "A", shipping_iqd: 1000, merge_delivery: true }),
    ]);
    expect(a).toBe(1000 + 5000);
    expect(b).toBe(1000 + 5000);
  });
});

describe("shipmentCount", () => {
  it("returns 0 for empty/nullish", () => {
    expect(shipmentCount([])).toBe(0);
    expect(shipmentCount(null as any)).toBe(0);
  });

  it("all merge=ON → 1 shipment", () => {
    expect(
      shipmentCount([
        item({ id: "A", shipping_iqd: 3000, merge_delivery: true }),
        item({ id: "B", shipping_iqd: 5000, merge_delivery: true }),
      ]),
    ).toBe(1);
  });

  it("each merge=OFF adds a shipment", () => {
    expect(
      shipmentCount([
        item({ id: "A", shipping_iqd: 3000, merge_delivery: true }),
        item({ id: "B", shipping_iqd: 5000, merge_delivery: true }),
        item({ id: "C", shipping_iqd: 4000, merge_delivery: false }),
        item({ id: "D", shipping_iqd: 6000, merge_delivery: false }),
      ]),
    ).toBe(3); // merged bucket + C + D
  });
});

describe("Delivery Groups and Merging Rules", () => {
  it("two large bumpers merging with large: share one delivery fee (MAX)", () => {
    const items = [
      item({ id: "B1", shipping_iqd: 35000, delivery_group: "large", merge_with_groups: ["large"] }),
      item({ id: "B2", shipping_iqd: 35000, delivery_group: "large", merge_with_groups: ["large"] }),
    ];
    expect(computeShipping(items)).toBe(35000);
    expect(shipmentCount(items)).toBe(1);
  });

  it("two large doors not merging with large: each is billed independently (35k + 35k = 70k)", () => {
    const items = [
      item({ id: "D1", shipping_iqd: 35000, delivery_group: "large", merge_with_groups: [] }),
      item({ id: "D2", shipping_iqd: 35000, delivery_group: "large", merge_with_groups: [] }),
    ];
    expect(computeShipping(items)).toBe(70000);
    expect(shipmentCount(items)).toBe(2);
  });

  it("bumper + filter shoteh + filter tabreed + draim shaft = 41k (filters taped to bumper, draim shaft separate)", () => {
    const items = [
      item({ id: "bumper", shipping_iqd: 35000, delivery_group: "large", merge_with_groups: ["large"] }),
      item({ id: "filter_shoteh", shipping_iqd: 6000, delivery_group: "small", merge_with_groups: ["small", "large"] }),
      item({ id: "filter_tabreed", shipping_iqd: 6000, delivery_group: "small", merge_with_groups: ["small", "large"] }),
      item({ id: "draim_shaft", shipping_iqd: 6000, delivery_group: "small", merge_with_groups: ["small"] }),
    ];
    expect(computeShipping(items)).toBe(41000);
    expect(shipmentCount(items)).toBe(2);
  });

  it("small part merging with large absorbs at 0 extra cost when large is present", () => {
    const items = [
      item({ id: "L1", shipping_iqd: 15000, delivery_group: "large" }),
      item({ id: "S1", shipping_iqd: 5000, delivery_group: "small", merge_with_groups: ["large"] }),
    ];
    expect(computeShipping(items)).toBe(15000);
    expect(shipmentCount(items)).toBe(1);
  });

  it("small part NOT merging with large is billed separately when large is present", () => {
    const items = [
      item({ id: "L1", shipping_iqd: 15000, delivery_group: "large" }),
      item({ id: "S1", shipping_iqd: 5000, delivery_group: "small", merge_with_groups: ["small"] }),
    ];
    expect(computeShipping(items)).toBe(15000 + 5000);
    expect(shipmentCount(items)).toBe(2);
  });

  it("medium part and small part merging with medium: MAX fee", () => {
    const items = [
      item({ id: "M1", shipping_iqd: 8000, delivery_group: "medium", merge_with_groups: ["medium"] }),
      item({ id: "S1", shipping_iqd: 4000, delivery_group: "small", merge_with_groups: ["medium"] }),
    ];
    expect(computeShipping(items)).toBe(8000);
    expect(shipmentCount(items)).toBe(1);
  });

  it("medium part absorbs into large when merging with large", () => {
    const items = [
      item({ id: "L1", shipping_iqd: 20000, delivery_group: "large" }),
      item({ id: "M1", shipping_iqd: 10000, delivery_group: "medium", merge_with_groups: ["large"] }),
      item({ id: "S1", shipping_iqd: 5000, delivery_group: "small", merge_with_groups: ["large"] }),
    ];
    expect(computeShipping(items)).toBe(20000);
    expect(shipmentCount(items)).toBe(1);
  });

  it("multiple small parts merging together: MAX fee", () => {
    const items = [
      item({ id: "S1", shipping_iqd: 3000, delivery_group: "small", merge_with_groups: ["small"] }),
      item({ id: "S2", shipping_iqd: 5000, delivery_group: "small", merge_with_groups: ["small"] }),
      item({ id: "S3", shipping_iqd: 2000, delivery_group: "small", merge_with_groups: ["small"] }),
    ];
    expect(computeShipping(items)).toBe(5000);
    expect(shipmentCount(items)).toBe(1);
  });

  it("item without delivery group is independent and does not merge into large", () => {
    const items = [
      item({ id: "L1", shipping_iqd: 15000, delivery_group: "large" }),
      item({ id: "X1", shipping_iqd: 4000, delivery_group: null }),
    ];
    expect(computeShipping(items)).toBe(15000 + 4000);
    expect(shipmentCount(items)).toBe(2);
  });

  describe("max_merge_qty capacity rules (bumpers: 2 per parcel)", () => {
    const bumper = (qty: number, fee = 35000, maxMerge = 2) => ({
      quantity: qty,
      product: {
        id: "bumper",
        shipping_iqd: fee,
        delivery_group: "large",
        merge_with_groups: ["large"],
        max_merge_qty: maxMerge,
      },
    });

    it("1 bumper = 1 parcel (35,000 IQD)", () => {
      expect(computeShipping([bumper(1)])).toBe(35000);
      expect(shipmentCount([bumper(1)])).toBe(1);
    });

    it("2 bumpers = 1 parcel (35,000 IQD)", () => {
      expect(computeShipping([bumper(2)])).toBe(35000);
      expect(shipmentCount([bumper(2)])).toBe(1);
    });

    it("3 bumpers = 2 parcels (70,000 IQD)", () => {
      expect(computeShipping([bumper(3)])).toBe(70000);
      expect(shipmentCount([bumper(3)])).toBe(2);
    });

    it("4 bumpers = 2 parcels (70,000 IQD)", () => {
      expect(computeShipping([bumper(4)])).toBe(70000);
      expect(shipmentCount([bumper(4)])).toBe(2);
    });

    it("5 bumpers = 3 parcels (105,000 IQD)", () => {
      expect(computeShipping([bumper(5)])).toBe(105000);
      expect(shipmentCount([bumper(5)])).toBe(3);
    });

    it("mixed bumpers: 1 front (40k, max 2) + 2 rear (35k, max 2) = 75,000 IQD (2 parcels)", () => {
      const items = [
        {
          quantity: 1,
          product: { id: "front", shipping_iqd: 40000, delivery_group: "large", merge_with_groups: ["large"], max_merge_qty: 2 },
        },
        {
          quantity: 2,
          product: { id: "rear", shipping_iqd: 35000, delivery_group: "large", merge_with_groups: ["large"], max_merge_qty: 2 },
        },
      ];
      // Parcel 1: front (40k) + rear (35k) -> max 40k
      // Parcel 2: rear (35k) -> 35k
      // Total = 75,000
      expect(computeShipping(items)).toBe(75000);
      expect(shipmentCount(items)).toBe(2);
    });

    it("absorption respects host capacity: 1 bumper + 5 filters (filter max 2 per host)", () => {
      const items = [
        bumper(1, 35000, 2),
        {
          quantity: 5,
          product: { id: "filter", shipping_iqd: 6000, delivery_group: "small", merge_with_groups: ["small", "large"], max_merge_qty: 2 },
        },
      ];
      // 1 bumper (35k) absorbs 2 filters at 0 fee.
      // 3 filters remain -> pack with max 2 -> 2 small parcels (6k + 6k = 12k).
      // Total = 35k + 12k = 47,000 IQD.
      expect(computeShipping(items)).toBe(47000);
      expect(shipmentCount(items)).toBe(3);
    });
  });
});