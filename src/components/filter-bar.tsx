import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, Check, X } from "lucide-react";
import { categoriesQuery, brandsQuery, carModelsQuery } from "@/lib/queries";
import { useStorefrontFilters } from "@/lib/storefront-filters";

/**
 * Browse-first storefront filter bar — replaces the old forced vehicle picker.
 * Category + Brand + Model dropdowns (Year/Engine are later phases). Shared
 * across every listing screen; reads/writes URL params + localStorage via
 * useStorefrontFilters. Nothing is forced.
 *
 * Each filter is an anchored dropdown list (opens directly under its button),
 * with a search field when the list is long. Dropdowns wrap on phone, sit in a
 * row on desktop. All tap targets are h-11 (44px).
 */

type Option = { id: string; label: string; sub?: string };

function FilterDropdown({
  label,
  allLabel,
  value,
  options,
  onSelect,
}: {
  label: string;
  allLabel: string;
  value: string;
  options: Option[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);
  const showSearch = options.length > 7;
  const filtered = q.trim()
    ? options.filter((o) => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    : options;

  // Close the list on an outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (id: string) => {
    onSelect(id);
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`h-11 px-3 rounded-xl border text-sm font-semibold flex items-center gap-1.5 transition ${
          value || open ? "border-navy bg-navy/5 text-navy" : "border-border bg-card text-foreground"
        }`}
      >
        <span className="text-muted-foreground text-[11px] font-bold">{label}:</span>
        <span className="truncate max-w-[7.5rem]">{selected ? selected.label : allLabel}</span>
        <ChevronDown className={`size-3.5 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          dir="rtl"
          className="absolute z-50 top-full start-0 mt-1 w-60 max-w-[80vw] rounded-xl border border-border bg-card shadow-lg overflow-hidden"
        >
          {showSearch && (
            <div className="p-2 border-b border-border">
              <label className="flex items-center gap-2 bg-muted/40 rounded-lg px-2 h-9 focus-within:ring-1 focus-within:ring-gold">
                <Search className="size-4 text-muted-foreground shrink-0" />
                <input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ابحث…"
                  className="flex-1 bg-transparent outline-none text-sm"
                />
              </label>
            </div>
          )}
          <div className="max-h-64 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => choose("")}
              className={`w-full flex items-center justify-between gap-2 px-3 h-10 text-sm ${
                !value ? "bg-navy/10 text-navy font-bold" : "hover:bg-muted"
              }`}
            >
              {allLabel}
              {!value && <Check className="size-4 text-navy shrink-0" />}
            </button>
            {filtered.map((o) => {
              const sel = o.id === value;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => choose(o.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 min-h-10 py-1.5 text-start ${
                    sel ? "bg-navy/10 text-navy font-bold" : "hover:bg-muted"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm truncate">{o.label}</span>
                    {o.sub && <span className="block text-[11px] text-muted-foreground truncate">{o.sub}</span>}
                  </span>
                  {sel && <Check className="size-4 shrink-0 text-navy" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-4">لا توجد نتائج</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function FilterBar({
  showModel = true,
  categoryOverride,
}: {
  showModel?: boolean;
  /** On the category route the category IS the URL path, so its selection must
   *  navigate rather than write filter state. When provided, the Category
   *  dropdown reflects `value` and calls `onChange` (empty id = "all"). */
  categoryOverride?: { value: string; onChange: (id: string) => void };
}) {
  const { data: categories = [] } = useQuery(categoriesQuery());
  const { data: brands = [] } = useQuery(brandsQuery());
  const { data: models = [] } = useQuery(carModelsQuery());
  const { filters, setFilter, clearFilters, activeCount } = useStorefrontFilters();

  const categoryValue = categoryOverride ? categoryOverride.value : filters.category;
  const onSelectCategory = categoryOverride
    ? categoryOverride.onChange
    : (id: string) => setFilter({ category: id });

  const categoryOptions: Option[] = categories.map((c) => ({ id: c.id, label: c.name_ar }));
  const brandOptions: Option[] = brands.map((b) => ({ id: b.id, label: b.name_ar, sub: b.name_en }));
  // Model depends on Brand: only that brand's models when a brand is picked.
  const modelOptions: Option[] = useMemo(
    () =>
      (filters.brand ? models.filter((m) => m.brand_id === filters.brand) : models).map((m) => ({
        id: m.id,
        label: m.name_ar,
        sub: m.name_en,
      })),
    [models, filters.brand],
  );

  const onSelectBrand = (id: string) => {
    // Changing brand invalidates a model that belongs to a different brand.
    const modelStillValid = !!filters.model && models.find((m) => m.id === filters.model)?.brand_id === id;
    setFilter({ brand: id, model: id && modelStillValid ? filters.model : "" });
  };
  const onSelectModel = (id: string) => {
    // Picking a model implies its brand — set both so the pair stays consistent.
    const brandId = models.find((m) => m.id === id)?.brand_id ?? "";
    setFilter({ model: id, ...(id && brandId ? { brand: brandId } : {}) });
  };

  return (
    <div dir="rtl" className="w-full">
      {/* Dropdown filters — wrap on phone, inline row on desktop. */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterDropdown
          label="التصنيف"
          allLabel="الكل"
          value={categoryValue}
          options={categoryOptions}
          onSelect={onSelectCategory}
        />
        <FilterDropdown
          label="الماركة"
          allLabel="الكل"
          value={filters.brand}
          options={brandOptions}
          onSelect={onSelectBrand}
        />
        {showModel && (
          <FilterDropdown
            label="الموديل"
            allLabel="الكل"
            value={filters.model}
            options={modelOptions}
            onSelect={onSelectModel}
          />
        )}
        {activeCount > 0 && (
          <button
            type="button"
            onClick={clearFilters}
            aria-label="مسح الفلاتر"
            title="مسح الفلاتر"
            className="h-11 w-11 rounded-xl border border-gold/40 bg-gold/10 text-gold flex items-center justify-center shrink-0"
          >
            <X className="size-5" />
          </button>
        )}
      </div>
    </div>
  );
}
