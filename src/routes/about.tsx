import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { Shield, Truck, Award, Users, Clock, Gem, BadgeCheck, MapPin, Store } from "lucide-react";
import { useSetting } from "@/lib/admin";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "من نحن — Ali Parts" },
      { name: "description", content: "تعرّف على Ali Parts، وجهتك الأولى لقطع غيار السيارات الأصلية في العراق." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  const storeName = useSetting("store_name", "Ali Parts");
  const aboutText = useSetting(
    "store_about",
    "متجر متخصص في بيع قطع غيار سيارات شفروليه، GMC، وكاديلاك الأصلية داخل العراق. نلتزم بتوفير قطع عالية الجودة مع خدمة عملاء متميزة وتوصيل سريع.",
  );
  const storeAddress = useSetting("store_address", "");
  const locationLink = useSetting("store_location_link", "");
  const storeFrontImage = useSetting("store_front_image", "");
  const years = useSetting("store_years", "7");

  const items = [
    { icon: Shield, title: "قطع أصلية 100%", desc: "نضمن أصالة كل قطعة نبيعها" },
    { icon: Truck, title: "توصيل سريع", desc: "لكل محافظات العراق" },
    { icon: Award, title: "خبرة موثوقة", desc: "سنوات في مجال قطع الغيار" },
    { icon: Users, title: "خدمة عملاء 7/24", desc: "دائماً بجانبك عبر واتساب" },
  ];

  return (
    <PageShell title="من نحن">
      <div className="px-4 pt-4">
        <div className="bg-gradient-hero text-primary-foreground rounded-3xl p-6 shadow-luxe">
          <h1 className="text-2xl font-black mb-3">{storeName}</h1>
          <p className="text-sm text-primary-foreground/80 leading-relaxed whitespace-pre-line">{aboutText}</p>
        </div>

        {/* Highlights */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          {[
            { icon: Clock, title: `${years}+ سنوات خبرة`, desc: "في سوق قطع غيار السيارات" },
            { icon: Gem, title: "جودة عالية", desc: "قطع أصلية ومكافئة للمواصفات" },
            { icon: BadgeCheck, title: "ضمان حقيقي", desc: "ضمان على كل قطعة تشريها" },
            { icon: Store, title: "موقع متميز", desc: storeAddress || "محلنا جاهز لاستقبالك" },
          ].map((it) => (
            <div key={it.title} className="bg-card rounded-2xl border border-border p-4 shadow-card">
              <div className="size-10 rounded-xl bg-gold/10 text-gold grid place-items-center mb-2">
                <it.icon className="size-5" />
              </div>
              <div className="text-sm font-bold">{it.title}</div>
              <div className="text-xs text-muted-foreground mt-1">{it.desc}</div>
            </div>
          ))}
        </div>

        {/* Storefront image */}
        <div className="mt-4">
          <div className="text-sm font-bold mb-2 flex items-center gap-2">
            <Store className="size-4 text-gold" /> واجهة المحل
          </div>
          {storeFrontImage ? (
            <div className="rounded-3xl overflow-hidden border border-border shadow-card">
              <img src={storeFrontImage} alt="واجهة المحل" className="w-full aspect-video object-cover" />
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-muted h-40 grid place-items-center text-muted-foreground text-sm">
              لم يتم إضافة صورة واجهة المحل بعد
            </div>
          )}
        </div>

        {/* Location */}
        <div className="mt-4 bg-card rounded-2xl border border-border p-4 shadow-card">
          <div className="flex items-center gap-2 mb-2">
            <div className="size-10 rounded-xl bg-gold/10 text-gold grid place-items-center">
              <MapPin className="size-5" />
            </div>
            <div className="text-sm font-bold">موقع المحل</div>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{storeAddress || "—"}</p>
          {locationLink && (
            <a
              href={locationLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 bg-navy text-primary-foreground text-xs font-bold px-4 py-2 rounded-xl"
            >
              <MapPin className="size-3.5" /> فتح الموقع على الخريطة
            </a>
          )}
        </div>

        {/* Values */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          {items.map((it) => (
            <div key={it.title} className="bg-card rounded-2xl border border-border p-4 shadow-card">
              <div className="size-10 rounded-xl bg-gold/10 text-gold grid place-items-center mb-2">
                <it.icon className="size-5" />
              </div>
              <div className="text-sm font-bold">{it.title}</div>
              <div className="text-xs text-muted-foreground mt-1">{it.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
