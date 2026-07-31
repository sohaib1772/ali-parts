import { useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import type { Product } from "@/lib/queries";

/**
 * Storefront filter state — the browse-first replacement for the old forced
 * vehicle picker. Filters live in the URL (shareable, back-button friendly) and
 * are mirrored to localStorage so a returning visitor keeps their last selection
 * — but nothing is ever forced.
 *
 * Phase 1 filters: search + Category + Brand + Model. Year/Engine come later
 * (they need product fitment data that does not exist yet).
 */

/** Shared search schema applied as `validateSearch` on every listing route, so
 *  these params survive navigation (a bare z.object strips unknown keys) and are
 *  typed. `mode` is kept for the existing /search OEM mode. */
export const filterSearchSchema = z.object({
  q: z.string().optional(),
  cat: z.string().optional(),
  brand: z.string().optional(),
  model: z.string().optional(),
  mode: z.enum(["oem"]).optional(),
});
export type FilterSearch = z.infer<typeof filterSearchSchema>;

export type StorefrontFilters = {
  q: string;
  category: string;
  brand: string;
  model: string;
};

export const EMPTY_FILTERS: StorefrontFilters = { q: "", category: "", brand: "", model: "" };

const STORAGE_KEY = "aliparts_filters";
// Legacy key from the removed vehicle picker — read once to migrate brand/model.
const LEGACY_VEHICLE_KEY = "alsaaer_vehicle";

function readStored(): Partial<StorefrontFilters> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Partial<StorefrontFilters>;
    // One-time migration: seed brand/model from a previously saved vehicle.
    const legacy = window.localStorage.getItem(LEGACY_VEHICLE_KEY);
    if (legacy) {
      const v = JSON.parse(legacy) as { brandId?: string; modelId?: string };
      return { brand: v.brandId ?? "", model: v.modelId ?? "" };
    }
  } catch {
    /* ignore malformed storage */
  }
  return {};
}

function writeStored(f: StorefrontFilters) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    /* ignore quota / disabled storage */
  }
}

function searchToFilters(s: FilterSearch): StorefrontFilters {
  return {
    q: s.q ?? "",
    category: s.cat ?? "",
    brand: s.brand ?? "",
    model: s.model ?? "",
  };
}

/** Empty string → undefined so the key drops out of the URL entirely. */
function filtersToSearch(f: StorefrontFilters): Partial<FilterSearch> {
  return {
    q: f.q || undefined,
    cat: f.category || undefined,
    brand: f.brand || undefined,
    model: f.model || undefined,
  };
}

/**
 * Read + update the storefront filters. Route-agnostic (uses non-strict search),
 * so the one FilterBar works on every listing screen. Every update writes both
 * the URL and localStorage; `replace: true` keeps the back button meaningful
 * (filter tweaks don't pile up history entries).
 */
export function useStorefrontFilters() {
  const search = useSearch({ strict: false }) as FilterSearch;
  // The FilterBar is route-agnostic, so a plain useNavigate() types the search
  // updater as `never` (it can't resolve one route's search shape). Give it a
  // loose local signature — the params below are validated by filterSearchSchema
  // on each route anyway.
  const navigate = useNavigate() as unknown as (opts: {
    search: (prev: FilterSearch) => Partial<FilterSearch>;
    replace?: boolean;
  }) => void;
  const filters = searchToFilters(search);

  // Hydrate from localStorage once, only when the URL carries no filters — so a
  // shared link (which has its own params) always wins, and a returning visitor
  // with a clean URL gets their remembered filters. Never forced: it only
  // pre-fills the bar; the catalog is fully visible regardless.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const urlHasFilters = !!(search.q || search.cat || search.brand || search.model);
    if (urlHasFilters) return;
    const stored = readStored();
    const seeded = { ...EMPTY_FILTERS, ...stored };
    if (seeded.q || seeded.category || seeded.brand || seeded.model) {
      void navigate({ search: (prev) => ({ ...prev, ...filtersToSearch(seeded) }), replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = useCallback(
    (next: StorefrontFilters) => {
      writeStored(next);
      void navigate({
        search: (prev) => ({ ...prev, ...filtersToSearch(next) }),
        replace: true,
      });
    },
    [navigate],
  );

  const setFilter = useCallback(
    (patch: Partial<StorefrontFilters>) => {
      const next = { ...filters, ...patch };
      // Model depends on Brand: if the brand changes to something that isn't the
      // current model's brand, the model no longer makes sense — drop it. The
      // caller can re-set both together to keep a consistent pair.
      apply(next);
    },
    [filters, apply],
  );

  const clearFilters = useCallback(() => {
    writeStored(EMPTY_FILTERS);
    void navigate({
      search: (prev) => ({ ...prev, q: undefined, cat: undefined, brand: undefined, model: undefined }),
      replace: true,
    });
  }, [navigate]);

  const activeCount =
    (filters.category ? 1 : 0) +
    (filters.brand ? 1 : 0) +
    (filters.model ? 1 : 0) +
    (filters.q.trim() ? 1 : 0);

  return { filters, setFilter, clearFilters, activeCount };
}

/**
 * The single, canonical, null-tolerant filter. Every listing screen runs its
 * fetched products through this so behavior is identical everywhere and provably
 * safe.
 *
 * Null-tolerance is the launch safeguard: a product is never hidden for lacking
 * the data a filter targets.
 *   - Category: strict — the primary browse axis; a product not in the chosen
 *     category is excluded (uncategorised products are assumed complete).
 *   - Brand: null-tolerant — a product with NO brand_id matches any brand.
 *   - Model: null-tolerant — a product with empty/absent compatible_models is a
 *     universal part and always shown; otherwise it must list the model.
 *   - Search: name_ar / name_en / oem_number substring.
 */
export function applyStorefrontFilters(products: Product[], filters: StorefrontFilters): Product[] {
  const q = filters.q.trim().toLowerCase();
  return products.filter((p) => {
    if (filters.category && p.category_id !== filters.category) return false;
    if (filters.brand && p.brand_id && p.brand_id !== filters.brand) return false;
    if (filters.model) {
      const cm = p.compatible_models;
      const universal = !cm || cm.length === 0;
      if (!universal && !cm.includes(filters.model)) return false;
    }
    if (q) {
      const hay = `${p.name_ar ?? ""} ${p.name_en ?? ""} ${p.oem_number ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
