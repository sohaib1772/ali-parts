import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { Shield, Truck, Award, Users } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [{ title: "من نحن — Ali Parts" }, { name: "description", content: "تعرّف على Ali Parts، وجهتك الأولى لقطع غيار السيارات الأصلية في العراق." }],
  }),
  component: AboutPage,
});

function AboutPage() {
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
          <h1 className="text-2xl font-black mb-3">Ali Parts</h1>
          <p className="text-sm text-primary-foreground/80 leading-relaxed">
            متجر متخصص في بيع قطع غيار سيارات شفروليه، GMC، وكاديلاك الأصلية داخل العراق.
            نلتزم بتوفير قطع عالية الجودة مع خدمة عملاء متميزة وتوصيل سريع.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          {items.map((it) => (
            <div key={it.title} className="bg-card rounded-2xl border border-border p-4 shadow-card">
              <div className="size-10 rounded-xl bg-gold/10 text-gold grid place-items-center mb-2"><it.icon className="size-5" /></div>
              <div className="text-sm font-bold">{it.title}</div>
              <div className="text-xs text-muted-foreground mt-1">{it.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}