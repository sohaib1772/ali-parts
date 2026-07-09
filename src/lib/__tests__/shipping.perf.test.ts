import { describe, it, expect } from "vitest";
import { computeShipping, shipmentCount } from "@/lib/shipping";

// Perf budgets (ms). Generous to avoid flakes on slow CI, but still tight
// enough to catch a real regression (e.g. O(n²) sneaking in).
const BUDGETS = {
  n1k: 5,
  n10k: 40,
  n100k: 300,
};

type Mode = "many-groups" | "one-group" | "no-groups" | "mixed";

function makeItems(n: number, mode: Mode) {
  const items = new Array(n);
  for (let i = 0; i < n; i++) {
    let delivery_group: string | null = null;
    let merge_delivery = true;
    switch (mode) {
      case "many-groups":
        delivery_group = `g_${i % 50}`; // 50 distinct groups
        break;
      case "one-group":
        delivery_group = "single";
        break;
      case "no-groups":
        // each item independent — flip merge off
        merge_delivery = false;
        break;
      case "mixed":
        if (i % 3 === 0) delivery_group = `g_${i % 20}`;
        else if (i % 3 === 1) delivery_group = "";
        else {
          delivery_group = `g_${i % 20}`;
          merge_delivery = false;
        }
        break;
    }
    items[i] = {
      quantity: 1,
      product: {
        id: `p_${i}`,
        shipping_iqd: 1000 + (i % 9000),
        delivery_group,
        merge_delivery,
      },
    };
  }
  return items;
}

function bench(fn: () => void, warmup = 2, runs = 5) {
  for (let i = 0; i < warmup; i++) fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return { median, mean, min: times[0], max: times[times.length - 1] };
}

describe("computeShipping — performance", () => {
  it("1k items across 50 groups stays well under budget", () => {
    const items = makeItems(1_000, "many-groups");
    const { median } = bench(() => computeShipping(items));
    // eslint-disable-next-line no-console
    console.log(`  computeShipping(1k, many-groups) median=${median.toFixed(3)}ms`);
    expect(median).toBeLessThan(BUDGETS.n1k);
  });

  it("10k items across 50 groups stays under budget", () => {
    const items = makeItems(10_000, "many-groups");
    const { median } = bench(() => computeShipping(items));
    // eslint-disable-next-line no-console
    console.log(`  computeShipping(10k, many-groups) median=${median.toFixed(3)}ms`);
    expect(median).toBeLessThan(BUDGETS.n10k);
  });

  it("100k items across 50 groups stays under budget", () => {
    const items = makeItems(100_000, "many-groups");
    const { median } = bench(() => computeShipping(items));
    // eslint-disable-next-line no-console
    console.log(`  computeShipping(100k, many-groups) median=${median.toFixed(3)}ms`);
    expect(median).toBeLessThan(BUDGETS.n100k);
  });

  it("10k items collapsed into 1 group — MAX is correct and fast", () => {
    const items = makeItems(10_000, "one-group");
    const expectedMax = items.reduce(
      (m: number, i: any) => Math.max(m, i.product.shipping_iqd),
      0,
    );
    const { median } = bench(() => computeShipping(items));
    // eslint-disable-next-line no-console
    console.log(`  computeShipping(10k, one-group) median=${median.toFixed(3)}ms`);
    expect(computeShipping(items)).toBe(expectedMax);
    expect(median).toBeLessThan(BUDGETS.n10k);
  });

  it("10k items all independent (no groups) stays under budget", () => {
    const items = makeItems(10_000, "no-groups");
    const expectedSum = items.reduce(
      (s: number, i: any) => s + i.product.shipping_iqd,
      0,
    );
    const { median } = bench(() => computeShipping(items));
    // eslint-disable-next-line no-console
    console.log(`  computeShipping(10k, no-groups) median=${median.toFixed(3)}ms`);
    expect(computeShipping(items)).toBe(expectedSum);
    expect(median).toBeLessThan(BUDGETS.n10k);
  });

  it("mixed 10k cart stays under budget for both helpers", () => {
    const items = makeItems(10_000, "mixed");
    const b1 = bench(() => computeShipping(items));
    const b2 = bench(() => shipmentCount(items));
    // eslint-disable-next-line no-console
    console.log(
      `  mixed 10k: computeShipping median=${b1.median.toFixed(3)}ms, shipmentCount median=${b2.median.toFixed(3)}ms`,
    );
    expect(b1.median).toBeLessThan(BUDGETS.n10k);
    expect(b2.median).toBeLessThan(BUDGETS.n10k);
  });

  it("scales roughly linearly (10k / 1k time ratio < 30)", () => {
    // O(n) → ratio ~10x. Guardrail catches accidental O(n²): ratio would explode (>100x).
    const small = makeItems(1_000, "many-groups");
    const large = makeItems(10_000, "many-groups");
    const b1 = bench(() => computeShipping(small));
    const b2 = bench(() => computeShipping(large));
    const ratio = b2.median / Math.max(b1.median, 0.001);
    // eslint-disable-next-line no-console
    console.log(
      `  scaling ratio 10k/1k = ${ratio.toFixed(2)} (median ${b1.median.toFixed(3)}→${b2.median.toFixed(3)}ms)`,
    );
    expect(ratio).toBeLessThan(30);
  });
});