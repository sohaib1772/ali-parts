import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/page-shell";
import { ProductCard } from "@/components/product-card";
import { FilterBar } from "@/components/filter-bar";
import { productsByCategoryQuery, categoriesQuery } from "@/lib/queries";
import { useStorefrontFilters, applyStorefrontFilters, filterSearchSchema } from "@/lib/storefront-filters";

export const Route = createFileRoute("/category/$id")({
  validateSearch: filterSearchSchema,
  loader: ({ context, params }) => {
    context.queryClient.ensureQueryData(productsByCategoryQuery(params.id));
    context.queryClient.ensureQueryData(categoriesQuery());
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data: products } = useSuspenseQuery(productsByCategoryQuery(id));
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const cat = categories.find((c) => c.id === id);
  const { filters } = useStorefrontFilters();

  // The route path IS the category, so products are already category-scoped.
  // Apply the remaining filters (brand/model/search) with category neutralised.
  const filtered = applyStorefrontFilters(products, { ...filters, category: "" });

  return (
    <PageShell wide title={cat?.name_ar ?? "التصنيف"}>
      <div className="px-4 pt-4">
        <div className="mb-4">
          {/* Category dropdown reflects the current route and navigates on change. */}
          <FilterBar
            categoryOverride={{
              value: id,
              onChange: (newId) =>
                newId
                  ? navigate({ to: "/category/$id", params: { id: newId } })
                  : navigate({ to: "/products" }),
            }}
          />
        </div>
        <div className="text-xs text-muted-foreground mb-3">{filtered.length} منتج</div>
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm">لا توجد منتجات مطابقة في هذا التصنيف</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>
    </PageShell>
  );
}
