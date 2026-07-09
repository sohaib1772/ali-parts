import { describe, it, expect } from "vitest";
import { computeShipping, shipmentCount } from "@/lib/shipping";

const item = (p: any) => ({ quantity: 1, product: p });

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

  it("delivery_group is ignored (only the toggle matters)", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 3000, delivery_group: "north", merge_delivery: true }),
        item({ id: "B", shipping_iqd: 5000, delivery_group: "south", merge_delivery: true }),
      ]),
    ).toBe(5000);
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