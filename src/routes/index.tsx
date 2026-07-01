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

  const filteredFeatured = filterProductsByVehicle(featured, vehicle);
  const filteredDeals = filterProductsByVehicle(deals, vehicle);

  return (
    <PageShell>
      <SearchBar />

      <div className="px-4 mt-3">
        <VehicleBar onOpen={() => setPickerOpen(true)} />
      </div>

      {/* Hero banner */}
      <div className="px-4 mt-4">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-hero text-primary-foreground p-5 shadow-luxe">
          <div className="absolute -top-10 -end-10 size-40 rounded-full bg-gold/20 blur-2xl" />
          <div className="absolute -bottom-16 -start-8 size-40 rounded-full bg-gold/10 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gold bg-gold/10 border border-gold/30 rounded-full px-3 py-1 mb-3">
              <Sparkles className="size-3.5" /> قطع أصلية ١٠٠٪
            </div>
            <h1 className="text-2xl font-black leading-tight mb-1">
              قطع غيار <span className="text-gold">شفروليه</span> و<span className="text-gold">GMC</span> و<span className="text-gold">كاديلاك</span>
            </h1>
            <p className="text-sm text-primary-foreground/80 mb-4">توصيل سريع لجميع محافظات العراق</p>
            <Link
              to="/search"
              className="inline-flex items-center gap-2 bg-gradient-gold text-navy font-bold text-sm px-4 py-2.5 rounded-xl shadow-gold hover:brightness-105 transition"
            >
              <Search className="size-4" /> ابحث الآن
            </Link>
          </div>
          {banners[0] && (
            <div className="mt-4 text-xs text-gold/90">{banners[0].subtitle_ar}</div>
          )}
        </div>
      </div>

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
      {deals.length > 0 && (
        <Section title="عروض اليوم" icon={<Flame className="size-4 text-destructive" />}>
          <div className="grid grid-cols-2 gap-3 px-4">
            {deals.slice(0, 4).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </Section>
      )}

      {/* Featured */}
      <Section title="منتجات مميزة" icon={<Sparkles className="size-4 text-gold" />}>
        <div className="grid grid-cols-2 gap-3 px-4">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
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
