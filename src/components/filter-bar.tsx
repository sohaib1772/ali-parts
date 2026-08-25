import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, Check, X } from "lucide-react";
import { categoriesQuery, brandsQuery, carModelsQuery } from "@/lib/queries";
import { useStorefrontFilters } from "@/lib/storefront-filters";

/**
 * Browse-first storefront filter bar.
 * Unified 3-column filter buttons + Centered Luxury Dialog Modal for all selections.
 */

type Option = { id: string; label: string; sub?: string };

export function FilterBar({
  showModel = true,
  categoryOverride,
}: {
  showModel?: boolean;
  categoryOverride?: { value: string; onChange: (id: string) => void };
}) {
  const [activeMenu, setActiveMenu] = useState<"category" | "brand" | "model" | null>(null);
  const [menuSearch, setMenuSearch] = useState("");

  const { data: categories = [] } = useQuery(categoriesQuery());
  const { data: brands = [] } = useQuery(brandsQuery());
  const { data: models = [] } = useQuery(carModelsQuery());
  const { filters, setFilter, clearFilters } = useStorefrontFilters();

  const categoryValue = categoryOverride ? categoryOverride.value : filters.category;
  const onSelectCategory = categoryOverride
    ? categoryOverride.onChange
    : (id: string) => setFilter({ category: id });

  const categoryOptions: Option[] = useMemo(
    () => categories.map((c) => ({ id: c.id, label: c.name_ar })),
    [categories],
  );

  const brandOptions: Option[] = useMemo(
    () => brands.map((b) => ({ id: b.id, label: b.name_ar, sub: b.name_en })),
    [brands],
  );

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
    const modelStillValid = !!filters.model && models.find((m) => m.id === filters.model)?.brand_id === id;
    setFilter({ brand: id, model: id && modelStillValid ? filters.model : "" });
  };

  const onSelectModel = (id: string) => {
    const brandId = models.find((m) => m.id === id)?.brand_id ?? "";
    setFilter({ model: id, ...(id && brandId ? { brand: brandId } : {}) });
  };

  const selectedCategory = categoryOptions.find((c) => c.id === categoryValue);
  const selectedBrand = brandOptions.find((b) => b.id === filters.brand);
  const selectedModel = modelOptions.find((m) => m.id === filters.model);

  const hasAnyFilterActive = Boolean(categoryValue || filters.brand || filters.model);

  // Close modal on Escape, sync data-filter-modal, and LOCK body scroll on iOS
  useEffect(() => {
    if (!activeMenu) {
      document.body.removeAttribute("data-filter-modal");
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.touchAction = "";
      return;
    }
    // Lock body scrolling so iOS doesn't scroll behind the modal
    document.body.setAttribute("data-filter-modal", "open");
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.touchAction = "none";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveMenu(null);
        setMenuSearch("");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.removeAttribute("data-filter-modal");
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.touchAction = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [activeMenu]);

  const toggleMenu = (menu: "category" | "brand" | "model") => {
    if (activeMenu === menu) {
      setActiveMenu(null);
      setMenuSearch("");
    } else {
      setActiveMenu(menu);
      setMenuSearch("");
    }
  };

  // Get active menu data
  const currentMenuConfig = useMemo(() => {
    if (activeMenu === "category") {
      return {
        title: "اختر التصنيف",
        value: categoryValue,
        options: categoryOptions,
        onSelect: (id: string) => {
          onSelectCategory(id);
          setActiveMenu(null);
          setMenuSearch("");
        },
      };
    }
    if (activeMenu === "brand") {
      return {
        title: "اختر الماركة",
        value: filters.brand,
        options: brandOptions,
        onSelect: (id: string) => {
          onSelectBrand(id);
          setActiveMenu(null);
          setMenuSearch("");
        },
      };
    }
    if (activeMenu === "model") {
      return {
        title: "اختر نوع السيارة",
        value: filters.model,
        options: modelOptions,
        onSelect: (id: string) => {
          onSelectModel(id);
          setActiveMenu(null);
          setMenuSearch("");
        },
      };
    }
    return null;
  }, [activeMenu, categoryValue, categoryOptions, filters.brand, brandOptions, filters.model, modelOptions]);

  const filteredOptions = useMemo(() => {
    if (!currentMenuConfig) return [];
    const q = menuSearch.trim().toLowerCase();
    if (!q) return currentMenuConfig.options;
    return currentMenuConfig.options.filter((o) =>
      `${o.label} ${o.sub ?? ""}`.toLowerCase().includes(q),
    );
  }, [currentMenuConfig, menuSearch]);

  const showSearchInMenu = (currentMenuConfig?.options.length ?? 0) > 5;

  return (
    <div dir="rtl" className="w-full space-y-2">
      {/* 3-column equal grid of filter trigger buttons */}
      <div className={`grid gap-1.5 w-full ${showModel ? "grid-cols-3" : "grid-cols-2"}`}>
        {/* 1. Category Button */}
        <button
          type="button"
          onClick={() => toggleMenu("category")}
          aria-expanded={activeMenu === "category"}
          className={`w-full min-w-0 h-10 px-2 rounded-xl border transition-all flex items-center justify-between gap-1 overflow-hidden select-none ${
            categoryValue
              ? "bg-navy border-gold/70 text-gold shadow-sm ring-1 ring-gold/40"
              : "bg-navy/95 border-border/40 text-primary-foreground/90 hover:bg-navy"
          } ${activeMenu === "category" ? "ring-2 ring-gold" : ""}`}
        >
          <div className="min-w-0 flex-1 flex items-center gap-1 overflow-hidden text-start">
            <span className="text-primary-foreground/50 text-[10px] shrink-0 font-medium">التصنيف:</span>
            <span className={`truncate text-xs font-bold block flex-1 ${categoryValue ? "text-gold" : "text-primary-foreground"}`}>
              {selectedCategory ? selectedCategory.label : "الكل"}
            </span>
          </div>
          <ChevronDown
            className={`size-3 shrink-0 transition-transform duration-200 ${
              categoryValue ? "text-gold" : "text-primary-foreground/60"
            } ${activeMenu === "category" ? "rotate-180" : ""}`}
          />
        </button>

        {/* 2. Brand Button */}
        <button
          type="button"
          onClick={() => toggleMenu("brand")}
          aria-expanded={activeMenu === "brand"}
          className={`w-full min-w-0 h-10 px-2 rounded-xl border transition-all flex items-center justify-between gap-1 overflow-hidden select-none ${
            filters.brand
              ? "bg-navy border-gold/70 text-gold shadow-sm ring-1 ring-gold/40"
              : "bg-navy/95 border-border/40 text-primary-foreground/90 hover:bg-navy"
          } ${activeMenu === "brand" ? "ring-2 ring-gold" : ""}`}
        >
          <div className="min-w-0 flex-1 flex items-center gap-1 overflow-hidden text-start">
            <span className="text-primary-foreground/50 text-[10px] shrink-0 font-medium">الماركة:</span>
            <span className={`truncate text-xs font-bold block flex-1 ${filters.brand ? "text-gold" : "text-primary-foreground"}`}>
              {selectedBrand ? selectedBrand.label : "الكل"}
            </span>
          </div>
          <ChevronDown
            className={`size-3 shrink-0 transition-transform duration-200 ${
              filters.brand ? "text-gold" : "text-primary-foreground/60"
            } ${activeMenu === "brand" ? "rotate-180" : ""}`}
          />
        </button>

        {/* 3. Model Button */}
        {showModel && (
          <button
            type="button"
            onClick={() => toggleMenu("model")}
            aria-expanded={activeMenu === "model"}
            className={`w-full min-w-0 h-10 px-2 rounded-xl border transition-all flex items-center justify-between gap-1 overflow-hidden select-none ${
              filters.model
                ? "bg-navy border-gold/70 text-gold shadow-sm ring-1 ring-gold/40"
                : "bg-navy/95 border-border/40 text-primary-foreground/90 hover:bg-navy"
            } ${activeMenu === "model" ? "ring-2 ring-gold" : ""}`}
          >
            <div className="min-w-0 flex-1 flex items-center gap-1 overflow-hidden text-start">
              <span className="text-primary-foreground/50 text-[10px] shrink-0 font-medium">السيارة:</span>
              <span className={`truncate text-xs font-bold block flex-1 ${filters.model ? "text-gold" : "text-primary-foreground"}`}>
                {selectedModel ? selectedModel.label : "الكل"}
              </span>
            </div>
            <ChevronDown
              className={`size-3 shrink-0 transition-transform duration-200 ${
                filters.model ? "text-gold" : "text-primary-foreground/60"
              } ${activeMenu === "model" ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      {/* Centered Luxury Dialog Modal (Positioned safely above keyboard on mobile) */}
      {currentMenuConfig && (
        <div
          data-filter-dialog="open"
          className="fixed inset-0 z-[60] flex items-start pt-[calc(env(safe-area-inset-top)+1.5rem)] md:items-center md:pt-4 justify-center p-4"
          onTouchMove={(e) => {
            // Only allow touch scroll inside the scrollable list, block everywhere else
            const target = e.target as HTMLElement;
            const scrollable = target.closest("[data-scroll-region]");
            if (!scrollable) {
              e.preventDefault();
            }
          }}
        >
          {/* Dark Blurred Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => {
              setActiveMenu(null);
              setMenuSearch("");
            }}
            onTouchMove={(e) => e.preventDefault()}
          />

          {/* Modal Content Card */}
          <div
            dir="rtl"
            className="filter-modal-card relative z-10 w-full max-w-sm max-h-[calc(100dvh-6rem)] md:max-h-[75vh] flex flex-col rounded-3xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 fade-in duration-150"
            style={{ touchAction: "none" }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-gradient-navy text-primary-foreground shrink-0">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-gold animate-pulse" />
                <span className="text-sm font-bold">{currentMenuConfig.title}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveMenu(null);
                  setMenuSearch("");
                }}
                className="size-7 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition"
                aria-label="إغلاق"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Search Input inside modal if options are many */}
            {showSearchInMenu && (
              <div className="p-3 border-b border-border bg-muted/20 shrink-0">
                <label className="flex items-center gap-2 bg-background border border-border rounded-xl px-3 h-10 focus-within:border-gold shadow-sm">
                  <Search className="size-4 text-muted-foreground shrink-0" />
                  <input
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    placeholder="ابحث هنا…"
                    className="flex-1 bg-transparent outline-none text-base md:text-sm font-medium"
                  />
                  {menuSearch && (
                    <button
                      type="button"
                      onClick={() => setMenuSearch("")}
                      className="text-muted-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </label>
              </div>
            )}

            {/* Options List — scrollable with proper iOS touch isolation */}
            <div
              data-scroll-region
              className="overflow-y-auto py-1 divide-y divide-border/20 flex-1"
              style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-y", overscrollBehavior: "contain" } as React.CSSProperties}
            >
              {/* Option: All */}
              <button
                type="button"
                onClick={() => currentMenuConfig.onSelect("")}
                className={`w-full flex items-center justify-between gap-3 px-5 py-3 text-sm transition-colors ${
                  !currentMenuConfig.value
                    ? "bg-gold/10 text-gold font-extrabold"
                    : "hover:bg-muted text-foreground"
                }`}
              >
                <span>الكل</span>
                {!currentMenuConfig.value && <Check className="size-4 text-gold shrink-0" strokeWidth={2.5} />}
              </button>

              {/* Filtered Options */}
              {filteredOptions.map((o) => {
                const isSelected = o.id === currentMenuConfig.value;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => currentMenuConfig.onSelect(o.id)}
                    className={`w-full flex items-center justify-between gap-3 px-5 py-3 text-start transition-colors ${
                      isSelected
                        ? "bg-gold/10 text-gold font-extrabold"
                        : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold truncate">{o.label}</span>
                      {o.sub && (
                        <span className="block text-xs text-muted-foreground truncate" dir="ltr">
                          {o.sub}
                        </span>
                      )}
                    </span>
                    {isSelected && <Check className="size-4 shrink-0 text-gold" strokeWidth={2.5} />}
                  </button>
                );
              })}

              {filteredOptions.length === 0 && (
                <div className="text-center text-xs text-muted-foreground py-10">لا توجد نتائج مطابقة</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Chips: easily removable with X */}
      {hasAnyFilterActive && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {categoryValue && (
            <button
              type="button"
              onClick={() => onSelectCategory("")}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-gold/15 text-gold border border-gold/30 hover:bg-gold/25 transition"
            >
              <span className="truncate max-w-[8rem]">{selectedCategory?.label || "التصنيف"}</span>
              <X className="size-3 shrink-0" />
            </button>
          )}
          {filters.brand && (
            <button
              type="button"
              onClick={() => onSelectBrand("")}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-gold/15 text-gold border border-gold/30 hover:bg-gold/25 transition"
            >
              <span className="truncate max-w-[8rem]">{selectedBrand?.label || "الماركة"}</span>
              <X className="size-3 shrink-0" />
            </button>
          )}
          {filters.model && (
            <button
              type="button"
              onClick={() => onSelectModel("")}
              className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-gold/15 text-gold border border-gold/30 hover:bg-gold/25 transition"
            >
              <span className="truncate max-w-[8rem]">{selectedModel?.label || "نوع السيارة"}</span>
              <X className="size-3 shrink-0" />
            </button>
          )}
          <button
            type="button"
            onClick={clearFilters}
            className="text-[10px] text-muted-foreground hover:text-destructive underline px-1 py-0.5"
          >
            مسح الكل
          </button>
        </div>
      )}
    </div>
  );
}
