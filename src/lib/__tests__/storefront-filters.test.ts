import { describe, it, expect } from "vitest";
import { applyStorefrontFilters, EMPTY_FILTERS } from "@/lib/storefront-filters";
import type { Product } from "@/lib/queries";

// Minimal product factory — only the fields the filter reads.
function p(over: Partial<Product>): Product {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    name_ar: over.name_ar ?? "قطعة",
    name_en: over.name_en ?? null,
    oem_number: over.oem_number ?? null,
    price_iqd: 1000,
    price_usd: 1,
    compare_price_iqd: null,
    shipping_iqd: null,
    category_id: over.category_id ?? null,
    brand_id: over.brand_id ?? null,
    compatible_models: over.compatible_models ?? null,
    images: null,
    in_stock: true,
    stock_qty: 1,
    is_featured: false,
    is_deal: false,
  } as Product;
}

const CAT = "cat-1";
const BRAND = "brand-chevy";
const MODEL = "model-malibu";

// A catalog shaped like production: mostly model-specific, one universal part.
const universal = p({ id: "universal", compatible_models: null, brand_id: null, category_id: null });
const malibu = p({ id: "malibu", compatible_models: [MODEL], brand_id: BRAND, category_id: CAT });
const otherModel = p({ id: "other", compatible_models: ["model-tahoe"], brand_id: BRAND, category_id: CAT });
const otherBrand = p({ id: "gmc", compatible_models: ["model-yukon"], brand_id: "brand-gmc", category_id: "cat-2" });
const emptyArr = p({ id: "emptyarr", compatible_models: [], brand_id: null });
const catalog = [universal, malibu, otherModel, otherBrand, emptyArr];

describe("applyStorefrontFilters — null-tolerant, catalog-safe", () => {
  it("no filters returns the whole catalog", () => {
    expect(applyStorefrontFilters(catalog, EMPTY_FILTERS)).toHaveLength(catalog.length);
  });

  it("MODEL filter never hides a universal (null/empty compatible_models) product", () => {
    const out = applyStorefrontFilters(catalog, { ...EMPTY_FILTERS, model: MODEL });
    expect(out).toContain(universal); // null compatible_models → shown
    expect(out).toContain(emptyArr); // empty array → shown
    expect(out).toContain(malibu); // declares the model → shown
    expect(out).not.toContain(otherModel); // declares a different model → hidden
  });

  it("BRAND filter never hides a product with no brand_id", () => {
    const out = applyStorefrontFilters(catalog, { ...EMPTY_FILTERS, brand: BRAND });
    expect(out).toContain(universal); // null brand → shown
    expect(out).toContain(malibu); // matching brand → shown
    expect(out).not.toContain(otherBrand); // different brand → hidden
  });

  it("CATEGORY narrows to the chosen category (strict, real data)", () => {
    const out = applyStorefrontFilters(catalog, { ...EMPTY_FILTERS, category: CAT });
    expect(out).toContain(malibu);
    expect(out).not.toContain(otherBrand); // cat-2
  });

  it("SEARCH matches name/oem/name_en", () => {
    const items = [
      p({ id: "a", name_ar: "مساحات أمامية" }),
      p({ id: "b", name_en: "Brake pad" }),
      p({ id: "c", oem_number: "ABC-123" }),
    ];
    expect(applyStorefrontFilters(items, { ...EMPTY_FILTERS, q: "مساحات" }).map((x) => x.id)).toEqual(["a"]);
    expect(applyStorefrontFilters(items, { ...EMPTY_FILTERS, q: "brake" }).map((x) => x.id)).toEqual(["b"]);
    expect(applyStorefrontFilters(items, { ...EMPTY_FILTERS, q: "abc-123" }).map((x) => x.id)).toEqual(["c"]);
  });

  it("combined filters are a subset; universal part survives model narrowing within its category/brand", () => {
    const uInCat = p({ id: "u2", compatible_models: null, brand_id: null, category_id: CAT });
    const cat = [uInCat, malibu, otherModel];
    const out = applyStorefrontFilters(cat, { ...EMPTY_FILTERS, category: CAT, brand: BRAND, model: MODEL });
    expect(out).toContain(uInCat); // universal, in category, null brand → still shown
    expect(out).toContain(malibu);
    expect(out).not.toContain(otherModel);
  });

  it("PROOF: no single filter empties a catalog that has a universal part", () => {
    // A universal part matches every model/brand filter, so a model/brand filter
    // can never reduce the catalog to zero as long as one universal part exists.
    for (const model of [MODEL, "model-x", "model-y"]) {
      expect(applyStorefrontFilters(catalog, { ...EMPTY_FILTERS, model }).length).toBeGreaterThan(0);
    }
    for (const brand of [BRAND, "brand-x"]) {
      expect(applyStorefrontFilters(catalog, { ...EMPTY_FILTERS, brand }).length).toBeGreaterThan(0);
    }
  });
});
