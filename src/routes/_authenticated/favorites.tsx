import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { ProductCard } from "@/components/product-card";
import { favoritesQuery } from "@/lib/queries";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/_authenticated/favorites")({
  component: FavoritesPage,
});

function FavoritesPage() {
  const { userId } = useAuth();
  const { data: favs = [] } = useQuery(favoritesQuery(userId));

  return (
    <PageShell title="المفضلة">
      <div className="px-4 pt-4">
        {favs.length === 0 ? (
          <div className="py-20 text-center">
            <div className="size-20 rounded-full bg-muted grid place-items-center mx-auto mb-4">
              <Heart className="size-10 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-bold mb-2">لا توجد مفضلات بعد</h2>
            <p className="text-sm text-muted-foreground mb-6">أضف منتجاتك المفضلة للعودة إليها لاحقاً</p>
            <Link to="/" className="inline-flex px-6 py-3 rounded-2xl bg-gradient-gold text-navy font-bold shadow-gold">تصفح المنتجات</Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {favs.map((f: any) => f.product && <ProductCard key={f.id} product={f.product} />)}
          </div>
        )}
      </div>
    </PageShell>
  );
}