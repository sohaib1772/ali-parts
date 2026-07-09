import { describe, it, expect } from "vitest";
import { computeShipping, shipmentCount } from "@/lib/shipping";

const item = (p: any) => ({ quantity: 1, product: p });

describe("computeShipping — delivery_group logic", () => {
  it("returns 0 for empty / null / undefined input", () => {
    expect(computeShipping([])).toBe(0);
    expect(computeShipping(null as any)).toBe(0);
    expect(computeShipping(undefined as any)).toBe(0);
    expect(computeShipping("not-an-array" as any)).toBe(0);
  });

  it("ignores items whose product is null/undefined", () => {
    expect(
      computeShipping([
        { product: null } as any,
        { product: undefined } as any,
        item({ id: "A", shipping_iqd: 2500, delivery_group: "n", merge_delivery: true }),
      ]),
    ).toBe(2500);
  });

  it("takes MAX per group when merge_delivery is true (single group)", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 3000, delivery_group: "north", merge_delivery: true }),
        item({ id: "B", shipping_iqd: 5000, delivery_group: "north", merge_delivery: true }),
        item({ id: "C", shipping_iqd: 2000, delivery_group: "north", merge_delivery: true }),
      ]),
    ).toBe(5000);
  });

  it("sums MAX across distinct groups", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 3000, delivery_group: "north", merge_delivery: true }),
        item({ id: "B", shipping_iqd: 4500, delivery_group: "north", merge_delivery: true }),
        item({ id: "C", shipping_iqd: 2000, delivery_group: "south", merge_delivery: true }),
        item({ id: "D", shipping_iqd: 6000, delivery_group: "south", merge_delivery: true }),
      ]),
    ).toBe(4500 + 6000);
  });

  it("treats items without a group as independent shipments", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 3000, delivery_group: "north", merge_delivery: true }),
        item({ id: "B", shipping_iqd: 4000, delivery_group: "", merge_delivery: true }),
        item({ id: "C", shipping_iqd: 2500, delivery_group: null, merge_delivery: true }),
        item({ id: "D", shipping_iqd: 1500, delivery_group: undefined, merge_delivery: true }),
      ]),
    ).toBe(3000 + 4000 + 2500 + 1500);
  });

  it("trims whitespace in group names before comparing", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 3000, delivery_group: "  north  ", merge_delivery: true }),
        item({ id: "B", shipping_iqd: 6000, delivery_group: "north", merge_delivery: true }),
        item({ id: "C", shipping_iqd: 4000, delivery_group: "\tnorth\n", merge_delivery: true }),
      ]),
    ).toBe(6000);
  });

  it("all-whitespace group is treated as no group (independent)", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 3000, delivery_group: "   ", merge_delivery: true }),
        item({ id: "B", shipping_iqd: 4000, delivery_group: "\t\n", merge_delivery: true }),
      ]),
    ).toBe(3000 + 4000);
  });

  it("merge_delivery === false forces independence even when in a group", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 3000, delivery_group: "north", merge_delivery: true }),
        item({ id: "B", shipping_iqd: 5000, delivery_group: "north", merge_delivery: false }),
      ]),
    ).toBe(3000 + 5000);
  });

  it("merge_delivery missing/undefined defaults to true (merges)", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 3000, delivery_group: "north" }),
        item({ id: "B", shipping_iqd: 5000, delivery_group: "north", merge_delivery: undefined }),
        item({ id: "C", shipping_iqd: 2000, delivery_group: "north", merge_delivery: null }),
      ]),
    ).toBe(5000);
  });

  it("coerces null / undefined / missing shipping_iqd to 0", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: null, delivery_group: "n", merge_delivery: true }),
        item({ id: "B", shipping_iqd: undefined, delivery_group: "n", merge_delivery: true }),
        item({ id: "C", delivery_group: "n", merge_delivery: true }),
        item({ id: "D", shipping_iqd: 4000, delivery_group: "n", merge_delivery: true }),
      ]),
    ).toBe(4000);
  });

  it("accepts numeric strings for shipping_iqd", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: "3000", delivery_group: "n", merge_delivery: true }),
        item({ id: "B", shipping_iqd: "5000", delivery_group: "n", merge_delivery: true }),
      ]),
    ).toBe(5000);
  });

  it("rejects unparseable / negative / non-finite shipping_iqd (treated as 0)", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: "abc", delivery_group: "n", merge_delivery: true }),
        item({ id: "B", shipping_iqd: -1000, delivery_group: "n", merge_delivery: true }),
        item({ id: "C", shipping_iqd: NaN, delivery_group: "n", merge_delivery: true }),
        item({ id: "D", shipping_iqd: Infinity, delivery_group: "n", merge_delivery: true }),
      ]),
    ).toBe(0);
  });

  it("returns 0 when every fee is 0 (free shipping)", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 0, delivery_group: "n", merge_delivery: true }),
        item({ id: "B", shipping_iqd: 0, delivery_group: "s", merge_delivery: true }),
      ]),
    ).toBe(0);
  });

  it("group names are case-sensitive (north ≠ North)", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 3000, delivery_group: "north", merge_delivery: true }),
        item({ id: "B", shipping_iqd: 4000, delivery_group: "North", merge_delivery: true }),
      ]),
    ).toBe(3000 + 4000);
  });

  it("non-string delivery_group (number/object/array) → treated as no group", () => {
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 3000, delivery_group: 42, merge_delivery: true }),
        item({ id: "B", shipping_iqd: 4000, delivery_group: {}, merge_delivery: true }),
        item({ id: "C", shipping_iqd: 2000, delivery_group: ["north"], merge_delivery: true }),
      ]),
    ).toBe(3000 + 4000 + 2000);
  });

  it("handles complex mixed cart", () => {
    // north-group MAX=5000, south-group MAX=3000, D solo=4000, E no-merge=6000
    expect(
      computeShipping([
        item({ id: "A", shipping_iqd: 2000, delivery_group: "north", merge_delivery: true }),
        item({ id: "B", shipping_iqd: 5000, delivery_group: "north", merge_delivery: true }),
        item({ id: "C", shipping_iqd: 3000, delivery_group: "south", merge_delivery: true }),
        item({ id: "D", shipping_iqd: 4000, delivery_group: "", merge_delivery: true }),
        item({ id: "E", shipping_iqd: 6000, delivery_group: "north", merge_delivery: false }),
      ]),
    ).toBe(5000 + 3000 + 4000 + 6000);
  });

  it("MAX rule holds regardless of item order", () => {
    const forward = computeShipping([
      item({ id: "A", shipping_iqd: 1000, delivery_group: "n", merge_delivery: true }),
      item({ id: "B", shipping_iqd: 5000, delivery_group: "n", merge_delivery: true }),
      item({ id: "C", shipping_iqd: 3000, delivery_group: "n", merge_delivery: true }),
    ]);
    const reverse = computeShipping([
      item({ id: "C", shipping_iqd: 3000, delivery_group: "n", merge_delivery: true }),
      item({ id: "B", shipping_iqd: 5000, delivery_group: "n", merge_delivery: true }),
      item({ id: "A", shipping_iqd: 1000, delivery_group: "n", merge_delivery: true }),
    ]);
    expect(forward).toBe(5000);
    expect(reverse).toBe(5000);
  });

  it("items without an id but with no group are still independent (not collapsed)", () => {
    expect(
      computeShipping([
        item({ shipping_iqd: 3000, delivery_group: "", merge_delivery: true }),
        item({ shipping_iqd: 4000, delivery_group: "", merge_delivery: true }),
      ]),
    ).toBe(7000);
  });
});

describe("shipmentCount", () => {
  it("counts distinct shipments matching computeShipping grouping", () => {
    const items = [
      item({ id: "A", shipping_iqd: 3000, delivery_group: "north", merge_delivery: true }),
      item({ id: "B", shipping_iqd: 5000, delivery_group: "north", merge_delivery: true }),
      item({ id: "C", shipping_iqd: 3000, delivery_group: "south", merge_delivery: true }),
      item({ id: "D", shipping_iqd: 4000, delivery_group: "", merge_delivery: true }),
      item({ id: "E", shipping_iqd: 6000, delivery_group: "north", merge_delivery: false }),
    ];
    expect(shipmentCount(items)).toBe(4); // north, south, D-solo, E-no-merge
  });

  it("returns 0 for empty/nullish input", () => {
    expect(shipmentCount([])).toBe(0);
    expect(shipmentCount(null as any)).toBe(0);
    expect(shipmentCount(undefined as any)).toBe(0);
  });
});