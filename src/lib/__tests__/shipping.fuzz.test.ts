import { describe, it, expect } from "vitest";
import { computeShipping, shipmentCount } from "@/lib/shipping";

// Deterministic PRNG so failures are reproducible.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEIRD_FEES: any[] = [
  null,
  undefined,
  0,
  1,
  1000,
  9999,
  "3000", // numeric string → valid
  "abc",  // unparseable
  "",
  " ",
  -5000,
  NaN,
  Infinity,
  -Infinity,
  {},
  [],
  [3000],
  true,
  false,
];

const WEIRD_GROUPS: any[] = [
  "north",
  "south",
  " north ",
  "\tnorth\n",
  "North", // case-sensitive → different bucket
  "",
  "   ",
  null,
  undefined,
  42,
  {},
  [],
  ["north"],
  true,
  false,
];

const WEIRD_MERGE: any[] = [true, false, undefined, null, 0, 1, "false", "true", {}, []];

const WEIRD_PRODUCT_SHAPES: any[] = [null, undefined, {}, { id: null }];

function pick<T>(arr: T[], r: () => number): T {
  return arr[Math.floor(r() * arr.length)];
}

function makeFuzzItems(n: number, seed: number) {
  const rand = mulberry32(seed);
  const items: any[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // ~5% chance of a totally malformed product
    if (rand() < 0.05) {
      items[i] = { quantity: 1, product: pick(WEIRD_PRODUCT_SHAPES, rand) };
      continue;
    }
    items[i] = {
      quantity: 1,
      product: {
        id: rand() < 0.9 ? `p_${i}` : pick([null, undefined, 12345], rand),
        shipping_iqd: pick(WEIRD_FEES, rand),
        delivery_group: pick(WEIRD_GROUPS, rand),
        merge_delivery: pick(WEIRD_MERGE, rand),
      },
    };
  }
  return items;
}

describe("computeShipping / shipmentCount — fuzz on weird inputs", () => {
  it("never throws, always returns a finite non-negative integer-safe number", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const items = makeFuzzItems(500, seed);
      let sum = -1, count = -1;
      expect(() => {
        sum = computeShipping(items);
        count = shipmentCount(items);
      }).not.toThrow();
      expect(Number.isFinite(sum)).toBe(true);
      expect(sum).toBeGreaterThanOrEqual(0);
      expect(sum).toBeLessThan(Number.MAX_SAFE_INTEGER);
      expect(Number.isInteger(count)).toBe(true);
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(items.length);
    }
  });

  it("is deterministic: same input → same output", () => {
    const items = makeFuzzItems(1_000, 7);
    const a = computeShipping(items);
    const b = computeShipping(items);
    const c = computeShipping([...items]); // shallow copy, same refs
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(shipmentCount(items)).toBe(shipmentCount(items));
  });

  it("is order-independent (permutation invariant)", () => {
    const items = makeFuzzItems(500, 13);
    const rand = mulberry32(99);
    const shuffled = [...items].sort(() => rand() - 0.5);
    expect(computeShipping(items)).toBe(computeShipping(shuffled));
    expect(shipmentCount(items)).toBe(shipmentCount(shuffled));
  });

  it("sum ≤ upper bound = Σ max(0, valid fee) — grouping can only reduce the total", () => {
    for (let seed = 100; seed <= 120; seed++) {
      const items = makeFuzzItems(300, seed);
      const upperBound = items.reduce((acc: number, i: any) => {
        const raw = Number(i?.product?.shipping_iqd ?? 0);
        const fee = Number.isFinite(raw) && raw > 0 ? raw : 0;
        return acc + fee;
      }, 0);
      const sum = computeShipping(items);
      expect(sum).toBeLessThanOrEqual(upperBound);
    }
  });

  it("shipmentCount matches the number of distinct grouping keys used by sum", () => {
    // Property: for every input, computeShipping's group count equals shipmentCount.
    // We verify indirectly: if we replace every fee with 1, computeShipping === shipmentCount.
    for (let seed = 200; seed <= 210; seed++) {
      const items = makeFuzzItems(400, seed);
      const normalized = items.map((i: any) => ({
        quantity: 1,
        product: i?.product
          ? { ...i.product, shipping_iqd: 1, merge_delivery: i.product.merge_delivery }
          : i?.product,
      }));
      expect(computeShipping(normalized)).toBe(shipmentCount(items));
    }
  });

  it("adding a product with a valid fee never decreases the sum", () => {
    // Monotonicity under append.
    for (let seed = 300; seed <= 315; seed++) {
      const items = makeFuzzItems(200, seed);
      const before = computeShipping(items);
      const extra = {
        quantity: 1,
        product: { id: "extra", shipping_iqd: 500, delivery_group: "brand-new-group", merge_delivery: true },
      };
      const after = computeShipping([...items, extra]);
      expect(after).toBeGreaterThanOrEqual(before);
      // and adds exactly 500 (new group)
      expect(after - before).toBe(500);
    }
  });

  it("stress: 20k weird items still finishes fast and consistently", () => {
    const items = makeFuzzItems(20_000, 42);
    const t0 = performance.now();
    const sum = computeShipping(items);
    const count = shipmentCount(items);
    const dt = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`  fuzz stress 20k: sum=${sum}, shipments=${count}, took=${dt.toFixed(2)}ms`);
    expect(Number.isFinite(sum)).toBe(true);
    expect(sum).toBeGreaterThanOrEqual(0);
    expect(count).toBeGreaterThan(0);
    expect(dt).toBeLessThan(150);
  });
});