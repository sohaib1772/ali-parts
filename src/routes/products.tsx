import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Flame, ChevronLeft } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { ProductCard } from "@/components/product-card";
import { allProductsQuery } from "@/lib/queries";

export const Route = createFileRoute("/products")({
  loader: ({ context }) => context.queryClient.ensureQueryData(allProductsQuery()),
  head: () => ({
    meta: [
      { title: "المنتجات | الساير" },
      { name: "description", content: "تصفح جميع قطع الغيار المتوفرة في متجر الساير." },
    ],
  }),
  component: AllProductsPage,
});

function AllProductsPage() {
  const { data: products } = useSuspenseQuery(bestSellersQuery());

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
            <p className="text-[11px] text-muted-foreground">جميع المنتجات المتوفرة ({products.length})</p>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-16">
            لا توجد منتجات حالياً.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-8">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}