import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search, ChevronLeft, Sparkles, Flame, CircleDot } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { FloatingWhatsapp } from "@/components/floating-whatsapp";
import { ProductCard } from "@/components/product-card";
import { VehiclePicker, VehicleBar, getSavedVehicle, useSavedVehicle, filterProductsByVehicle } from "@/components/vehicle-picker";
import {
  bannersQuery,
  brandsQuery,
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
  },
  component: HomePage,
});

function HomePage() {
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const { data: featured } = useSuspenseQuery(featuredProductsQuery());
  const { data: deals } = useSuspenseQuery(dealsQuery());
  const { data: banners } = useSuspenseQuery(bannersQuery());

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
      <div className="px-4 mt-3">
        <VehicleBar onOpen={() => setPickerOpen(true)} />
      </div>

      {/* Hero banner */}
      <HeroCarousel banners={banners} />

      {/* Categories — square illustrated cards */}
      <Section title="الأقسام" href="/categories" icon={<CircleDot className="size-4 text-gold" />}>
        <div className="grid grid-cols-3 gap-3 px-4">
          {categories.map((c, i) => (
            <Link
              key={c.id}
              to="/category/$id"
              params={{ id: c.id }}
              className="group flex flex-col items-center gap-2.5 p-3 rounded-2xl bg-card border border-border/60 shadow-card hover:shadow-luxe hover:-translate-y-0.5 transition-all active:scale-95"
            >
              <div className="w-full aspect-square rounded-xl bg-gradient-to-br from-muted/80 to-background flex items-center justify-center overflow-hidden">
                <CategoryIcon category={c} index={i} />
              </div>
              <span className="text-[11px] font-bold text-center leading-tight text-foreground line-clamp-2 min-h-[2rem] flex items-center justify-center">{c.name_ar}</span>
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

function categoryBg(index: number) {
  const styles = [
    "bg-gradient-to-br from-amber-50 to-amber-100 text-amber-600",
    "bg-gradient-to-br from-rose-50 to-rose-100 text-rose-600",
    "bg-gradient-to-br from-slate-50 to-slate-100 text-slate-600",
    "bg-gradient-to-br from-yellow-50 to-yellow-100 text-yellow-600",
    "bg-gradient-to-br from-sky-50 to-sky-100 text-sky-600",
    "bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600",
    "bg-gradient-to-br from-indigo-50 to-indigo-100 text-indigo-600",
    "bg-gradient-to-br from-orange-50 to-orange-100 text-orange-600",
    "bg-gradient-to-br from-violet-50 to-violet-100 text-violet-600",
    "bg-gradient-to-br from-teal-50 to-teal-100 text-teal-600",
  ];
  return styles[index % styles.length];
}

function CategoryIcon({ category, index }: { category: { id: string; name_ar: string; icon: string | null; image_url: string | null }; index: number }) {
  if (category.image_url) {
    return (
      <img
        src={category.image_url}
        alt={category.name_ar}
        className="w-full h-full object-contain p-3 transition-transform group-hover:scale-105"
        loading="lazy"
      />
    );
  }

  const key = category.icon?.toLowerCase() ?? "";
  const emojiMap: Record<string, React.ReactNode> = {
    engine: <span className="text-4xl drop-shadow-sm">⚙️</span>,
    disc: <span className="text-4xl drop-shadow-sm">🛞</span>,
    brake: <span className="text-4xl drop-shadow-sm">🛞</span>,
    braking: <span className="text-4xl drop-shadow-sm">🛞</span>,
    suspension: <span className="text-4xl drop-shadow-sm">🔩</span>,
    zap: <span className="text-4xl drop-shadow-sm">⚡</span>,
    electrical: <span className="text-4xl drop-shadow-sm">⚡</span>,
    electronics: <span className="text-4xl drop-shadow-sm">🔋</span>,
    filter: <span className="text-4xl drop-shadow-sm">🌀</span>,
    filters: <span className="text-4xl drop-shadow-sm">🌀</span>,
    oil: <span className="text-4xl drop-shadow-sm">🛢️</span>,
    droplet: <span className="text-4xl drop-shadow-sm">🛢️</span>,
    car: <span className="text-4xl drop-shadow-sm">🚗</span>,
    body: <span className="text-4xl drop-shadow-sm">🚙</span>,
    circle: <span className="text-4xl drop-shadow-sm">⭕</span>,
    tire: <span className="text-4xl drop-shadow-sm">🛞</span>,
    wheel: <span className="text-4xl drop-shadow-sm">🛞</span>,
    wiper: <span className="text-4xl drop-shadow-sm">🌧️</span>,
    windshield: <span className="text-4xl drop-shadow-sm">🌧️</span>,
    gift: <span className="text-4xl drop-shadow-sm">🎁</span>,
    offer: <span className="text-4xl drop-shadow-sm">🎁</span>,
    deal: <span className="text-4xl drop-shadow-sm">🎁</span>,
    tool: <span className="text-4xl drop-shadow-sm">🛠️</span>,
    tools: <span className="text-4xl drop-shadow-sm">🛠️</span>,
    gear: <span className="text-4xl drop-shadow-sm">⚙️</span>,
    battery: <span className="text-4xl drop-shadow-sm">🔋</span>,
    light: <span className="text-4xl drop-shadow-sm">💡</span>,
    lights: <span className="text-4xl drop-shadow-sm">💡</span>,
    radiator: <span className="text-4xl drop-shadow-sm">❄️</span>,
    cooling: <span className="text-4xl drop-shadow-sm">❄️</span>,
  };

  return (
    <div className={`w-full h-full flex items-center justify-center ${categoryBg(index)}`}>
      {emojiMap[key] ?? <span className="text-4xl drop-shadow-sm">🔧</span>}
    </div>
  );
}

function HeroCarousel({ banners }: { banners: Banner[] }) {
  const [idx, setIdx] = useState(0);
  const slides = banners.length > 0 ? banners : null;

  useEffect(() => {
    if (!slides || slides.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 4500);
    return () => clearInterval(t);
  }, [slides]);

  if (!slides) {
    return (
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
        </div>
      </div>
    );
  }

  const current = slides[idx];
  const content = (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-hero text-primary-foreground shadow-luxe aspect-[16/10]">
      {slides.map((b, i) => (
        <img
          key={b.id}
          src={b.image_url}
          alt={b.title_ar ?? ""}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${i === idx ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/40 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-4">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gold bg-gold/10 border border-gold/30 rounded-full px-3 py-1 mb-2">
          <Sparkles className="size-3.5" /> قطع أصلية ١٠٠٪
        </div>
        {current.title_ar && (
          <h1 className="text-xl font-black leading-tight mb-1 text-primary-foreground">{current.title_ar}</h1>
        )}
        {current.subtitle_ar && (
          <p className="text-xs text-primary-foreground/85 mb-2">{current.subtitle_ar}</p>
        )}
        {slides.length > 1 && (
          <div className="flex gap-1.5 mt-2">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIdx(i); }}
                aria-label={`slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-6 bg-gold" : "w-1.5 bg-white/40"}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="px-4 mt-4">
      {current.link ? (
        <a href={current.link}>{content}</a>
      ) : (
        content
      )}
    </div>
  );
}
