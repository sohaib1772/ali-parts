import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Search as SearchIcon, Hash } from "lucide-react";
import { z } from "zod";
import { PageShell } from "@/components/page-shell";
import { ProductCard } from "@/components/product-card";
import { searchProductsQuery } from "@/lib/queries";
import { useSavedVehicle, filterProductsByVehicle } from "@/components/vehicle-picker";

const searchSchema = z.object({
  q: z.string().optional(),
  mode: z.enum(["oem"]).optional(),
});

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "البحث — Ali Parts" }] }),
  component: SearchPage,
});

function SearchPage() {
  const { q: initialQ, mode } = Route.useSearch();
  const [q, setQ] = useState(initialQ ?? "");
  const { data: results, isFetching } = useQuery(searchProductsQuery(q));
  const vehicle = useSavedVehicle();
  const filtered = filterProductsByVehicle(results ?? [], vehicle);

  return (
    <PageShell title="بحث">
      <div className="px-4 pt-4">
        <label className="flex items-center gap-2 bg-card border border-border rounded-2xl px-4 py-3 shadow-card focus-within:border-gold">
          {mode === "oem" ? <Hash className="size-5 text-gold" /> : <SearchIcon className="size-5 text-muted-foreground" />}
          <input
            autoFocus
            placeholder={mode === "oem" ? "أدخل رقم OEM…" : "ابحث عن قطعة، ماركة، رقم OEM…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
          />
        </label>
      </div>

      <div className="mt-5 px-4">
        {!q.trim() ? (
          <div className="text-center text-muted-foreground text-sm py-16">
            ابدأ بكتابة اسم القطعة أو رقمها للبحث
          </div>
        ) : isFetching ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton rounded-2xl aspect-[3/4]" />
            ))}
          </div>
        ) : results && results.length > 0 ? (
          <>
            <div className="text-xs text-muted-foreground mb-3">{results.length} نتيجة</div>
            <div className="grid grid-cols-2 gap-3">
              {results.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          </>
        ) : (
          <div className="text-center text-muted-foreground text-sm py-16">
            لا توجد نتائج مطابقة. جرّب كلمات أخرى أو تواصل معنا عبر واتساب.
          </div>
        )}
      </div>
    </PageShell>
  );
}