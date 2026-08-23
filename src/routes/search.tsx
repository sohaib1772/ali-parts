import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useState } from "react";
import { Search as SearchIcon, X } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { ProductCard } from "@/components/product-card";
import { FilterBar } from "@/components/filter-bar";
import { searchProductsQuery } from "@/lib/queries";
import { useStorefrontFilters, applyStorefrontFilters, filterSearchSchema } from "@/lib/storefront-filters";

export const Route = createFileRoute("/search")({
  validateSearch: filterSearchSchema,
  head: () => ({ meta: [{ title: "البحث — Ali Parts" }] }),
  component: SearchPage,
  pendingMs: 400,
  pendingMinMs: 0,
  pendingComponent: SearchPending,
});

function SearchPending() {
  return (
    <div className="min-h-screen bg-background">
      <div className="px-4 pt-4">
        <div className="h-12 rounded-2xl bg-muted animate-pulse" />
        <div className="mt-5 grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl aspect-[3/4] bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchPage() {
  const { filters, setFilter } = useStorefrontFilters();
  const q = filters.q;
  // Local, debounced input so the search page has its own field (the FilterBar
  // no longer carries a search box) without pushing a URL update per keystroke.
  const [qLocal, setQLocal] = useState(q);
  useEffect(() => setQLocal(q), [q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (qLocal.trim() !== q.trim()) setFilter({ q: qLocal });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qLocal]);

  const deferredQ = useDeferredValue(q);
  const { data: results, isFetching } = useQuery(searchProductsQuery(deferredQ));
  // Narrow server search results by the active category/brand/model (and re-apply
  // q client-side, a harmless subset). Null-tolerant, so nothing valid is dropped.
  const filtered = applyStorefrontFilters(results ?? [], filters);

  return (
    <PageShell wide title="بحث">
      <div className="px-4 pt-4 space-y-3">
        <label className="flex items-center gap-2 bg-card border border-border rounded-2xl px-4 h-11 shadow-card focus-within:border-gold">
          <SearchIcon className="size-5 text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={qLocal}
            onChange={(e) => setQLocal(e.target.value)}
            placeholder="ابحث عن قطعة، اسم أو رقم OEM…"
            className="flex-1 bg-transparent outline-none text-base md:text-sm"
            inputMode="search"
          />
          {qLocal && (
            <button type="button" onClick={() => setQLocal("")} aria-label="مسح البحث" className="text-muted-foreground">
              <X className="size-4" />
            </button>
          )}
        </label>
        <FilterBar />
      </div>

      <div className="mt-5 px-4">
        {(() => {
          const SkeletonGrid = ({ n }: { n: number }) => (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="skeleton rounded-2xl aspect-[3/4]" />
              ))}
            </div>
          );
          if (!q.trim()) {
            return (
              <div className="text-center text-muted-foreground text-sm py-16">
                ابدأ بكتابة اسم القطعة أو رقمها للبحث
              </div>
            );
          }
          if (isFetching) {
            return <SkeletonGrid n={4} />;
          }
          if (filtered.length > 0) {
            return (
              <>
                <div className="text-xs text-muted-foreground mb-3">{filtered.length} نتيجة</div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
                </div>
              </>
            );
          }
          return (
            <div className="text-center text-muted-foreground text-sm py-16">
              لا توجد نتائج مطابقة. جرّب تعديل الفلاتر أو تواصل معنا عبر واتساب.
            </div>
          );
        })()}
      </div>
    </PageShell>
  );
}
