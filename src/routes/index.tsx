import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Search, ChevronLeft, Sparkles, CircleDot, Timer, Flame, Volume2, VolumeX, X } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { PageShell } from "@/components/page-shell";
import { FloatingWhatsapp } from "@/components/floating-whatsapp";
import { ProductCard } from "@/components/product-card";
import { VehiclePicker, VehicleBar, useSavedVehicle, filterProductsByVehicle } from "@/components/vehicle-picker";
import {
  bannersQuery,
  brandsQuery,
  categoriesQuery,
  dealsQuery,
  featuredProductsQuery,
  bestSellersQuery,
} from "@/lib/queries";
import type { Banner, Product } from "@/lib/queries";
import { formatIQD } from "@/lib/format";

export const Route = createFileRoute("/")({
  loader: ({ context }) => {
    context.queryClient.ensureQueryData(categoriesQuery());
    context.queryClient.ensureQueryData(featuredProductsQuery());
    context.queryClient.ensureQueryData(dealsQuery());
    context.queryClient.ensureQueryData(bannersQuery());
    context.queryClient.ensureQueryData(brandsQuery());
    context.queryClient.ensureQueryData(bestSellersQuery());
  },
  component: HomePage,
});

function HomePage() {
  const { data: categories } = useSuspenseQuery(categoriesQuery());
  const { data: featured } = useSuspenseQuery(featuredProductsQuery());
  const { data: deals } = useSuspenseQuery(dealsQuery());
  const { data: banners } = useSuspenseQuery(bannersQuery());
  const { data: bestSellers } = useSuspenseQuery(bestSellersQuery());

  const vehicle = useSavedVehicle();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mountedVehicle, setMountedVehicle] = useState(false);
  useEffect(() => { setMountedVehicle(true); }, []);
  useEffect(() => {
    if (mountedVehicle && !vehicle) setPickerOpen(true);
  }, [mountedVehicle, vehicle]);

  const filteredDeals = filterProductsByVehicle(deals, vehicle);
  const dealIds = new Set(filteredDeals.slice(0, 4).map((p) => p.id));
  const filteredFeatured = filterProductsByVehicle(featured, vehicle).filter(
    (p) => !dealIds.has(p.id),
  );
  const filteredBestSellers = filterProductsByVehicle(bestSellers, vehicle);

  return (
    <PageShell>
      <div className="px-4 mt-3">
        <VehicleBar onOpen={() => setPickerOpen(true)} />
      </div>

      {/* Hero banner */}
      <HeroCarousel banners={banners} />

      {/* Categories — square illustrated cards */}
      <Section title="الأقسام" icon={<CircleDot className="size-4 text-gold" />}>
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

      {/* Limited-time offers — auto-scrolling carousel */}
      {filteredDeals.length > 0 && (
        <LimitedOffers deals={filteredDeals} />
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

      {/* Best Sellers — all products */}
      {filteredBestSellers.length > 0 && (
        <Section
          title="الأكثر مبيعاً"
          icon={<Flame className="size-4 text-destructive" />}
          href="/best-sellers"
        >
          <div className="grid grid-cols-2 gap-3 px-4">
            {filteredBestSellers.slice(0, 6).map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </Section>
      )}

      <div className="h-6" />
      <FloatingWhatsapp />
      <VehiclePicker open={pickerOpen} onOpenChange={setPickerOpen} mandatory={!vehicle} />
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
        className="w-full h-full object-cover transition-transform group-hover:scale-105"
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
  const [muted, setMuted] = useState(true);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const slides = banners.length > 0 ? banners : null;
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);

  const handleVideoClick = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    const b = slides?.[i];
    if (!b || !(b as any).video_url) return;
    setMuted(false);
    const el = videoRefs.current[i];
    if (el) {
      el.muted = false;
      el.volume = 1;
      const p = el.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => setExpandedVideo((b as any).video_url));
      } else {
        setExpandedVideo((b as any).video_url);
      }
    } else {
      setExpandedVideo((b as any).video_url);
    }
  };

  // Keep the DOM element in sync when muted state or the active slide changes.
  // Setting the `muted` property + calling play() imperatively is the only
  // reliable way to unmute after autoplay across mobile browsers.
  useEffect(() => {
    videoRefs.current.forEach((el, i) => {
      if (!el) return;
      const isActive = i === idx;
      el.muted = !isActive || muted;
      if (isActive) {
        el.currentTime = el.currentTime; // no-op, keeps position
        const p = el.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } else {
        el.pause();
      }
    });
  }, [idx, muted, slides]);

  useEffect(() => {
    if (!slides || slides.length <= 1) return;
    // Pause the auto-rotation while a video slide is playing with sound
    // so the user can hear it. Silent slides keep rotating.
    const current = slides[idx];
    const hasAudibleVideo = !!(current as any)?.video_url && !muted;
    if (hasAudibleVideo) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % slides.length), 3500);
    return () => clearInterval(t);
  }, [slides, idx, muted]);

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
        (b as any).video_url ? (
          <video
            key={b.id}
            ref={(el) => { videoRefs.current[i] = el; }}
            src={(b as any).video_url}
            poster={b.image_url || undefined}
            autoPlay
            muted={muted || i !== idx}
            loop
            playsInline
            preload="metadata"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${i === idx ? "opacity-100" : "opacity-0"}`}
          />
        ) : (
          <img
            key={b.id}
            src={b.image_url}
            alt={b.title_ar ?? ""}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${i === idx ? "opacity-100" : "opacity-0"}`}
          />
        )
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-navy/90 via-navy/40 to-transparent" />
      {(current as any).video_url && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setMuted((m) => {
              const next = !m;
              const el = videoRefs.current[idx];
              if (el) {
                el.muted = next;
                if (!next) {
                  el.volume = 1;
                  const p = el.play();
                  if (p && typeof p.catch === "function") p.catch(() => {});
                }
              }
              return next;
            });
          }}
          aria-label={muted ? "تشغيل الصوت" : "كتم الصوت"}
          className="absolute top-3 end-3 size-9 rounded-full bg-black/45 backdrop-blur-md text-white grid place-items-center border border-white/20 hover:bg-black/60 transition"
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
      )}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <Link
          to="/offers"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gold bg-gold/10 border border-gold/30 rounded-full px-3 py-1 mb-2 hover:bg-gold/20 transition"
        >
          <Sparkles className="size-3.5" /> عروض حصرية · شاهد الكل
        </Link>
        {current.expires_at && (
          <div className="mb-2">
            <Countdown to={current.expires_at} />
          </div>
        )}
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

function Countdown({ to }: { to: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, target - now);
  if (diff <= 0) return null;
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const Box = ({ v, l }: { v: number; l: string }) => (
    <div className="flex flex-col items-center px-2 py-1 rounded-lg bg-gold/20 border border-gold/40 min-w-[38px]">
      <span className="text-sm font-black text-gold leading-none tabular-nums">{String(v).padStart(2, "0")}</span>
      <span className="text-[8px] text-gold/80 mt-0.5">{l}</span>
    </div>
  );
  return (
    <div className="inline-flex items-center gap-1.5" dir="ltr">
      {d > 0 && <Box v={d} l="يوم" />}
      <Box v={h} l="ساعة" />
      <Box v={m} l="دقيقة" />
      <Box v={sec} l="ثانية" />
    </div>
  );
}

function MiniCountdown({ to }: { to: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, target - now);
  if (diff <= 0) return null;
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const label = d > 0 ? `${d}ي ${h}س` : `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold shadow-sm" dir="ltr">
      <Timer className="size-3" />
      <span className="tabular-nums">{label}</span>
    </div>
  );
}

function LimitedOffers({ deals }: { deals: Product[] }) {
  const [emblaRef, embla] = useEmblaCarousel(
    { loop: true, align: "start", direction: "rtl" },
    [Autoplay({ delay: 3500, stopOnInteraction: false, stopOnMouseEnter: true })],
  );
  const [selected, setSelected] = useState(0);
  const [snaps, setSnaps] = useState<number[]>([]);

  useEffect(() => {
    if (!embla) return;
    const onSelect = () => setSelected(embla.selectedScrollSnap());
    setSnaps(embla.scrollSnapList());
    embla.on("select", onSelect);
    embla.on("reInit", () => setSnaps(embla.scrollSnapList()));
    onSelect();
  }, [embla]);

  return (
    <section className="mt-6 mx-4 rounded-3xl bg-card border border-border/60 shadow-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <div className="size-10 rounded-xl bg-gold/15 border border-gold/30 grid place-items-center">
          <Timer className="size-5 text-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-extrabold leading-tight">عروض لفترة محدودة</h2>
          <p className="text-[11px] text-muted-foreground">أسعار خاصة لفترة قصيرة</p>
        </div>
        <Link to="/deals" className="text-xs font-semibold text-gold flex items-center gap-0.5">
          عرض الكل <ChevronLeft className="size-3.5" />
        </Link>
      </div>
      <div className="border-t border-border/60" />

      <div className="relative">
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex">
            {deals.map((p) => (
              <div key={p.id} className="shrink-0 grow-0 basis-1/2 p-3">
                <OfferCard product={p} />
              </div>
            ))}
          </div>
        </div>
        {embla && snaps.length > 1 && (
          <>
            <button
              aria-label="السابق"
              onClick={() => embla.scrollPrev()}
              className="absolute top-1/2 -translate-y-1/2 start-2 size-9 rounded-full bg-card border border-border shadow-card grid place-items-center hover:bg-gold hover:text-navy transition"
            >
              <ChevronLeft className="size-4 rotate-180" />
            </button>
            <button
              aria-label="التالي"
              onClick={() => embla.scrollNext()}
              className="absolute top-1/2 -translate-y-1/2 end-2 size-9 rounded-full bg-card border border-border shadow-card grid place-items-center hover:bg-gold hover:text-navy transition"
            >
              <ChevronLeft className="size-4" />
            </button>
          </>
        )}
      </div>

      {snaps.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-4 pt-1">
          {snaps.map((_, i) => (
            <button
              key={i}
              onClick={() => embla?.scrollTo(i)}
              aria-label={`slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === selected ? "w-6 bg-gold" : "w-1.5 bg-muted-foreground/30"}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function OfferCard({ product }: { product: Product }) {
  const img = product.images?.[0];
  return (
    <Link
      to="/product/$id"
      params={{ id: product.id }}
      className="group flex flex-col rounded-2xl bg-card border border-border/60 overflow-hidden hover:shadow-luxe transition-all"
    >
      <div className="relative aspect-square bg-muted overflow-hidden">
        {img ? (
          <img src={img} alt={product.name_ar} loading="lazy" className="size-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="size-full grid place-items-center text-4xl opacity-30">⚙️</div>
        )}
        {product.deal_expires_at && (
          <div className="absolute top-2 start-2">
            <MiniCountdown to={product.deal_expires_at} />
          </div>
        )}
        {!product.in_stock && (
          <div className="absolute inset-0 bg-navy/60 grid place-items-center">
            <span className="px-2 py-0.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">غير متوفر</span>
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2">
        <h3 className="text-sm font-semibold line-clamp-2 leading-tight min-h-[2.5rem]">{product.name_ar}</h3>
        <div className="flex items-center justify-between gap-2">
          <span className="text-base font-extrabold text-navy">{formatIQD(product.price_iqd)}</span>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-muted text-foreground/80 group-hover:bg-gold group-hover:text-navy transition">
            عرض التفاصيل
          </span>
        </div>
      </div>
    </Link>
  );
}
