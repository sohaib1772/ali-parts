import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { ProductCard } from "@/components/product-card";
import { FilterBar } from "@/components/filter-bar";
import { favoritesQuery } from "@/lib/queries";
import type { Product } from "@/lib/queries";
import { useStorefrontFilters, applyStorefrontFilters, filterSearchSchema } from "@/lib/storefront-filters";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/favorites")({
  validateSearch: filterSearchSchema,
  component: FavoritesPage,
});

function FavoritesPage() {
  const { userId } = useAuth();
  const { data: favs = [] } = useQuery(favoritesQuery(userId));
  const { filters } = useStorefrontFilters();
  const favProducts = (favs as { id: string; product: Product | null }[])
    .filter((f) => f.product)
    .map((f) => f.product as Product);
  const filtered = applyStorefrontFilters(favProducts, filters);

  return (
    <PageShell wide title="المفضلة">
      <div className="px-4 pt-4">
        {favs.length > 0 && (
          <div className="mb-4">
            <FilterBar />
          </div>
        )}
        {favs.length === 0 ? (
          <div className="py-20 text-center">
            <div className="size-20 rounded-full bg-muted grid place-items-center mx-auto mb-4">
              <Heart className="size-10 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-bold mb-2">لا توجد مفضلات بعد</h2>
            <p className="text-sm text-muted-foreground mb-6">أضف منتجاتك المفضلة للعودة إليها لاحقاً</p>
            <Link to="/" className="inline-flex px-6 py-3 rounded-2xl bg-gradient-gold text-navy font-bold shadow-gold">تصفح المنتجات</Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-16">
            لا توجد مفضلات مطابقة للفلتر الحالي.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </PageShell>
  );
}