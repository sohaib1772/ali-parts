import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, Check, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { categoriesQuery, brandsQuery, carModelsQuery } from "@/lib/queries";
import { useStorefrontFilters } from "@/lib/storefront-filters";

/**
 * Browse-first storefront filter bar — replaces the old forced vehicle picker.
 * Search + Category + Brand + Model (Year/Engine are later phases). Shared across
 * every listing screen; reads/writes URL params + localStorage via
 * useStorefrontFilters. Nothing is forced.
 *
 * Layout: desktop = search + dropdowns in one row; phone = search full-width on
 * top with the dropdowns wrapping below. All tap targets are h-11 (44px).
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
  const selected = options.find((o) => o.id === value);
  const filtered = q.trim()
    ? options.filter((o) => `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()))
    : options;

  const choose = (id: string) => {
    onSelect(id);
    setOpen(false);
    setQ("");
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`h-11 px-3 rounded-xl border text-sm font-semibold flex items-center gap-1.5 shrink-0 transition ${
          value ? "border-navy bg-navy/5 text-navy" : "border-border bg-card text-foreground"
        }`}
      >
        <span className="text-muted-foreground text-[11px] font-bold">{label}:</span>
        <span className="truncate max-w-[7.5rem]">{selected ? selected.label : allLabel}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[82vh] p-0 flex flex-col" dir="rtl">
          <SheetHeader className="px-5 pt-5 pb-2">
            <SheetTitle className="text-center">{label}</SheetTitle>
          </SheetHeader>
          <div className="px-5 pb-3">
            <label className="flex items-center gap-2 bg-muted/40 border border-border rounded-xl px-3 h-11 focus-within:border-gold">
              <Search className="size-4 text-muted-foreground" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث…"
                className="flex-1 bg-transparent outline-none text-sm"
              />
            </label>
          </div>
          <div className="overflow-y-auto px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-1">
            <button
              type="button"
              onClick={() => choose("")}
              className={`w-full flex items-center justify-between gap-2 px-3 h-11 rounded-xl text-sm font-semibold ${
                !value ? "bg-navy text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {allLabel}
              {!value && <Check className="size-4" />}
            </button>
            {filtered.map((o) => {
              const sel = o.id === value;
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => choose(o.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 min-h-11 py-2 rounded-xl text-start ${
                    sel ? "bg-navy text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold truncate">{o.label}</span>
                    {o.sub && <span className={`block text-[11px] truncate ${sel ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{o.sub}</span>}
                  </span>
                  {sel && <Check className="size-4 shrink-0" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-6">لا توجد نتائج</div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
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
            className="h-11 px-3 rounded-xl border border-gold/40 bg-gold/10 text-gold text-sm font-bold flex items-center gap-1 shrink-0"
          >
            <X className="size-4" /> مسح ({activeCount})
          </button>
        )}
      </div>
    </div>
  );
}
