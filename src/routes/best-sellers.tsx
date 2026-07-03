import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Flame, ChevronLeft, TrendingUp } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { ProductCard } from "@/components/product-card";
import { bestSellersQuery } from "@/lib/queries";

export const Route = createFileRoute("/best-sellers")({
  loader: ({ context }) => context.queryClient.ensureQueryData(bestSellersQuery()),
  head: () => ({
    meta: [
      { title: "الأكثر مبيعاً | الساير" },
      { name: "description", content: "أعلى قطع الغيار مبيعاً في متجر الساير حسب المبيعات الفعلية." },
      { property: "og:title", content: "الأكثر مبيعاً | الساير" },
      { property: "og:description", content: "أعلى قطع الغيار مبيعاً في متجر الساير." },
    ],
  }),
  component: BestSellersPage,
});

function BestSellersPage() {
  const { data: products } = useSuspenseQuery(bestSellersQuery());
  const sold = products.filter((p) => (p.sales_count ?? 0) > 0);
  const others = products.filter((p) => (p.sales_count ?? 0) === 0);

  return (
    <PageShell title="الأكثر مبيعاً">
      <div className="px-4 pt-3">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground mb-3">
          <ChevronLeft className="size-3.5 rotate-180" /> الرئيسية
        </Link>
        <div className="flex items-center gap-3 mb-4 p-3 rounded-2xl bg-destructive/10 border border-destructive/20">
          <div className="size-10 rounded-xl bg-destructive/20 border border-destructive/30 grid place-items-center">
            <Flame className="size-5 text-destructive" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-extrabold leading-tight">الأكثر مبيعاً</h1>
            <p className="text-[11px] text-muted-foreground">مرتبة حسب المبيعات الفعلية</p>
          </div>
        </div>

        {sold.length > 0 && (
          <>
            <div className="flex items-center gap-1.5 mb-3">
              <TrendingUp className="size-4 text-gold" />
              <h2 className="text-sm font-extrabold">الأعلى مبيعاً ({sold.length})</h2>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {sold.map((p, i) => (
                <div key={p.id} className="relative">
                  {i < 3 && (
                    <div className="absolute -top-1 -start-1 z-10 size-7 rounded-full bg-gradient-gold text-navy text-xs font-black grid place-items-center shadow-gold border-2 border-card">
                      {i + 1}
                    </div>
                  )}
                  <div className="absolute top-2 end-2 z-10 px-2 py-0.5 rounded-full bg-navy/90 text-primary-foreground text-[10px] font-bold">
                    بيع {p.sales_count}×
                  </div>
                  <ProductCard product={p} />
                </div>
              ))}
            </div>
          </>
        )}

        {others.length > 0 && (
          <>
            <h2 className="text-sm font-extrabold mb-3">منتجات أخرى</h2>
            <div className="grid grid-cols-2 gap-3 pb-8">
              {others.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </>
        )}

        {products.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-16">
            لا توجد منتجات حالياً.
          </div>
        )}
      </div>
    </PageShell>
  );
}