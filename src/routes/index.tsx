import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search, Hash, ChevronLeft, Sparkles, Flame } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { FloatingWhatsapp } from "@/components/floating-whatsapp";
import { ProductCard } from "@/components/product-card";
import { VehiclePicker, VehicleBar, getSavedVehicle, useSavedVehicle, filterProductsByVehicle } from "@/components/vehicle-picker";
import {
  bannersQuery,
  brandsQuery,
  carModelsQuery,
  categoriesQuery,
  dealsQuery,
  featuredProductsQuery,
} from "@/lib/queries";
import type { Banner } from "@/lib/queries";

export const Route = createFileRoute("/")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(categoriesQuery());
    context.queryClient.ensureQueryData(featuredProductsQuery());
    context.queryClient.ensureQueryData(dealsQuery());
    context.queryClient.ensureQueryData(bannersQuery());
    context.queryClient.ensureQueryData(brandsQuery());
    context.queryClient.ensureQueryData(carModelsQuery());
  },
  component: HomePage,
});

function HomePage() {
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const { data: featured } = useSuspenseQuery(featuredProductsQuery());
  const { data: deals } = useSuspenseQuery(dealsQuery());
  const { data: banners } = useSuspenseQuery(bannersQuery());
  const { data: models } = useSuspenseQuery(carModelsQuery());

  const vehicle = useSavedVehicle();
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    if (!getSavedVehicle()) {
      const t = setTimeout(() => setPickerOpen(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  const filteredDeals = filterProductsByVehicle(deals, vehicle);
  const dealIds = new Set(filteredDeals.slice(0, 4).map((p) => p.id));
  const filteredFeatured = filterProductsByVehicle(featured, vehicle).filter(
    (p) => !dealIds.has(p.id),
  );

  return (
    <PageShell>
      <SearchBar />

      <div className="px-4 mt-3">
        <VehicleBar onOpen={() => setPickerOpen(true)} />
      </div>

      {/* Hero banner */}
      <HeroCarousel banners={banners} />

      {/* Categories */}
      <Section title="التصنيفات" href="/categories">
        <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 pb-1">
          {categories.map((c) => (
            <Link
              key={c.id}
              to="/category/$id"
              params={{ id: c.id }}
              className="flex-shrink-0 w-20 flex flex-col items-center gap-2"
            >
              <div className="size-16 rounded-2xl bg-card border border-border shadow-card grid place-items-center text-2xl transition hover:border-gold hover:shadow-gold">
                <CategoryEmoji icon={c.icon} />
              </div>
              <span className="text-[11px] font-semibold text-center leading-tight">{c.name_ar}</span>
            </Link>
          ))}
        </div>
      </Section>

      {/* Popular Cars */}
      <Section title="السيارات الأكثر طلباً">
        <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 pb-1">
          {models.slice(0, 10).map((m) => (
            <Link
              key={m.id}
              to="/search"
              search={{ q: m.name_ar }}
              className="flex-shrink-0 px-4 py-3 rounded-2xl bg-gradient-navy text-primary-foreground shadow-card hover:shadow-luxe transition min-w-[110px] text-center"
            >
              <div className="text-xs text-gold/80 mb-0.5">شفروليه</div>
              <div className="text-sm font-bold">{m.name_ar}</div>
            </Link>
          ))}
        </div>
      </Section>

      {/* Deals */}
      {filteredDeals.length > 0 && (
        <Section title="عروض اليوم" icon={<Flame className="size-4 text-destructive" />}>
          <div className="grid grid-cols-2 gap-3 px-4">
            {filteredDeals.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </Section>
      )}

      {/* Featured */}
      <Section title="منتجات مميزة" icon={<Sparkles className="size-4 text-gold" />}>
        {vehicle && (
          <div className="px-4 mb-2">
            <div className="text-xs text-gold font-semibold">
              مُفلتر حسب: {vehicle.brandName} {vehicle.modelName} ({vehicle.year})
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 px-4">
          {filteredFeatured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
        {filteredFeatured.length === 0 && (
          <div className="px-4 text-center text-muted-foreground text-sm py-8">
            لا توجد منتجات متوافقة مع مركبتك. اختر مركبة أخرى أو تواصل معنا.
          </div>
        )}
      </Section>

      <div className="h-6" />
      <FloatingWhatsapp />
      <VehiclePicker open={pickerOpen} onOpenChange={setPickerOpen} />
    </PageShell>
  );
}

function SearchBar() {
  return (
    <div className="px-4 pt-3 space-y-2">
      <Link
        to="/search"
        className="flex items-center gap-2 bg-card border border-border rounded-2xl px-4 py-3 shadow-card"
      >
        <Search className="size-5 text-muted-foreground" />
        <span className="text-sm text-muted-foreground flex-1">ابحث عن قطعة، ماركة، أو رقم OEM…</span>
      </Link>
      <Link
        to="/search"
        search={{ mode: "oem" }}
        className="flex items-center gap-2 bg-gradient-navy text-primary-foreground rounded-2xl px-4 py-2.5 shadow-card"
      >
        <Hash className="size-4 text-gold" />
        <span className="text-xs font-semibold flex-1">البحث برقم OEM</span>
        <span className="text-[10px] text-gold">اضغط هنا</span>
      </Link>
    </div>
  );
}

function Section({ title, href, icon, children }: { title: string; href?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="px-4 flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-base font-extrabold">{title}</h2>
        {href && (
          <Link to={href} className="ms-auto text-xs font-semibold text-gold flex items-center gap-0.5">
            الكل <ChevronLeft className="size-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function CategoryEmoji({ icon }: { icon: string | null }) {
  const map: Record<string, string> = {
    engine: "⚙️",
    disc: "🛞",
    suspension: "🔩",
    zap: "⚡",
    filter: "🌀",
    droplet: "🛢️",
    car: "🚗",
    circle: "⭕",
  };
  return <span>{icon ? map[icon] ?? "🔧" : "🔧"}</span>;
}
