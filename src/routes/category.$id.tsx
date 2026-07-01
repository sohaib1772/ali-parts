import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/page-shell";
import { ProductCard } from "@/components/product-card";
import { productsByCategoryQuery, categoriesQuery } from "@/lib/queries";
import { useSavedVehicle, filterProductsByVehicle } from "@/components/vehicle-picker";

export const Route = createFileRoute("/category/$id")({
  loader: ({ context, params }) => {
    context.queryClient.ensureQueryData(productsByCategoryQuery(params.id));
    context.queryClient.ensureQueryData(categoriesQuery());
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { id } = Route.useParams();
  const { data: products } = useSuspenseQuery(productsByCategoryQuery(id));
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const cat = categories.find((c) => c.id === id);
  const vehicle = useSavedVehicle();
  const filtered = filterProductsByVehicle(products, vehicle);

  return (
    <PageShell title={cat?.name_ar ?? "التصنيف"}>
      <div className="px-4 pt-4">
        {vehicle && (
          <div className="text-xs text-gold font-semibold mb-2">
            مُفلتر حسب: {vehicle.brandName} {vehicle.modelName} ({vehicle.year})
          </div>
        )}
        <div className="text-xs text-muted-foreground mb-3">{filtered.length} منتج</div>
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm">لا توجد منتجات متوافقة مع مركبتك في هذا التصنيف</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </PageShell>
  );
}